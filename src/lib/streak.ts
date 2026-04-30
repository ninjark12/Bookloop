import { db } from "@/db"
import { users } from "@/db/schema"
import { eq } from "drizzle-orm"

export async function updateStreak(userId: string): Promise<number> {
  const today = getDateKey(0)
  const yesterday = getDateKey(-1)

  const [user] = await db
    .select({
      streakCount: users.streakCount,
      longestStreak: users.longestStreak,
      lastEntryDate: users.lastEntryDate,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)

  if (!user) return 0

  // Already journaled today — don't double count
  if (user.lastEntryDate === today) return user.streakCount ?? 0

  let newStreak: number

  if (!user.lastEntryDate) {
    // First ever entry
    newStreak = 1
  } else if (user.lastEntryDate === yesterday) {
    // Continued the streak
    newStreak = (user.streakCount ?? 0) + 1
  } else {
    // Missed a day — reset
    newStreak = 1
  }

  const newLongest = Math.max(newStreak, user.longestStreak ?? 0)

  await db
    .update(users)
    .set({
      streakCount: newStreak,
      longestStreak: newLongest,
      lastEntryDate: today,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId))

  return newStreak
}

function getDateKey(offsetDays: number): string {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  return d.toISOString().slice(0, 10) // "YYYY-MM-DD"
}
