import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { getJSON } from "@/lib/redis";
import { GET } from "@/app/api/books/search/route";
import { POST } from "@/app/api/books/add/route";

// ------------------------------------------------------------------
// GET /api/books/search
// ------------------------------------------------------------------

describe("GET /api/books/search", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  function makeReq(q: string) {
    return new NextRequest(`http://localhost/api/books/search?q=${encodeURIComponent(q)}`);
  }

  function makeReqWithSource(q: string, source: "local" | "openlibrary") {
    return new NextRequest(`http://localhost/api/books/search?q=${encodeURIComponent(q)}&source=${source}`);
  }

  describe("authentication", () => {
    it("returns 401 when not authenticated", async () => {
      vi.mocked(auth.api.getSession).mockResolvedValueOnce(null);
      const res = await GET(makeReq("dune"));
      expect(res.status).toBe(401);
    });
  });

  describe("input validation", () => {
    it("returns 400 when q is missing", async () => {
      const req = new NextRequest("http://localhost/api/books/search");
      const res = await GET(req);
      expect(res.status).toBe(400);
    });

    it("returns 400 when q is empty", async () => {
      const res = await GET(makeReq("   "));
      expect(res.status).toBe(400);
    });

    it("returns 400 when q exceeds 200 characters", async () => {
      const res = await GET(makeReq("x".repeat(201)));
      expect(res.status).toBe(400);
    });
  });

  describe("local DB cache hit", () => {
    it("returns local results without calling Open Library when DB has at least 5 relevant results", async () => {
      // Route uses db.execute() for raw FTS+trigram SQL.
      // Needs >= 5 relevant rows to take the local-only path for non-ambiguous queries.
      vi.mocked(db.execute).mockResolvedValueOnce(
        Array.from({ length: 5 }, (_, i) => ({
          id: `book-${i + 1}`,
          olKey: i === 0 ? "/works/OL1" : null,
          title: i === 0 ? "Words of Radiance" : `Words of Radiance Result ${i + 1}`,
          author: "Brandon Sanderson",
          coverUrl: null,
          publishedYear: 2014 + i,
          combinedScore: 0.9 - i * 0.01,
        })),
      ).mockResolvedValueOnce([
        { bookId: "book-1", readingStatus: "READING" },
      ]);
      const res = await GET(makeReq("words of radiance"));
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.source).toBe("local");
      expect(data.shouldQueryOpenLibrary).toBe(false);
      expect(data.results[0].title).toBe("Words of Radiance");
      expect(data.results[0].readingStatus).toBe("READING");
      expect(vi.mocked(fetch)).not.toHaveBeenCalled();
    });

    it("uses cached global local search results and hydrates current user status", async () => {
      vi.mocked(getJSON).mockResolvedValueOnce([
        { id: "book-1", olKey: "/works/OL1", title: "Words of Radiance", author: "Brandon Sanderson", coverUrl: null, publishedYear: 2014, combinedScore: 0.9 },
      ]);
      vi.mocked(db.execute).mockResolvedValueOnce([
        { bookId: "book-1", readingStatus: "READING" },
      ]);

      const res = await GET(makeReqWithSource("words of radiance", "local"));

      expect(res.status).toBe(200);
      expect(db.execute).toHaveBeenCalledTimes(1);
      const data = await res.json();
      expect(data.results[0]).toMatchObject({
        title: "Words of Radiance",
        readingStatus: "READING",
      });
    });
  });

  describe("Open Library fallback", () => {
    it("calls Open Library when local DB has fewer than 10 results", async () => {
      vi.mocked(db.execute).mockResolvedValueOnce([
        { id: "book-1", olKey: "/works/OL1", title: "Dune", author: "Frank Herbert", coverUrl: null, publishedYear: 1965, combinedScore: 0.9 },
        { id: "book-2", olKey: null, title: "Dune Messiah", author: "Frank Herbert", coverUrl: null, publishedYear: 1969, combinedScore: 0.7 },
        { id: "book-3", olKey: null, title: "Children of Dune", author: "Frank Herbert", coverUrl: null, publishedYear: 1976, combinedScore: 0.5 },
      ]);
      vi.mocked(fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          docs: [
            { key: "/works/OL1", title: "Dune", author_name: ["Frank Herbert"], cover_i: null, first_publish_year: 1965 },
            { key: "/works/OL2", title: "Dune: House Atreides", author_name: ["Brian Herbert"], cover_i: null, first_publish_year: 1999 },
          ],
        }),
      });

      const res = await GET(makeReq("dune"));

      expect(res.status).toBe(200);
      expect(vi.mocked(fetch)).toHaveBeenCalled();
      const data = await res.json();
      expect(data.source).toBe("mixed");
      expect(data.results.map((book: { olKey: string | null }) => book.olKey)).toEqual([
        "/works/OL1",
        null,
        null,
        "/works/OL2",
      ]);
    });

    it("adds journal status to Open Library results already present in the user's journal", async () => {
      vi.mocked(db.execute).mockResolvedValueOnce([
        { id: "book-1", olKey: "/works/OL1", readingStatus: "READING" },
      ]);
      vi.mocked(fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          docs: [{ key: "/works/OL1", title: "Words of Radiance", author_name: ["Brandon Sanderson"], cover_i: null, first_publish_year: 2014 }],
        }),
      });

      const res = await GET(makeReqWithSource("words of radiance", "openlibrary"));

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.openLibraryResults[0]).toMatchObject({
        id: "book-1",
        olKey: "/works/OL1",
        readingStatus: "READING",
      });
    });

    it("returns local results only in local source mode and says whether Open Library is needed", async () => {
      vi.mocked(db.execute).mockResolvedValueOnce([
        { id: "book-1", olKey: "/works/OL1", title: "Dune", author: "Frank Herbert", coverUrl: null, publishedYear: 1965, combinedScore: 0.9 },
      ]);

      const res = await GET(makeReqWithSource("dune", "local"));

      expect(res.status).toBe(200);
      expect(vi.mocked(fetch)).not.toHaveBeenCalled();
      const data = await res.json();
      expect(data.source).toBe("local");
      expect(data.localResults).toHaveLength(1);
      expect(data.openLibraryResults).toHaveLength(0);
      expect(data.shouldQueryOpenLibrary).toBe(true);
    });

    it("calls Open Library when local DB has no results", async () => {
      vi.mocked(db.execute).mockResolvedValueOnce([]);
      vi.mocked(fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          docs: [{ key: "/works/OL1", title: "Dune", author_name: ["Frank Herbert"], cover_i: null, first_publish_year: 1965 }],
        }),
      });
      const res = await GET(makeReq("dune"));
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.source).toBe("openlibrary");
      expect(data.results[0].title).toBe("Dune");
    });

    it("returns 200 with empty results when Open Library is unavailable", async () => {
      // searchOpenLibraryCached catches OL errors internally and returns [].
      vi.mocked(db.execute).mockResolvedValueOnce([]);
      vi.mocked(fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: false, status: 503 });
      const res = await GET(makeReq("dune"));
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.source).toBe("openlibrary");
      expect(data.results).toHaveLength(0);
    });
  });
});

