import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
import { db } from "@/db";
import { GET } from "@/app/api/cron/streak-reminder/route";

vi.mock("@/lib/email", () => ({
  sendStreakReminderEmail: vi.fn().mockResolvedValue(undefined),
}));

import { sendStreakReminderEmail } from "@/lib/email";

const CRON_SECRET = "test-secret";

function daysAgoStr(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function makeReq(secret?: string) {
  return new NextRequest("http://localhost/api/cron/streak-reminder", {
    headers: secret ? { authorization: `Bearer ${secret}` } : {},
  });
}

describe("GET /api/cron/streak-reminder", () => {
  describe("authentication", () => {
    it("returns 401 when authorization header is missing", async () => {
      process.env.CRON_SECRET = CRON_SECRET;
      const res = await GET(makeReq());
      expect(res.status).toBe(401);
    });

    it("returns 401 when authorization secret is wrong", async () => {
      process.env.CRON_SECRET = CRON_SECRET;
      const res = await GET(makeReq("wrong-secret"));
      expect(res.status).toBe(401);
    });
  });

  describe("with valid secret", () => {
    it("returns 200 with sent count when no at-risk users exist", async () => {
      process.env.CRON_SECRET = CRON_SECRET;
      // DB returns empty list of at-risk users
      const res = await GET(makeReq(CRON_SECRET));
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.sent).toBe(0);
      expect(data.errors).toBeUndefined();
    });

    it("sends emails to at-risk users and marks them in redis", async () => {
      process.env.CRON_SECRET = CRON_SECRET;

      const { redis } = await import("@/lib/redis");
      const futureGrace = new Date(Date.now() + 3 * 60 * 60 * 1000); // 3 hours from now

      vi.mocked(db.then).mockImplementationOnce((resolve: (v: unknown) => void) =>
        resolve([
          { id: "user-1", name: "Alice", email: "alice@example.com", streakCount: 7, graceUntil: futureGrace, lastEntryDate: daysAgoStr(2) },
        ])
      );
      vi.mocked(redis.get).mockResolvedValueOnce(null); // not yet sent

      const res = await GET(makeReq(CRON_SECRET));
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.sent).toBe(1);
      expect(vi.mocked(sendStreakReminderEmail)).toHaveBeenCalledOnce();
      expect(vi.mocked(redis.setex)).toHaveBeenCalled();
    });

    it("skips users whose grace period has already expired", async () => {
      process.env.CRON_SECRET = CRON_SECRET;

      const pastGrace = new Date(Date.now() - 60 * 1000); // expired 1 minute ago

      vi.mocked(db.then).mockImplementationOnce((resolve: (v: unknown) => void) =>
        resolve([
          { id: "user-1", name: "Alice", email: "alice@example.com", streakCount: 5, graceUntil: pastGrace, lastEntryDate: daysAgoStr(2) },
        ])
      );

      const res = await GET(makeReq(CRON_SECRET));
      const data = await res.json();
      expect(data.sent).toBe(0);
      expect(vi.mocked(sendStreakReminderEmail)).not.toHaveBeenCalled();
    });

    it("skips users already reminded this grace period", async () => {
      process.env.CRON_SECRET = CRON_SECRET;

      const { redis } = await import("@/lib/redis");
      const futureGrace = new Date(Date.now() + 2 * 60 * 60 * 1000);

      vi.mocked(db.then).mockImplementationOnce((resolve: (v: unknown) => void) =>
        resolve([
          { id: "user-1", name: "Alice", email: "alice@example.com", streakCount: 3, graceUntil: futureGrace, lastEntryDate: daysAgoStr(2) },
        ])
      );
      vi.mocked(redis.get).mockResolvedValueOnce("1"); // already sent

      const res = await GET(makeReq(CRON_SECRET));
      const data = await res.json();
      expect(data.sent).toBe(0);
    });

    it("skips users with no email address", async () => {
      process.env.CRON_SECRET = CRON_SECRET;

      const futureGrace = new Date(Date.now() + 2 * 60 * 60 * 1000);

      vi.mocked(db.then).mockImplementationOnce((resolve: (v: unknown) => void) =>
        resolve([
          { id: "user-1", name: "Alice", email: null, streakCount: 3, graceUntil: futureGrace, lastEntryDate: daysAgoStr(2) },
        ])
      );

      const res = await GET(makeReq(CRON_SECRET));
      const data = await res.json();
      expect(data.sent).toBe(0);
    });
  });
});
