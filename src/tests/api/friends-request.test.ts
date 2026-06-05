import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { POST } from "@/app/api/friends/request/route";

const RECEIVER_ID = "receiver-user-id";

function makeReq(body: unknown) {
  return new NextRequest("http://localhost/api/friends/request", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/friends/request", () => {
  describe("authentication", () => {
    it("returns 401 when not authenticated", async () => {
      vi.mocked(auth.api.getSession).mockResolvedValueOnce(null);
      const res = await POST(makeReq({ receiverId: RECEIVER_ID }));
      expect(res.status).toBe(401);
    });
  });

  describe("input validation", () => {
    it("returns 400 for malformed JSON body", async () => {
      const req = new NextRequest("http://localhost/api/friends/request", {
        method: "POST",
        body: "not-json",
      });
      const res = await POST(req);
      expect(res.status).toBe(400);
    });

    it("returns 400 when receiverId is missing", async () => {
      const res = await POST(makeReq({}));
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toMatch(/receiverId/i);
    });

    it("returns 400 when sending a request to yourself", async () => {
      const res = await POST(makeReq({ receiverId: "user-123" }));
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toMatch(/yourself/i);
    });
  });

  describe("not found", () => {
    it("returns 404 when the receiver user does not exist", async () => {
      // default limit mock resolves to [] via `then`
      const res = await POST(makeReq({ receiverId: RECEIVER_ID }));
      expect(res.status).toBe(404);
    });
  });

  describe("conflict states", () => {
    it("returns 409 when already friends", async () => {
      vi.mocked(db.limit)
        .mockResolvedValueOnce([{ id: RECEIVER_ID }])
        .mockResolvedValueOnce([{ id: "req-1", status: "ACCEPTED", senderId: "user-123" }]);
      const res = await POST(makeReq({ receiverId: RECEIVER_ID }));
      expect(res.status).toBe(409);
      const data = await res.json();
      expect(data.error).toMatch(/already friends/i);
    });

    it("returns 409 when my outgoing request is already pending", async () => {
      vi.mocked(db.limit)
        .mockResolvedValueOnce([{ id: RECEIVER_ID }])
        .mockResolvedValueOnce([{ id: "req-1", status: "PENDING", senderId: "user-123" }]);
      const res = await POST(makeReq({ receiverId: RECEIVER_ID }));
      expect(res.status).toBe(409);
      const data = await res.json();
      expect(data.error).toMatch(/pending/i);
    });
  });

  describe("auto-accept", () => {
    it("accepts when the other user already sent a pending request", async () => {
      vi.mocked(db.limit)
        .mockResolvedValueOnce([{ id: RECEIVER_ID }])
        .mockResolvedValueOnce([{ id: "req-1", status: "PENDING", senderId: RECEIVER_ID }]);
      const res = await POST(makeReq({ receiverId: RECEIVER_ID }));
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.status).toBe("accepted");
      expect(vi.mocked(db.set).mock.calls[0][0]).toMatchObject({ status: "ACCEPTED" });
    });
  });

  describe("successful request", () => {
    it("creates a new friend request and returns 201", async () => {
      vi.mocked(db.limit)
        .mockResolvedValueOnce([{ id: RECEIVER_ID }])
        .mockResolvedValueOnce([]);
      vi.mocked(db.returning).mockResolvedValueOnce([{ id: "new-req-id" }]);
      const res = await POST(makeReq({ receiverId: RECEIVER_ID }));
      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.id).toBe("new-req-id");
    });

    it("re-sends a previously declined outgoing request", async () => {
      vi.mocked(db.limit)
        .mockResolvedValueOnce([{ id: RECEIVER_ID }])
        .mockResolvedValueOnce([{ id: "req-1", status: "DECLINED", senderId: "user-123" }]);
      const res = await POST(makeReq({ receiverId: RECEIVER_ID }));
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.status).toBe("pending");
    });
  });

  describe("security", () => {
    it("uses session userId as senderId, ignores any senderId in body", async () => {
      vi.mocked(db.limit)
        .mockResolvedValueOnce([{ id: RECEIVER_ID }])
        .mockResolvedValueOnce([]);
      vi.mocked(db.returning).mockResolvedValueOnce([{ id: "new-req-id" }]);
      await POST(makeReq({ receiverId: RECEIVER_ID, senderId: "hacker-id" }));
      expect(vi.mocked(db.values).mock.calls[0][0]).toMatchObject({ senderId: "user-123" });
    });
  });
});
