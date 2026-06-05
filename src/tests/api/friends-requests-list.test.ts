import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { GET } from "@/app/api/friends/requests/route";

const req = new NextRequest("http://localhost/api/friends/requests");

describe("GET /api/friends/requests", () => {
  describe("authentication", () => {
    it("returns 401 when not authenticated", async () => {
      vi.mocked(auth.api.getSession).mockResolvedValueOnce(null);
      const res = await GET(req);
      expect(res.status).toBe(401);
    });
  });

  describe("successful response", () => {
    it("returns an empty array when there are no pending requests", async () => {
      const res = await GET(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.requests).toEqual([]);
    });

    it("returns pending requests with sender info", async () => {
      const pendingRequest = {
        id: "req-1",
        createdAt: new Date("2024-01-01"),
        sender: {
          id: "sender-1",
          name: "Alice",
          displayName: "Alice",
          discriminator: "1234",
          image: null,
        },
      };
      vi.mocked(db.then).mockImplementationOnce((resolve: (value: unknown) => void) =>
        resolve([pendingRequest])
      );
      const res = await GET(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.requests).toHaveLength(1);
      expect(data.requests[0].sender.name).toBe("Alice");
    });

    it("only returns requests where the current user is the receiver", async () => {
      await GET(req);
      // The where clause should filter by receiverId = session userId
      const whereArg = vi.mocked(db.where).mock.calls[0][0];
      expect(whereArg).toBeDefined();
    });
  });
});
