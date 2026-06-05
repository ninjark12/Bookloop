import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { PATCH } from "@/app/api/friends/request/[id]/route";

const VALID_UUID = "00000000-0000-0000-0000-000000000001";
const INVALID_UUID = "not-a-uuid";

function makeReq(body: unknown) {
  return new NextRequest(`http://localhost/api/friends/request/${VALID_UUID}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("PATCH /api/friends/request/[id]", () => {
  describe("authentication", () => {
    it("returns 401 when not authenticated", async () => {
      vi.mocked(auth.api.getSession).mockResolvedValueOnce(null);
      const res = await PATCH(makeReq({ action: "accept" }), makeParams(VALID_UUID));
      expect(res.status).toBe(401);
    });
  });

  describe("input validation", () => {
    it("returns 400 for an invalid UUID param", async () => {
      const req = new NextRequest(`http://localhost/api/friends/request/${INVALID_UUID}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "accept" }),
      });
      const res = await PATCH(req, makeParams(INVALID_UUID));
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toMatch(/invalid request id/i);
    });

    it("returns 400 for malformed JSON body", async () => {
      const req = new NextRequest(`http://localhost/api/friends/request/${VALID_UUID}`, {
        method: "PATCH",
        body: "not-json",
      });
      const res = await PATCH(req, makeParams(VALID_UUID));
      expect(res.status).toBe(400);
    });

    it("returns 400 for an invalid action value", async () => {
      const res = await PATCH(makeReq({ action: "ignore" }), makeParams(VALID_UUID));
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toMatch(/action must be/i);
    });
  });

  describe("not found", () => {
    it("returns 404 when the request does not exist or user is not the receiver", async () => {
      // default limit mock resolves to []
      const res = await PATCH(makeReq({ action: "accept" }), makeParams(VALID_UUID));
      expect(res.status).toBe(404);
    });
  });

  describe("conflict", () => {
    it("returns 409 when the request is no longer pending", async () => {
      vi.mocked(db.limit).mockResolvedValueOnce([{ id: VALID_UUID, status: "ACCEPTED" }]);
      const res = await PATCH(makeReq({ action: "accept" }), makeParams(VALID_UUID));
      expect(res.status).toBe(409);
    });
  });

  describe("successful actions", () => {
    it("accepts a pending request and returns ACCEPTED status", async () => {
      vi.mocked(db.limit).mockResolvedValueOnce([{ id: VALID_UUID, status: "PENDING" }]);
      const res = await PATCH(makeReq({ action: "accept" }), makeParams(VALID_UUID));
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.status).toBe("ACCEPTED");
      expect(vi.mocked(db.set).mock.calls[0][0]).toMatchObject({ status: "ACCEPTED" });
    });

    it("declines a pending request and returns DECLINED status", async () => {
      vi.mocked(db.limit).mockResolvedValueOnce([{ id: VALID_UUID, status: "PENDING" }]);
      const res = await PATCH(makeReq({ action: "decline" }), makeParams(VALID_UUID));
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.status).toBe("DECLINED");
      expect(vi.mocked(db.set).mock.calls[0][0]).toMatchObject({ status: "DECLINED" });
    });
  });

  describe("security", () => {
    it("validates the UUID param before touching the database", async () => {
      const req = new NextRequest(`http://localhost/api/friends/request/${INVALID_UUID}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "accept" }),
      });
      await PATCH(req, makeParams(INVALID_UUID));
      expect(vi.mocked(db.where).mock.calls).toHaveLength(0);
    });
  });
});
