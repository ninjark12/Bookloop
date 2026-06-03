import { db } from "@/db";
import { users, journalEntries } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { redis } from "@/lib/redis";

// Redis key: one per user per calendar day
// TTL 25hrs so it survives midnight by an hour
function streakKey(userId: string): string {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  return `streak:awarded:${userId}:${today}`;
}

// Grace period duration in ms (24 hours)
const GRACE_MS = 24 * 60 * 60 * 1000;

export async function updateStreak(userId: string): Promise<void> {
  // -- Dedup: only award once per calendar day --
  // Redis failure is non-fatal -- worst case we double-count a streak day,
  // which is far better than blocking a journal entry save.
  let alreadyAwarded = false;
  try {
    alreadyAwarded = !!(await redis.get(streakKey(userId)));
  } catch (e) {
    console.error('[streak] redis.get failed, skipping dedup:', e);
  }
  if (alreadyAwarded) return;

  const [user] = await db
    .select({
      streakCount: users.streakCount,
      graceUntil: users.graceUntil,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) return;

  // Find when the last entry (before today) was created
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [lastEntry] = await db
    .select({ createdAt: journalEntries.createdAt })
    .from(journalEntries)
    .where(eq(journalEntries.userId, userId))
    .orderBy(desc(journalEntries.createdAt))
    .limit(1);

  const lastDate = lastEntry ? new Date(lastEntry.createdAt) : null;

  let newStreak = user.streakCount ?? 0;
  let newGraceUntil: Date | null = user.graceUntil ? new Date(user.graceUntil) : null;
  const now = new Date();

  if (!lastDate) {
    // First ever entry
    newStreak = 1;
    newGraceUntil = null;
  } else {
    const last = new Date(lastDate);
    last.setHours(0, 0, 0, 0);
    const dayDiff = Math.round((today.getTime() - last.getTime()) / 86400000);

    if (dayDiff === 0) {
      // Same calendar day -- streak already counted, just award Redis key
    } else if (dayDiff === 1) {
      // Consecutive day -- increment and clear any grace period
      newStreak = (user.streakCount ?? 0) + 1;
      newGraceUntil = null;
    } else {
      // Missed at least one day
      const inGrace = newGraceUntil && now < newGraceUntil;
      if (inGrace) {
        // Writing during grace period -- streak continues, clear grace
        newStreak = (user.streakCount ?? 0) + 1;
        newGraceUntil = null;
      } else {
        // Streak broken -- start fresh and set new grace period
        // (grace period allows them to recover tomorrow without losing again)
        newStreak = 1;
        newGraceUntil = new Date(now.getTime() + GRACE_MS);
      }
    }
  }

  // -- Write to DB --
  await db
    .update(users)
    .set({
      streakCount: newStreak,
      graceUntil: newGraceUntil,
    })
    .where(eq(users.id, userId));

  // -- Mark awarded for today (TTL 25hrs) --
  try {
    await redis.setex(streakKey(userId), 25 * 60 * 60, "1");
  } catch (e) {
    console.error('[streak] redis.setex failed:', e);
  }
}
