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

    it("returns accepted friends with only friend info (no raw request data)", async () => {
      const accepted = [
        {
          id: "req-1",
          createdAt: new Date("2024-01-01"),
          senderId: "user-123",
          receiverId: "friend-1",
          friend: {
            id: "friend-1",
            name: "Bob",
            displayName: "Bob",
            discriminator: "5678",
            image: null,
          },
        },
      ];
      vi.mocked(db.then).mockImplementationOnce((resolve: (value: unknown) => void) =>
        resolve(accepted)
      );
      const res = await GET(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.friends).toHaveLength(1);
      expect(data.friends[0].friend.name).toBe("Bob");
      // senderId and receiverId are stripped from the response
      expect(data.friends[0].senderId).toBeUndefined();
      expect(data.friends[0].receiverId).toBeUndefined();
    });
  });
});
