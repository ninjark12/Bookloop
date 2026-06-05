import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/get-session";
import { db } from "@/db";
import { friendRequests, users } from "@/db/schema";
import { and, eq } from "drizzle-orm";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const userId = session.user.id;

    const pending = await db
      .select({
        id: friendRequests.id,
        createdAt: friendRequests.createdAt,
        sender: {
          id: users.id,
          name: users.name,
          displayName: users.displayName,
          discriminator: users.discriminator,
          image: users.image,
        },
      })
      .from(friendRequests)
      .innerJoin(users, eq(friendRequests.senderId, users.id))
      .where(and(eq(friendRequests.receiverId, userId), eq(friendRequests.status, "PENDING")));

    return NextResponse.json({ requests: pending });
  } catch (e) {
    console.error("[GET /api/friends/requests]", e);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
