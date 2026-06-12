import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
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
    it("returns local results without calling Open Library", async () => {
      // Route uses db.execute() for raw FTS+trigram SQL.
      // Needs >= 3 rows with combinedScore >= 0.1 to take the local-only path.
      vi.mocked(db.execute).mockResolvedValueOnce([
        { id: "book-1", olKey: "/works/OL1", title: "Dune", author: "Frank Herbert", coverUrl: null, publishedYear: 1965, combinedScore: 0.9 },
        { id: "book-2", olKey: null, title: "Dune Messiah", author: "Frank Herbert", coverUrl: null, publishedYear: 1969, combinedScore: 0.7 },
        { id: "book-3", olKey: null, title: "Children of Dune", author: "Frank Herbert", coverUrl: null, publishedYear: 1976, combinedScore: 0.5 },
      ]);
      const res = await GET(makeReq("dune"));
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.source).toBe("local");
      expect(data.results[0].title).toBe("Dune");
      expect(vi.mocked(fetch)).not.toHaveBeenCalled();
    });
  });

  describe("Open Library fallback", () => {
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
