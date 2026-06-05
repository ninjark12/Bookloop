import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/get-session";
import { db } from "@/db";
import { friendRequests, users } from "@/db/schema";
import { and, eq, or } from "drizzle-orm";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const userId = session.user.id;

    let body: { receiverId?: string };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { receiverId } = body;
    if (!receiverId || typeof receiverId !== "string") {
      return NextResponse.json({ error: "receiverId is required" }, { status: 400 });
    }
    if (receiverId === userId) {
      return NextResponse.json({ error: "Cannot send a friend request to yourself" }, { status: 400 });
    }

    const [receiver] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, receiverId))
      .limit(1);
    if (!receiver) return NextResponse.json({ error: "User not found" }, { status: 404 });

    // Check for any existing request between these two users (either direction)
    const [existing] = await db
      .select({ id: friendRequests.id, status: friendRequests.status, senderId: friendRequests.senderId })
      .from(friendRequests)
      .where(
        or(
          and(eq(friendRequests.senderId, userId), eq(friendRequests.receiverId, receiverId)),
          and(eq(friendRequests.senderId, receiverId), eq(friendRequests.receiverId, userId))
        )
      )
      .limit(1);

    if (existing) {
      if (existing.status === "ACCEPTED") {
        return NextResponse.json({ error: "Already friends" }, { status: 409 });
      }
      if (existing.status === "PENDING") {
        if (existing.senderId === userId) {
          return NextResponse.json({ error: "Friend request already pending" }, { status: 409 });
        }
        // They already sent me a request — auto-accept it
        await db
          .update(friendRequests)
          .set({ status: "ACCEPTED" })
          .where(eq(friendRequests.id, existing.id));
        return NextResponse.json({ status: "accepted" });
      }
      if (existing.status === "DECLINED" && existing.senderId === userId) {
        // My previous request was declined — re-send by updating
        await db
          .update(friendRequests)
          .set({ status: "PENDING" })
          .where(eq(friendRequests.id, existing.id));
        return NextResponse.json({ status: "pending" });
      }
      // Their previous request was declined by me — fall through to insert a fresh one
    }

    const [created] = await db
      .insert(friendRequests)
      .values({ senderId: userId, receiverId })
      .returning({ id: friendRequests.id });

    return NextResponse.json({ id: created.id }, { status: 201 });
  } catch (e) {
    console.error("[POST /api/friends/request]", e);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
