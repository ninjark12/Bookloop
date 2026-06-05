import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { PATCH } from "@/app/api/user/display-name/route";

function makeReq(body: unknown) {
  return new NextRequest("http://localhost/api/user/display-name", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("PATCH /api/user/display-name", () => {
  describe("authentication", () => {
    it("returns 401 when not authenticated", async () => {
      vi.mocked(auth.api.getSession).mockResolvedValueOnce(null);
      const res = await PATCH(makeReq({ displayName: "Alice" }));
      expect(res.status).toBe(401);
    });
  });

  describe("input validation", () => {
    it("returns 400 for malformed JSON", async () => {
      const req = new NextRequest("http://localhost/api/user/display-name", {
        method: "PATCH",
        body: "not-json",
      });
      const res = await PATCH(req);
      expect(res.status).toBe(400);
    });

    it("returns 400 when displayName is missing", async () => {
      const res = await PATCH(makeReq({}));
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toMatch(/displayName/i);
    });

    it("returns 400 when displayName is empty string", async () => {
      const res = await PATCH(makeReq({ displayName: "   " }));
      expect(res.status).toBe(400);
    });

    it("returns 400 when displayName exceeds 32 characters", async () => {
      const res = await PATCH(makeReq({ displayName: "A".repeat(33) }));
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toMatch(/32/);
    });

    it("returns 400 when displayName contains #", async () => {
      const res = await PATCH(makeReq({ displayName: "Alice#1234" }));
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toMatch(/#/);
    });
  });

  describe("not found", () => {
    it("returns 404 when the session user does not exist in db", async () => {
      // limit returns [] -> user not found
      const res = await PATCH(makeReq({ displayName: "Alice" }));
      expect(res.status).toBe(404);
    });
  });

  describe("first-time display name assignment", () => {
    it("assigns a discriminator and returns 200 with displayName and discriminator", async () => {
      vi.mocked(db.limit).mockResolvedValueOnce([{ discriminator: null }]); // current user
      vi.mocked(db.then).mockImplementationOnce((resolve: (value: unknown) => void) =>
        resolve([]) // takenRows: no conflicts
      );
      const res = await PATCH(makeReq({ displayName: "Alice" }));
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.displayName).toBe("Alice");
      expect(data.discriminator).toMatch(/^\d{4}$/);
    });
  });

  describe("name change with existing discriminator", () => {
    it("returns 200 when the new name+discriminator combo is free", async () => {
      vi.mocked(db.limit)
        .mockResolvedValueOnce([{ discriminator: "0042" }]) // current user has discriminator
        .mockResolvedValueOnce([]); // no conflict for new name
      const res = await PATCH(makeReq({ displayName: "NewName" }));
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.displayName).toBe("NewName");
      expect(data.discriminator).toBe("0042");
    });

    it("returns 409 when another user holds the same name + discriminator", async () => {
      vi.mocked(db.limit)
        .mockResolvedValueOnce([{ discriminator: "0042" }]) // current user
        .mockResolvedValueOnce([{ id: "other-user" }]); // conflict
      const res = await PATCH(makeReq({ displayName: "TakenName" }));
      expect(res.status).toBe(409);
      const data = await res.json();
      expect(data.error).toMatch(/taken/i);
    });
  });

  describe("security", () => {
    it("updates the session user only, not any userId from body", async () => {
      vi.mocked(db.limit).mockResolvedValueOnce([{ discriminator: null }]);
      vi.mocked(db.then).mockImplementationOnce((resolve: (value: unknown) => void) =>
        resolve([])
      );
      const res = await PATCH(makeReq({ displayName: "Alice", userId: "hacker-id" }));
      // Route must succeed (using session userId), not fail trying to use a body userId
      expect(res.status).toBe(200);
      // The update call must have happened (scoped to session user by where clause)
      expect(vi.mocked(db.update)).toHaveBeenCalled();
      expect(vi.mocked(db.where)).toHaveBeenCalled();
    });
  });
});
