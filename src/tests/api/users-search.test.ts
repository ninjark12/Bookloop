import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { GET } from "@/app/api/users/search/route";

function makeReq(q: string) {
  return new NextRequest(`http://localhost/api/users/search?q=${encodeURIComponent(q)}`);
}

describe("GET /api/users/search", () => {
  describe("authentication", () => {
    it("returns 401 when not authenticated", async () => {
      vi.mocked(auth.api.getSession).mockResolvedValueOnce(null);
      const res = await makeReq("Alice#1234") && await GET(makeReq("Alice#1234"));
      expect(res.status).toBe(401);
    });
  });

  describe("input validation", () => {
    it("returns 400 when query has no # separator", async () => {
      const res = await GET(makeReq("Alice"));
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toMatch(/Name#1234/i);
    });

    it("returns 400 when discriminator is not 4 digits", async () => {
      const res = await GET(makeReq("Alice#12"));
      expect(res.status).toBe(400);
    });

    it("returns 400 when discriminator contains non-digits", async () => {
      const res = await GET(makeReq("Alice#abcd"));
      expect(res.status).toBe(400);
    });

    it("returns 400 when displayName is empty", async () => {
      const res = await GET(makeReq("#1234"));
      expect(res.status).toBe(400);
    });
  });

  describe("successful search", () => {
    it("returns the matched user", async () => {
      vi.mocked(db.limit).mockResolvedValueOnce([
        { id: "other-user", name: "Alice", displayName: "Alice", discriminator: "1234", image: null },
      ]);
      const res = await GET(makeReq("Alice#1234"));
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.user).not.toBeNull();
      expect(data.user.name).toBe("Alice");
    });

    it("returns null when no user matches", async () => {
      // default limit resolves to [] via then
      const res = await GET(makeReq("Ghost#9999"));
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.user).toBeNull();
    });

    it("returns null when the match is the searching user themselves", async () => {
      vi.mocked(db.limit).mockResolvedValueOnce([
        { id: "user-123", name: "Test User", displayName: "Test", discriminator: "0001", image: null },
      ]);
      const res = await GET(makeReq("Test#0001"));
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.user).toBeNull();
    });
  });
});
