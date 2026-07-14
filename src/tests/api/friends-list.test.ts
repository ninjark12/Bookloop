import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { GET } from "@/app/api/friends/route";

const req = new NextRequest("http://localhost/api/friends");

describe("GET /api/friends", () => {
  describe("authentication", () => {
    it("returns 401 when not authenticated", async () => {
      vi.mocked(auth.api.getSession).mockResolvedValueOnce(null);
      const res = await GET(req);
      expect(res.status).toBe(401);
    });
  });

  describe("successful response", () => {
    it("returns an empty friends list when user has no accepted friends", async () => {
      const res = await GET(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.friends).toEqual([]);
    });

    it("returns accepted friends as flat display rows", async () => {
      // getFriends() resolves through db.execute(sql`...`)
      vi.mocked(db.execute).mockResolvedValueOnce([
        {
          id: "friend-1",
          name: "Bob",
          image: null,
          display_name: "Bob",
          discriminator: "5678",
        },
      ] as never);
      const res = await GET(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.friends).toHaveLength(1);
      expect(data.friends[0].name).toBe("Bob");
      expect(data.friends[0].discriminator).toBe("5678");
    });
  });
});
