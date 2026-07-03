import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { and, eq, gt, isNotNull, lt } from "drizzle-orm";
import { sendStreakReminderEmail } from "@/lib/email";
import { expireStreak, toLocalDateStr } from "@/lib/streak";
import { verifySignatureAppRouter } from "@upstash/qstash/nextjs";
import { redis } from "@/lib/redis";

// Called by QStash on a schedule. Sends streak reminder emails to at-risk users
// and zeroes streaks whose grace period has expired.
export const POST = verifySignatureAppRouter(async (_req: NextRequest) => {
  const now = new Date();
  const todayStr = toLocalDateStr(now);
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = toLocalDateStr(yesterday);

  const atRiskUsers = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      streakCount: users.streakCount,
      graceUntil: users.graceUntil,
      lastEntryDate: users.lastEntryDate,
    })
    .from(users)
    .where(
      and(
        eq(users.emailNotifications, true),
        isNotNull(users.graceUntil),
      )
    );

  let sent = 0;
  const errors: string[] = [];

  for (const user of atRiskUsers) {
    if (!user.graceUntil) continue;
    const graceDate = new Date(user.graceUntil);

    if (graceDate <= now) continue;
    if (!user.lastEntryDate || user.lastEntryDate >= yesterdayStr) continue;
    if (!user.email) continue;

    const dedupKey = `streak:reminder:sent:${user.id}`;
    let alreadySent = false;
    try {
      alreadySent = (await redis.get(dedupKey)) !== null;
    } catch {
      // Redis unavailable — proceed without dedup
    }
    if (alreadySent) continue;

    try {
      await sendStreakReminderEmail({
        to: user.email,
        name: user.name?.split(" ")[0] ?? "there",
        streakCount: user.streakCount ?? 1,
        graceUntil: graceDate,
      });

      try {
        const ttlSeconds = Math.ceil((graceDate.getTime() - now.getTime()) / 1000);
        await redis.setex(dedupKey, ttlSeconds, "1");
      } catch {
        // Non-fatal
      }
      sent++;
    } catch (e) {
      errors.push(`${user.id}: ${e instanceof Error ? e.message : "unknown"}`);
    }
  }

  const expired = await db
    .select({ id: users.id })
    .from(users)
    .where(
      and(
        isNotNull(users.graceUntil),
        lt(users.graceUntil, now),
        gt(users.streakCount, 0),
      )
    );

  let zeroed = 0;
  for (const user of expired) {
    try {
      await expireStreak(user.id);
      zeroed++;
    } catch (e) {
      errors.push(`expire:${user.id}: ${e instanceof Error ? e.message : "unknown"}`);
    }
  }

  return NextResponse.json({
    sent,
    zeroed,
    errors: errors.length > 0 ? errors : undefined,
  });
});
