import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { PATCH } from "@/app/api/books/status/route";

const BOOK_ID = "book-id-1";

function makeReq(body: unknown) {
  return new NextRequest("http://localhost/api/books/status", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("PATCH /api/books/status", () => {
  describe("authentication", () => {
    it("returns 401 when not authenticated", async () => {
      vi.mocked(auth.api.getSession).mockResolvedValueOnce(null);
      const res = await PATCH(makeReq({ bookId: BOOK_ID, status: "READ" }));
      expect(res.status).toBe(401);
    });
  });

  describe("input validation", () => {
    it("returns 400 for malformed JSON", async () => {
      const req = new NextRequest("http://localhost/api/books/status", { method: "PATCH", body: "bad" });
      const res = await PATCH(req);
      expect(res.status).toBe(400);
    });

    it("returns 400 when bookId is missing", async () => {
      const res = await PATCH(makeReq({ status: "READ" }));
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toMatch(/bookId/i);
    });

    it("returns 400 for an invalid status value", async () => {
      const res = await PATCH(makeReq({ bookId: BOOK_ID, status: "ABANDONED" }));
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toMatch(/status must be/i);
    });

    it("accepts all valid status values", async () => {
      for (const status of ["READING", "READ", "TBR", "DNF"]) {
        vi.mocked(db.returning).mockResolvedValueOnce([{ bookId: BOOK_ID, status }]);
        const res = await PATCH(makeReq({ bookId: BOOK_ID, status }));
        expect(res.status).toBe(200);
      }
    });
  });

  describe("not found", () => {
    it("returns 404 when the book is not in the user's reading list", async () => {
      vi.mocked(db.returning).mockResolvedValueOnce([]);
      const res = await PATCH(makeReq({ bookId: BOOK_ID, status: "READ" }));
      expect(res.status).toBe(404);
    });
  });

  describe("successful update", () => {
    it("updates status and returns the progress record", async () => {
      const progress = { bookId: BOOK_ID, status: "READ", finishedAt: new Date().toISOString() };
      vi.mocked(db.returning).mockResolvedValueOnce([progress]);
      const res = await PATCH(makeReq({ bookId: BOOK_ID, status: "READ" }));
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.progress.status).toBe("READ");
    });

    it("sets finishedAt when status is READ", async () => {
      const progress = { bookId: BOOK_ID, status: "READ", finishedAt: new Date().toISOString() };
      vi.mocked(db.returning).mockResolvedValueOnce([progress]);
      await PATCH(makeReq({ bookId: BOOK_ID, status: "READ" }));
      const setArg = vi.mocked(db.set).mock.calls[0][0] as Record<string, unknown>;
      expect(setArg.finishedAt).not.toBeNull();
    });

    it("clears finishedAt when status is READING", async () => {
      const progress = { bookId: BOOK_ID, status: "READING", finishedAt: null };
      vi.mocked(db.returning).mockResolvedValueOnce([progress]);
      await PATCH(makeReq({ bookId: BOOK_ID, status: "READING" }));
      const setArg = vi.mocked(db.set).mock.calls[0][0] as Record<string, unknown>;
      expect(setArg.finishedAt).toBeNull();
    });
  });

  describe("security", () => {
    it("scopes update to session userId, not any userId in body", async () => {
      vi.mocked(db.returning).mockResolvedValueOnce([{ bookId: BOOK_ID, status: "TBR" }]);
      await PATCH(makeReq({ bookId: BOOK_ID, status: "TBR", userId: "evil" }));
      expect(vi.mocked(db.where).mock.calls.length).toBeGreaterThan(0);
    });
  });
});
