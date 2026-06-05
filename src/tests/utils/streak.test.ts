import { describe, it, expect, vi } from "vitest";
import { db } from "@/db";
import { redis } from "@/lib/redis";
import { updateStreak } from "@/lib/streak";

const USER_ID = "user-123";

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(0, 0, 0, 0);
  return d;
}

describe("updateStreak", () => {
  describe("deduplication", () => {
    it("does nothing when streak already awarded today (redis hit)", async () => {
      vi.mocked(redis.get).mockResolvedValueOnce("1");
      await updateStreak(USER_ID);
      expect(vi.mocked(db.update)).not.toHaveBeenCalled();
    });
  });

  describe("user not found", () => {
    it("exits early when user row does not exist", async () => {
      // redis.get returns null (not awarded)
      vi.mocked(db.limit).mockResolvedValueOnce([]); // user not found
      await updateStreak(USER_ID);
      expect(vi.mocked(db.update)).not.toHaveBeenCalled();
    });
  });

  describe("first ever entry", () => {
    it("sets streak to 1 and clears graceUntil", async () => {
      vi.mocked(db.limit)
        .mockResolvedValueOnce([{ streakCount: 0, graceUntil: null }]) // user
        .mockResolvedValueOnce([]); // no previous entries
      await updateStreak(USER_ID);
      const setArg = vi.mocked(db.set).mock.calls[0][0] as Record<string, unknown>;
      expect(setArg.streakCount).toBe(1);
      expect(setArg.graceUntil).toBeNull();
    });
  });

  describe("consecutive day", () => {
    it("increments streak and clears graceUntil", async () => {
      vi.mocked(db.limit)
        .mockResolvedValueOnce([{ streakCount: 5, graceUntil: null }])
        .mockResolvedValueOnce([{ createdAt: daysAgo(1) }]); // yesterday
      await updateStreak(USER_ID);
      const setArg = vi.mocked(db.set).mock.calls[0][0] as Record<string, unknown>;
      expect(setArg.streakCount).toBe(6);
      expect(setArg.graceUntil).toBeNull();
    });
  });

  describe("same calendar day", () => {
    it("does not change streakCount when writing again on the same day", async () => {
      const todayEntry = new Date();
      vi.mocked(db.limit)
        .mockResolvedValueOnce([{ streakCount: 3, graceUntil: null }])
        .mockResolvedValueOnce([{ createdAt: todayEntry }]); // same day
      await updateStreak(USER_ID);
      const setArg = vi.mocked(db.set).mock.calls[0][0] as Record<string, unknown>;
      // dayDiff === 0 branch: no change to streakCount
      expect(setArg.streakCount).toBe(3);
    });
  });

  describe("missed day - in grace period", () => {
    it("continues the streak when writing during the grace window", async () => {
      const futureGrace = new Date(Date.now() + 60 * 60 * 1000); // grace active
      vi.mocked(db.limit)
        .mockResolvedValueOnce([{ streakCount: 10, graceUntil: futureGrace }])
        .mockResolvedValueOnce([{ createdAt: daysAgo(2) }]); // 2 days ago
      await updateStreak(USER_ID);
      const setArg = vi.mocked(db.set).mock.calls[0][0] as Record<string, unknown>;
      expect(setArg.streakCount).toBe(11);
      expect(setArg.graceUntil).toBeNull();
    });
  });

  describe("missed day - grace expired", () => {
    it("resets streak to 1 and sets a new grace period", async () => {
      const pastGrace = new Date(Date.now() - 60 * 1000); // expired
      vi.mocked(db.limit)
        .mockResolvedValueOnce([{ streakCount: 10, graceUntil: pastGrace }])
        .mockResolvedValueOnce([{ createdAt: daysAgo(3) }]); // 3 days ago
      await updateStreak(USER_ID);
      const setArg = vi.mocked(db.set).mock.calls[0][0] as Record<string, unknown>;
      expect(setArg.streakCount).toBe(1);
      expect(setArg.graceUntil).not.toBeNull();
    });

    it("resets streak to 1 when there was no grace period set", async () => {
      vi.mocked(db.limit)
        .mockResolvedValueOnce([{ streakCount: 7, graceUntil: null }])
        .mockResolvedValueOnce([{ createdAt: daysAgo(5) }]);
      await updateStreak(USER_ID);
      const setArg = vi.mocked(db.set).mock.calls[0][0] as Record<string, unknown>;
      expect(setArg.streakCount).toBe(1);
      expect(setArg.graceUntil).not.toBeNull();
    });
  });

  describe("redis dedup key", () => {
    it("sets the redis key after a successful update", async () => {
      vi.mocked(db.limit)
        .mockResolvedValueOnce([{ streakCount: 2, graceUntil: null }])
        .mockResolvedValueOnce([{ createdAt: daysAgo(1) }]);
      await updateStreak(USER_ID);
      expect(vi.mocked(redis.setex)).toHaveBeenCalled();
      const [key, ttl, value] = (vi.mocked(redis.setex) as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(key).toContain(USER_ID);
      expect(ttl).toBe(25 * 60 * 60);
      expect(value).toBe("1");
    });
  });
});
