import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { sendDailyReminderEmail } from "@/lib/email";
import { toLocalDateStr } from "@/lib/streak";
import { verifySignatureAppRouter } from "@upstash/qstash/nextjs";
import { redis } from "@/lib/redis";

// Called by QStash 12 hours after a user writes a journal entry.
// Sends a daily reminder if they haven't written again that day.
export const POST = verifySignatureAppRouter(async (req: NextRequest) => {
  const { userId } = await req.json() as { userId: string };

  if (!userId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }

  const [user] = await db
    .select({
      email: users.email,
      name: users.name,
      streakCount: users.streakCount,
      graceUntil: users.graceUntil,
      lastEntryDate: users.lastEntryDate,
      emailNotifications: users.emailNotifications,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user || !user.email || !user.emailNotifications) {
    return NextResponse.json({ skipped: "no email or notifications off" });
  }

  const todayStr = toLocalDateStr(new Date());

  // Skip if they already wrote today
  if (user.lastEntryDate === todayStr) {
    return NextResponse.json({ skipped: "wrote today" });
  }

  // Skip if their streak has already expired (no active grace window)
  if (!user.graceUntil || new Date(user.graceUntil) <= new Date()) {
    return NextResponse.json({ skipped: "no active streak" });
  }

  // Dedup: one reminder per user per day
  const dedupKey = `reminder:daily:sent:${userId}:${todayStr}`;
  let alreadySent = false;
  try {
    alreadySent = (await redis.get(dedupKey)) !== null;
  } catch {
    // Redis unavailable — proceed without dedup
  }
  if (alreadySent) {
    return NextResponse.json({ skipped: "already sent today" });
  }

  await sendDailyReminderEmail({
    to: user.email,
    name: user.name?.split(" ")[0] ?? "there",
    streakCount: user.streakCount ?? 1,
    graceUntil: new Date(user.graceUntil),
  });

  try {
    // TTL until end of day so the key expires at midnight
    const now = new Date();
    const endOfDay = new Date(now);
    endOfDay.setHours(23, 59, 59, 999);
    const ttlSeconds = Math.ceil((endOfDay.getTime() - now.getTime()) / 1000);
    await redis.setex(dedupKey, ttlSeconds, "1");
  } catch {
    // Non-fatal
  }

  return NextResponse.json({ sent: true });
});
