import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/get-session";
import { db } from "@/db";
import { friendRequests } from "@/db/schema";
import { and, eq } from "drizzle-orm";
export const dynamic = "force-dynamic";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    if (!UUID_REGEX.test(id)) {
      return NextResponse.json({ error: "Invalid request id" }, { status: 400 });
    }

    let body: { action?: string };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { action } = body;
    if (action !== "accept" && action !== "decline") {
      return NextResponse.json({ error: "action must be 'accept' or 'decline'" }, { status: 400 });
    }

    const userId = session.user.id;

    // Only the receiver can accept or decline
    const [request] = await db
      .select({ id: friendRequests.id, status: friendRequests.status })
      .from(friendRequests)
      .where(and(eq(friendRequests.id, id), eq(friendRequests.receiverId, userId)))
      .limit(1);

    if (!request) {
      return NextResponse.json({ error: "Friend request not found" }, { status: 404 });
    }
    if (request.status !== "PENDING") {
      return NextResponse.json({ error: "Request is no longer pending" }, { status: 409 });
    }

    const newStatus = action === "accept" ? "ACCEPTED" : "DECLINED";
    await db
      .update(friendRequests)
      .set({ status: newStatus })
      .where(eq(friendRequests.id, id));

    return NextResponse.json({ status: newStatus });
  } catch (e) {
    console.error("[PATCH /api/friends/request/[id]]", e);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
