import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api";
import { removeFriend } from "@/lib/db/friends";
import { redis, keys } from "@/lib/redis";

export const dynamic = "force-dynamic";

// DELETE /api/friends/[friendId] — remove an accepted friendship (either direction).
// friendId is a Better Auth user id (arbitrary text), not a UUID, so no assertUuid.
export const DELETE = withAuth(async (_req, session, params) => {
  const userId = session.user.id;
  const { friendId } = params;

  const removed = await removeFriend(userId, friendId);
  if (!removed) {
    return NextResponse.json({ error: "Friendship not found" }, { status: 404 });
  }

  // Both feeds now contain stale cross-entries — bust both cached first pages.
  await Promise.all([
    redis.del(keys.feed(userId)).catch(() => {}),
    redis.del(keys.feed(friendId)).catch(() => {}),
  ]);

  return NextResponse.json({ ok: true });
});
