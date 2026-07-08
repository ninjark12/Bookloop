import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api";
import { db } from "@/db";
import { friendRequests, users } from "@/db/schema";
import { and, eq, or } from "drizzle-orm";

// Migrated to the withAuth wrapper (session check + error boundary). The
// response shape is intentionally unchanged: { friends: [{ id, createdAt, friend }] }.
// The service-layer getFriends() returns flat rows and is reserved for new
// consumers — wiring it here would change the shape and break the frontend.
export const GET = withAuth(async (_req, session) => {
  const userId = session.user.id;

  const accepted = await db
    .select({
      id: friendRequests.id,
      createdAt: friendRequests.createdAt,
      senderId: friendRequests.senderId,
      receiverId: friendRequests.receiverId,
      friend: {
        id: users.id,
        name: users.name,
        displayName: users.displayName,
        discriminator: users.discriminator,
        image: users.image,
      },
    })
    .from(friendRequests)
    .innerJoin(
      users,
      or(
        and(eq(friendRequests.senderId, userId), eq(users.id, friendRequests.receiverId)),
        and(eq(friendRequests.receiverId, userId), eq(users.id, friendRequests.senderId))
      )
    )
    .where(eq(friendRequests.status, "ACCEPTED"));

  const friends = accepted.map(({ id, createdAt, friend }) => ({ id, createdAt, friend }));

  return NextResponse.json({ friends });
});
