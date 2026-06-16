import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { redis, keys, TTL } from "@/lib/redis";

// 3 calendar days ahead from the start of the write day.
// Write Monday → graceUntil = Thursday 00:00 local → Tuesday and Wednesday are valid.
const GRACE_DAYS = 3;

// "YYYY-MM-DD" in LOCAL time — avoids UTC/local-midnight mismatch when
// comparing dates across calendar day boundaries in non-UTC timezones.
export function toLocalDateStr(d: Date): string {
  return (
    `${d.getFullYear()}-` +
    `${String(d.getMonth() + 1).padStart(2, "0")}-` +
    `${String(d.getDate()).padStart(2, "0")}`
  );
}

function parseLocalDate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

// Value stored as "YYYY-MM-DD:count" so the fast-path can check the date
// without a DB read. TTL = seconds until graceUntil (midnight of write day + 3).
async function cacheStreak(userId: string, count: number, graceUntil: Date | null): Promise<void> {
  const now = Date.now();
  const todayStr = toLocalDateStr(new Date(now));
  const ttl = graceUntil
    ? Math.max(60, Math.ceil((graceUntil.getTime() - now) / 1000))
    : TTL.STREAK;
  try {
    await redis.setex(keys.streak(userId), ttl, `${todayStr}:${count}`);
  } catch (e) {
    console.error("[streak] cache write failed:", e);
  }
}

export async function updateStreak(userId: string): Promise<void> {
  const now = new Date();
  const todayStr = toLocalDateStr(now);

  // DB path — caller (journal route) already checked the Redis cache and only
  // calls here when the day has changed. DB dedup is a safety net for Redis-down.
  const [user] = await db
    .select({
      streakCount: users.streakCount,
      longestStreak: users.longestStreak,
      graceUntil: users.graceUntil,
      lastEntryDate: users.lastEntryDate,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) return;

  // Guard against same-day double-write when Redis is unavailable.
  if (user.lastEntryDate === todayStr) return;

  let newStreak: number;

  if (!user.lastEntryDate) {
    newStreak = 1;
  } else {
    const today = parseLocalDate(todayStr);
    const last = parseLocalDate(user.lastEntryDate);
    const dayDiff = Math.round((today.getTime() - last.getTime()) / 86400000);

    if (dayDiff === 1) {
      newStreak = (user.streakCount ?? 0) + 1;
    } else {
      // Missed one or more days — continue if inside the calendar grace window
      const graceExpiry = user.graceUntil ? new Date(user.graceUntil) : null;
      newStreak = graceExpiry && now < graceExpiry ? (user.streakCount ?? 0) + 1 : 1;
    }
  }

  // graceUntil = midnight of (write day + GRACE_DAYS).
  // Write Monday → Thursday 00:00 local → Tuesday and Wednesday are both valid.
  // Calendar-day anchor (not now + Nh) so the window is consistent regardless
  // of what time of day the entry is written.
  const writeDayStart = parseLocalDate(todayStr);
  const newGraceUntil = new Date(writeDayStart.getTime() + GRACE_DAYS * 24 * 60 * 60 * 1000);
  const newLongest = Math.max(newStreak, user.longestStreak ?? 0);

  await db
    .update(users)
    .set({ streakCount: newStreak, longestStreak: newLongest, graceUntil: newGraceUntil, lastEntryDate: todayStr })
    .where(eq(users.id, userId));

  await cacheStreak(userId, newStreak, newGraceUntil);
}

// Read the effective streak for display. Returns 0 once the 48h grace window expires.
// Reads Redis first; falls back to DB on a cache miss.
export async function getStreakCount(userId: string): Promise<number> {
  try {
    const cached = await redis.get(keys.streak(userId));
    if (cached !== null) {
      // Format: "YYYY-MM-DD:count" (or legacy plain count from old keys)
      const parts = cached.split(":");
      const count = parseInt(parts.length > 1 ? parts[1] : parts[0], 10);
      if (!isNaN(count)) return count;
    }
  } catch {}

  const [user] = await db
    .select({ streakCount: users.streakCount, graceUntil: users.graceUntil })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) return 0;
  if (user.graceUntil && new Date(user.graceUntil) < new Date()) return 0;
  return user.streakCount ?? 0;
}

// Zero out a user's streak in both DB and Redis (called by cron on grace expiry).
export async function expireStreak(userId: string): Promise<void> {
  await db
    .update(users)
    .set({ streakCount: 0, graceUntil: null })
    .where(eq(users.id, userId));
  try {
    await redis.del(keys.streak(userId));
  } catch {}
}
