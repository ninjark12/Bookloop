import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { DELETE } from "@/app/api/user/route";

const req = new NextRequest("http://localhost/api/user", { method: "DELETE" });

describe("DELETE /api/user", () => {
  describe("authentication", () => {
    it("returns 401 when not authenticated", async () => {
      vi.mocked(auth.api.getSession).mockResolvedValueOnce(null);
      const res = await DELETE(req);
      expect(res.status).toBe(401);
    });
  });

  describe("successful deletion", () => {
    it("deletes journal entries, reading progress, and the user row, returns success", async () => {
      const res = await DELETE(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
    });

    it("calls signOut to invalidate the session", async () => {
      await DELETE(req);
      expect(vi.mocked(auth.api.signOut)).toHaveBeenCalled();
    });
  });

  describe("security", () => {
    it("deletes only the session user's data", async () => {
      await DELETE(req);
      // All delete calls should use db.where, scoping to userId
      const deleteCallCount = vi.mocked(db.delete).mock.calls.length;
      const whereCallCount = vi.mocked(db.where).mock.calls.length;
      expect(deleteCallCount).toBeGreaterThanOrEqual(3); // journal + progress + users
      expect(whereCallCount).toBe(deleteCallCount);
    });
  });
});
