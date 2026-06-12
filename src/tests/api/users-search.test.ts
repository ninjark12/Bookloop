import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { GET } from "@/app/api/users/search/route";

// Route returns { users: [...] } for both tag (Name#XXXX) and name searches.

function makeReq(q: string) {
  return new NextRequest(`http://localhost/api/users/search?q=${encodeURIComponent(q)}`);
}

describe("GET /api/users/search", () => {
  describe("authentication", () => {
    it("returns 401 when not authenticated", async () => {
      vi.mocked(auth.api.getSession).mockResolvedValueOnce(null);
      const res = await GET(makeReq("Alice#1234"));
      expect(res.status).toBe(401);
    });
  });

  describe("tag format validation (Name#XXXX)", () => {
    it("returns 400 when discriminator is not 4 digits", async () => {
      const res = await GET(makeReq("Alice#12"));
      expect(res.status).toBe(400);
    });

    it("returns 400 when discriminator contains non-digits", async () => {
      const res = await GET(makeReq("Alice#abcd"));
      expect(res.status).toBe(400);
    });

    it("returns 400 when displayName is empty in tag format", async () => {
      const res = await GET(makeReq("#1234"));
      expect(res.status).toBe(400);
    });
  });

  describe("tag search (Name#XXXX)", () => {
    it("returns the matched user", async () => {
      vi.mocked(db.limit).mockResolvedValueOnce([
        { id: "other-user", name: "Alice", displayName: "Alice", discriminator: "1234", image: null },
      ]);
      const res = await GET(makeReq("Alice#1234"));
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.users).toHaveLength(1);
      expect(data.users[0].name).toBe("Alice");
    });

    it("returns empty array when no user matches", async () => {
      // db.limit default resolves to [] via the mock's then()
      const res = await GET(makeReq("Ghost#9999"));
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.users).toHaveLength(0);
    });

    it("returns empty array when the match is the searching user themselves", async () => {
      vi.mocked(db.limit).mockResolvedValueOnce([
        { id: "user-123", name: "Test User", displayName: "Test", discriminator: "0001", image: null },
      ]);
      const res = await GET(makeReq("Test#0001"));
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.users).toHaveLength(0);
    });
  });

  describe("name search (no #)", () => {
    it("returns users matching the display name", async () => {
      vi.mocked(db.limit).mockResolvedValueOnce([
        { id: "other-user", name: "Alice", displayName: "Alice", discriminator: "1234", image: null },
      ]);
      const res = await GET(makeReq("Ali"));
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.users).toHaveLength(1);
    });

    it("returns 400 when name search query is less than 2 characters", async () => {
      const res = await GET(makeReq("A"));
      expect(res.status).toBe(400);
    });
  });
});
