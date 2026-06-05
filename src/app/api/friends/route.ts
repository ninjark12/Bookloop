import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/get-session";
import { db } from "@/db";
import { friendRequests, users } from "@/db/schema";
import { and, eq, or } from "drizzle-orm";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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
  } catch (e) {
    console.error("[GET /api/friends]", e);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