// ------------------------------------------------------------------
// POST /api/books/add
// ------------------------------------------------------------------

describe("POST /api/books/add", () => {
  function makeReq(body: unknown) {
    return new NextRequest("http://localhost/api/books/add", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  const validPayload = {
    title: "Dune",
    author: "Frank Herbert",
    status: "TBR",
  };

  describe("authentication", () => {
    it("returns 401 when not authenticated", async () => {
      vi.mocked(auth.api.getSession).mockResolvedValueOnce(null);
      const res = await POST(makeReq(validPayload));
      expect(res.status).toBe(401);
    });
  });

  describe("input validation", () => {
    it("returns 400 for invalid payload (missing title)", async () => {
      const res = await POST(makeReq({ author: "Herbert", status: "TBR" }));
      expect(res.status).toBe(400);
    });

    it("returns 400 for invalid status value", async () => {
      const res = await POST(makeReq({ ...validPayload, status: "WISHLIST" }));
      expect(res.status).toBe(400);
    });
  });

  describe("successful addition", () => {
    it("creates a new book and reading progress, returns 201", async () => {
      const newBook = { id: "book-1", title: "Dune", author: "Frank Herbert" };
      const progress = { id: "prog-1", bookId: "book-1", status: "TBR" };
      // Route: insert book (onConflictDoNothing) → returning() gives [newBook]
      //        insert readingProgress (onConflictDoUpdate) → returning() gives [progress]
      vi.mocked(db.returning)
        .mockResolvedValueOnce([newBook])
        .mockResolvedValueOnce([progress]);
      const res = await POST(makeReq({ ...validPayload, olKey: "/works/OL1" }));
      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.book.title).toBe("Dune");
      expect(data.progress.status).toBe("TBR");
    });

    it("reuses an existing book row when olKey matches", async () => {
      const existingBook = { id: "book-1", title: "Dune" };
      const progress = { id: "prog-1", bookId: "book-1", status: "READING" };
      // Route: insert book → onConflictDoNothing → returning() gives [] (conflict, no insert)
      //        then fetches existing by olKey via db.limit
      //        then inserts reading progress → returning() gives [progress]
      vi.mocked(db.returning)
        .mockResolvedValueOnce([])         // book insert conflicted
        .mockResolvedValueOnce([progress]); // progress insert
      vi.mocked(db.limit).mockResolvedValueOnce([existingBook]); // fetch by olKey
      const res = await POST(makeReq({ ...validPayload, olKey: "/works/OL1", status: "READING" }));
      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.book.id).toBe("book-1");
    });
  });
});
