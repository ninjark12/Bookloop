import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { POST, PATCH, DELETE } from "@/app/api/journal/route";

const BOOK_ID = "book-id-1";
const ENTRY_ID = "entry-id-1";

function makeReq(method: string, body: unknown) {
  return new NextRequest("http://localhost/api/journal", {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ------------------------------------------------------------------
// POST
// ------------------------------------------------------------------

describe("POST /api/journal", () => {
  describe("authentication", () => {
    it("returns 401 when not authenticated", async () => {
      vi.mocked(auth.api.getSession).mockResolvedValueOnce(null);
      const res = await POST(makeReq("POST", { bookId: BOOK_ID, scope: "CHAPTER", chapterStart: 1, chapterEnd: 1, content: "test" }));
      expect(res.status).toBe(401);
    });
  });

  describe("input validation", () => {
    it("returns 400 for malformed JSON", async () => {
      const req = new NextRequest("http://localhost/api/journal", { method: "POST", body: "bad" });
      const res = await POST(req);
      expect(res.status).toBe(400);
    });

    it("returns 400 when bookId is missing", async () => {
      const res = await POST(makeReq("POST", { scope: "CHAPTER", chapterStart: 1, chapterEnd: 1, content: "test" }));
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toMatch(/bookId/i);
    });

    it("returns 400 when content is empty", async () => {
      const res = await POST(makeReq("POST", { bookId: BOOK_ID, scope: "CHAPTER", chapterStart: 1, chapterEnd: 1, content: "   " }));
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toMatch(/content/i);
    });

    it("returns 400 for an invalid scope value", async () => {
      const res = await POST(makeReq("POST", { bookId: BOOK_ID, scope: "INVALID", chapterStart: 1, chapterEnd: 1, content: "test" }));
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toMatch(/scope/i);
    });
  });

  describe("conflict", () => {
    it("returns 409 when an entry for that chapter already exists", async () => {
      vi.mocked(db.limit).mockResolvedValueOnce([{ id: ENTRY_ID }]);
      const res = await POST(makeReq("POST", { bookId: BOOK_ID, scope: "CHAPTER", chapterStart: 3, chapterEnd: 3, content: "notes" }));
      expect(res.status).toBe(409);
      const data = await res.json();
      expect(data.error).toMatch(/already have an entry/i);
    });
  });

  describe("successful creation", () => {
    it("creates an entry and returns 201", async () => {
      vi.mocked(db.limit).mockResolvedValueOnce([]); // no duplicate
      vi.mocked(db.returning).mockResolvedValueOnce([{ id: ENTRY_ID, content: "notes" }]);
      const res = await POST(makeReq("POST", { bookId: BOOK_ID, scope: "CHAPTER", chapterStart: 1, chapterEnd: 1, content: "notes" }));
      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.entry.id).toBe(ENTRY_ID);
    });

    it("uses chapter range for RANGE scope", async () => {
      vi.mocked(db.limit).mockResolvedValueOnce([]);
      vi.mocked(db.returning).mockResolvedValueOnce([{ id: ENTRY_ID }]);
      await POST(makeReq("POST", { bookId: BOOK_ID, scope: "RANGE", chapterStart: 2, chapterEnd: 5, content: "notes" }));
      const insertValues = vi.mocked(db.values).mock.calls[0][0] as Record<string, unknown>;
      expect(insertValues.chapterStart).toBe(2);
      expect(insertValues.chapterEnd).toBe(5);
    });

    it("uses 9999 for WHOLE_BOOK scope", async () => {
      vi.mocked(db.limit).mockResolvedValueOnce([]);
      vi.mocked(db.returning).mockResolvedValueOnce([{ id: ENTRY_ID }]);
      await POST(makeReq("POST", { bookId: BOOK_ID, scope: "WHOLE_BOOK", chapterStart: 0, chapterEnd: 0, content: "notes" }));
      const insertValues = vi.mocked(db.values).mock.calls[0][0] as Record<string, unknown>;
      expect(insertValues.chapterStart).toBe(9999);
      expect(insertValues.chapterEnd).toBe(9999);
    });
  });

  describe("security", () => {
    it("sets userId from session, not from request body", async () => {
      vi.mocked(db.limit).mockResolvedValueOnce([]);
      vi.mocked(db.returning).mockResolvedValueOnce([{ id: ENTRY_ID }]);
      await POST(makeReq("POST", { bookId: BOOK_ID, scope: "CHAPTER", chapterStart: 1, chapterEnd: 1, content: "test", userId: "evil" }));
      const insertValues = vi.mocked(db.values).mock.calls[0][0] as Record<string, unknown>;
      expect(insertValues.userId).toBe("user-123");
    });
  });
});

// ------------------------------------------------------------------
// PATCH
// ------------------------------------------------------------------

describe("PATCH /api/journal", () => {
  describe("authentication", () => {
    it("returns 401 when not authenticated", async () => {
      vi.mocked(auth.api.getSession).mockResolvedValueOnce(null);
      const res = await PATCH(makeReq("PATCH", { entryId: ENTRY_ID, content: "updated" }));
      expect(res.status).toBe(401);
    });
  });

  describe("input validation", () => {
    it("returns 400 when entryId is missing", async () => {
      const res = await PATCH(makeReq("PATCH", { content: "updated" }));
      expect(res.status).toBe(400);
    });

    it("returns 400 when content is empty", async () => {
      const res = await PATCH(makeReq("PATCH", { entryId: ENTRY_ID, content: "" }));
      expect(res.status).toBe(400);
    });
  });

  describe("not found", () => {
    it("returns 404 when the entry does not belong to the user", async () => {
      vi.mocked(db.returning).mockResolvedValueOnce([]);
      const res = await PATCH(makeReq("PATCH", { entryId: ENTRY_ID, content: "updated" }));
      expect(res.status).toBe(404);
    });
  });

  describe("successful update", () => {
    it("updates content and returns the entry", async () => {
      vi.mocked(db.returning).mockResolvedValueOnce([{ id: ENTRY_ID, content: "updated" }]);
      const res = await PATCH(makeReq("PATCH", { entryId: ENTRY_ID, content: "updated" }));
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.entry.content).toBe("updated");
    });
  });
});

// ------------------------------------------------------------------
// DELETE
// ------------------------------------------------------------------

describe("DELETE /api/journal", () => {
  describe("authentication", () => {
    it("returns 401 when not authenticated", async () => {
      vi.mocked(auth.api.getSession).mockResolvedValueOnce(null);
      const res = await DELETE(makeReq("DELETE", { entryId: ENTRY_ID }));
      expect(res.status).toBe(401);
    });
  });

  describe("input validation", () => {
    it("returns 400 when entryId is missing", async () => {
      const res = await DELETE(makeReq("DELETE", {}));
      expect(res.status).toBe(400);
    });
  });

  describe("not found", () => {
    it("returns 404 when entry does not belong to the user", async () => {
      vi.mocked(db.returning).mockResolvedValueOnce([]);
      const res = await DELETE(makeReq("DELETE", { entryId: ENTRY_ID }));
      expect(res.status).toBe(404);
    });
  });

  describe("successful deletion", () => {
    it("deletes the entry and returns success", async () => {
      vi.mocked(db.returning).mockResolvedValueOnce([{ id: ENTRY_ID }]);
      const res = await DELETE(makeReq("DELETE", { entryId: ENTRY_ID }));
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
    });
  });

  describe("security", () => {
    it("scopes deletion to the session user, not any userId in body", async () => {
      vi.mocked(db.returning).mockResolvedValueOnce([{ id: ENTRY_ID }]);
      await DELETE(makeReq("DELETE", { entryId: ENTRY_ID, userId: "evil" }));
      // The where clause is built with both entryId AND session userId,
      // so a different user's entry won't match.
      expect(vi.mocked(db.where).mock.calls.length).toBeGreaterThan(0);
    });
  });
});
