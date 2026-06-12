import { describe, it, expect, vi } from "vitest";
import { db } from "@/db";
import { redis } from "@/lib/redis";
import { updateStreak } from "@/lib/streak";

const USER_ID = "user-123";

function daysAgoStr(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const baseUser = { streakCount: 0, longestStreak: 0, graceUntil: null, lastEntryDate: null };

describe("updateStreak", () => {
  describe("Redis fast-path dedup", () => {
    it("returns early without DB call when streak key already cached", async () => {
      vi.mocked(redis.get).mockResolvedValueOnce("3");
      await updateStreak(USER_ID);
      expect(vi.mocked(db.update)).not.toHaveBeenCalled();
    });
  });

  describe("user not found", () => {
    it("exits early when user row does not exist", async () => {
      vi.mocked(db.limit).mockResolvedValueOnce([]);
      await updateStreak(USER_ID);
      expect(vi.mocked(db.update)).not.toHaveBeenCalled();
    });
  });

  describe("first ever entry", () => {
    it("sets streak to 1 and clears graceUntil", async () => {
      vi.mocked(db.limit).mockResolvedValueOnce([{ ...baseUser }]);
      await updateStreak(USER_ID);
      const setArg = vi.mocked(db.set).mock.calls[0][0] as Record<string, unknown>;
      expect(setArg.streakCount).toBe(1);
      expect(setArg.graceUntil).toBeNull();
      expect(setArg.longestStreak).toBe(1);
    });
  });

  describe("consecutive day", () => {
    it("increments streak and clears graceUntil", async () => {
      vi.mocked(db.limit).mockResolvedValueOnce([{
        ...baseUser, streakCount: 5, longestStreak: 8, lastEntryDate: daysAgoStr(1),
      }]);
      await updateStreak(USER_ID);
      const setArg = vi.mocked(db.set).mock.calls[0][0] as Record<string, unknown>;
      expect(setArg.streakCount).toBe(6);
      expect(setArg.graceUntil).toBeNull();
      expect(setArg.longestStreak).toBe(8); // 6 < 8, longest unchanged
    });

    it("updates longestStreak when new streak exceeds it", async () => {
      vi.mocked(db.limit).mockResolvedValueOnce([{
        ...baseUser, streakCount: 9, longestStreak: 9, lastEntryDate: daysAgoStr(1),
      }]);
      await updateStreak(USER_ID);
      const setArg = vi.mocked(db.set).mock.calls[0][0] as Record<string, unknown>;
      expect(setArg.streakCount).toBe(10);
      expect(setArg.longestStreak).toBe(10);
    });
  });

  describe("same calendar day", () => {
    it("does not change streakCount when writing again today", async () => {
      vi.mocked(db.limit).mockResolvedValueOnce([{
        ...baseUser, streakCount: 3, longestStreak: 5, lastEntryDate: todayStr(),
      }]);
      await updateStreak(USER_ID);
      const setArg = vi.mocked(db.set).mock.calls[0][0] as Record<string, unknown>;
      expect(setArg.streakCount).toBe(3);
    });
  });

  describe("missed day - in grace period", () => {
    it("continues the streak when writing during the grace window", async () => {
      const futureGrace = new Date(Date.now() + 60 * 60 * 1000);
      vi.mocked(db.limit).mockResolvedValueOnce([{
        ...baseUser, streakCount: 10, longestStreak: 10,
        graceUntil: futureGrace, lastEntryDate: daysAgoStr(2),
      }]);
      await updateStreak(USER_ID);
      const setArg = vi.mocked(db.set).mock.calls[0][0] as Record<string, unknown>;
      expect(setArg.streakCount).toBe(11);
      expect(setArg.graceUntil).toBeNull();
    });
  });

  describe("missed day - grace expired", () => {
    it("resets streak to 1 and sets a new grace period", async () => {
      const pastGrace = new Date(Date.now() - 60 * 1000);
      vi.mocked(db.limit).mockResolvedValueOnce([{
        ...baseUser, streakCount: 10, longestStreak: 10,
        graceUntil: pastGrace, lastEntryDate: daysAgoStr(3),
      }]);
      await updateStreak(USER_ID);
      const setArg = vi.mocked(db.set).mock.calls[0][0] as Record<string, unknown>;
      expect(setArg.streakCount).toBe(1);
      expect(setArg.graceUntil).not.toBeNull();
    });

    it("resets streak to 1 when there was no grace period set", async () => {
      vi.mocked(db.limit).mockResolvedValueOnce([{
        ...baseUser, streakCount: 7, longestStreak: 7, lastEntryDate: daysAgoStr(5),
      }]);
      await updateStreak(USER_ID);
      const setArg = vi.mocked(db.set).mock.calls[0][0] as Record<string, unknown>;
      expect(setArg.streakCount).toBe(1);
      expect(setArg.graceUntil).not.toBeNull();
    });
  });

  describe("redis cache write", () => {
    it("writes the new streak count to Redis after a DB update", async () => {
      vi.mocked(db.limit).mockResolvedValueOnce([{
        ...baseUser, streakCount: 2, longestStreak: 3, lastEntryDate: daysAgoStr(1),
      }]);
      await updateStreak(USER_ID);
      expect(vi.mocked(redis.setex)).toHaveBeenCalled();
      const [key, ttl, value] = (vi.mocked(redis.setex) as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(key).toContain(USER_ID);
      expect(ttl).toBe(25 * 60 * 60);
      expect(value).toBe("3"); // newStreak = 2 + 1
    });
  });
});
