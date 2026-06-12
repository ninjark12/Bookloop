import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { redis, keys, TTL } from "@/lib/redis";

const GRACE_MS = 24 * 60 * 60 * 1000;

// "YYYY-MM-DD" in LOCAL time — avoids UTC/local-midnight mismatch when
// comparing dates across calendar day boundaries in non-UTC timezones.
function toLocalDateStr(d: Date): string {
  return (
    `${d.getFullYear()}-` +
    `${String(d.getMonth() + 1).padStart(2, "0")}-` +
    `${String(d.getDate()).padStart(2, "0")}`
  );
}

// Parse a "YYYY-MM-DD" string as LOCAL midnight.
// new Date("YYYY-MM-DD") parses as UTC midnight, giving wrong dayDiff values
// in non-UTC timezones (e.g. a user in EST sees dayDiff=0 on consecutive days).
function parseLocalDate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

async function cacheStreak(userId: string, count: number, graceUntil: Date | null): Promise<void> {
  const now = Date.now();
  const ttl = graceUntil
    ? Math.max(60, Math.ceil((graceUntil.getTime() - now) / 1000))
    : TTL.STREAK;
  try {
    await redis.setex(keys.streak(userId), ttl, String(count));
  } catch (e) {
    console.error("[streak] cache write failed:", e);
  }
}

export async function updateStreak(userId: string): Promise<void> {
  // Fast-path: if the streak key is already cached, the streak is current for
  // today — skip the DB round-trip entirely.
  try {
    const cached = await redis.get(keys.streak(userId));
    if (cached !== null) return;
  } catch {}

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

  const now = new Date();
  const todayStr = toLocalDateStr(now);

  let newStreak = user.streakCount ?? 0;
  let newGraceUntil: Date | null = user.graceUntil ? new Date(user.graceUntil) : null;

  if (!user.lastEntryDate) {
    newStreak = 1;
    newGraceUntil = null;
  } else {
    const today = parseLocalDate(todayStr);
    const last = parseLocalDate(user.lastEntryDate);
    const dayDiff = Math.round((today.getTime() - last.getTime()) / 86400000);

    if (dayDiff === 0) {
      // Same calendar day — already counted
    } else if (dayDiff === 1) {
      newStreak = (user.streakCount ?? 0) + 1;
      newGraceUntil = null;
    } else {
      const inGrace = newGraceUntil && now < newGraceUntil;
      if (inGrace) {
        newStreak = (user.streakCount ?? 0) + 1;
        newGraceUntil = null;
      } else {
        newStreak = 1;
        newGraceUntil = new Date(now.getTime() + GRACE_MS);
      }
    }
  }

  const newLongest = Math.max(newStreak, user.longestStreak ?? 0);

  await db
    .update(users)
    .set({
      streakCount: newStreak,
      longestStreak: newLongest,
      graceUntil: newGraceUntil,
      lastEntryDate: todayStr,
    })
    .where(eq(users.id, userId));

  await cacheStreak(userId, newStreak, newGraceUntil);
}

// Read the effective streak for display. Returns 0 if grace has expired.
// Reads Redis first; falls back to DB on a cache miss.
export async function getStreakCount(userId: string): Promise<number> {
  try {
    const cached = await redis.get(keys.streak(userId));
    if (cached !== null) return parseInt(cached, 10);
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
