import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { and, eq, gt, isNotNull, lt } from "drizzle-orm";
import { sendStreakReminderEmail } from "@/lib/email";
import { expireStreak, toLocalDateStr } from "@/lib/streak";

// This route is called by Vercel Cron (see vercel.json).
// It runs every hour and sends reminder emails to users whose
// streak grace period is active and who have opted in.
//
// To protect against arbitrary callers, Vercel sets the
// Authorization header to CRON_SECRET on every invocation.

export async function GET(req: NextRequest) {
  const secret = req.headers.get("authorization");
  if (secret !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const todayStr = toLocalDateStr(now);
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = toLocalDateStr(yesterday);

  // Find users who haven't written today but still have an active grace window.
  // graceUntil is now set on every write (48h ahead), so we must also check
  // lastEntryDate to avoid emailing users who already wrote today.
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

    // Skip if grace has already expired
    if (graceDate <= now) continue;

    // Email only on day 2 of the missed streak (e.g. Wednesday when last wrote Monday).
    // dayDiff = 1 (wrote yesterday) means they're still on track — no reminder needed.
    // dayDiff >= 2 (wrote day-before-yesterday or earlier) is the at-risk window.
    if (!user.lastEntryDate || user.lastEntryDate >= yesterdayStr) continue;

    // Skip if email is missing
    if (!user.email) continue;

    // Dedup: only email once per grace period per user
    // Key expires when the grace period does. Redis failure → skip dedup
    // and allow the email (risk one duplicate) rather than blocking all sends.
    const { redis } = await import("@/lib/redis");
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

      // Mark as sent -- TTL matches when the grace period expires
      try {
        const ttlSeconds = Math.ceil((graceDate.getTime() - now.getTime()) / 1000);
        await redis.setex(dedupKey, ttlSeconds, "1");
      } catch {
        // Non-fatal: email was sent; we just won't deduplicate this run
      }
      sent++;
    } catch (e) {
      errors.push(`${user.id}: ${e instanceof Error ? e.message : "unknown"}`);
    }
  }

  // Zero out streaks whose grace period has expired
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
}
