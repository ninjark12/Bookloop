import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { DELETE } from "@/app/api/books/remove/route";

const BOOK_ID = "book-id-1";

function makeReq(body: unknown) {
  return new NextRequest("http://localhost/api/books/remove", {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("DELETE /api/books/remove", () => {
  describe("authentication", () => {
    it("returns 401 when not authenticated", async () => {
      vi.mocked(auth.api.getSession).mockResolvedValueOnce(null);
      const res = await DELETE(makeReq({ bookId: BOOK_ID }));
      expect(res.status).toBe(401);
    });
  });

  describe("input validation", () => {
    it("returns 400 for malformed JSON", async () => {
      const req = new NextRequest("http://localhost/api/books/remove", { method: "DELETE", body: "bad" });
      const res = await DELETE(req);
      expect(res.status).toBe(400);
    });

    it("returns 400 when bookId is missing", async () => {
      const res = await DELETE(makeReq({}));
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toMatch(/bookId/i);
    });
  });

  describe("not found", () => {
    it("returns 404 when the book is not in the user's reading list", async () => {
      vi.mocked(db.transaction).mockImplementationOnce(async (cb) => {
        const tx = {
          delete: vi.fn().mockReturnThis(),
          where: vi.fn().mockReturnThis(),
          returning: vi.fn().mockResolvedValue([]),
        };
        return cb(tx);
      });
      const res = await DELETE(makeReq({ bookId: BOOK_ID }));
      expect(res.status).toBe(404);
    });
  });

  describe("successful deletion", () => {
    it("removes the book and its journal entries, returns success", async () => {
      vi.mocked(db.transaction).mockImplementationOnce(async (cb) => {
        const tx = {
          delete: vi.fn().mockReturnThis(),
          where: vi.fn().mockReturnThis(),
          returning: vi.fn().mockResolvedValue([{ bookId: BOOK_ID }]),
        };
        return cb(tx);
      });
      const res = await DELETE(makeReq({ bookId: BOOK_ID }));
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
    });
  });

  describe("security", () => {
    it("scopes deletion to session userId, not any userId in body", async () => {
      vi.mocked(db.transaction).mockImplementationOnce(async (cb) => {
        const tx = {
          delete: vi.fn().mockReturnThis(),
          where: vi.fn().mockReturnThis(),
          returning: vi.fn().mockResolvedValue([{ bookId: BOOK_ID }]),
        };
        const result = await cb(tx);
        expect(JSON.stringify((tx.where as ReturnType<typeof vi.fn>).mock.calls)).toContain("user-123");
        return result;
      });
      await DELETE(makeReq({ bookId: BOOK_ID, userId: "evil" }));
    });
  });
});
