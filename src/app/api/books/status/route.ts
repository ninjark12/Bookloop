import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { readingProgress } from "@/db/schema";
import { and, eq } from "drizzle-orm";
export const dynamic = "force-dynamic"
const VALID_STATUSES = ["READING", "READ", "TBR", "DNF"] as const;
type Status = (typeof VALID_STATUSES)[number];

export async function PATCH(req: NextRequest) {
  // -- Auth --
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // -- Body --
  let bookId: string;
  let status: Status;

  try {
    const body = await req.json();
    bookId = body.bookId;
    status = body.status;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!bookId || typeof bookId !== "string") {
    return NextResponse.json({ error: "bookId is required" }, { status: 400 });
  }

  if (!VALID_STATUSES.includes(status)) {
    return NextResponse.json(
      { error: `status must be one of: ${VALID_STATUSES.join(", ")}` },
      { status: 400 }
    );
  }

  // -- Update -- (userId always from session, never request body)
  const updated = await db
    .update(readingProgress)
    .set({
      status,
      // Mark finished_at when moving to READ or DNF, clear it otherwise
      finishedAt:
        status === "READ" || status === "DNF" ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(readingProgress.bookId, bookId),
        eq(readingProgress.userId, session.user.id)
      )
    )
    .returning();

  if (updated.length === 0) {
    return NextResponse.json(
      { error: "Reading progress record not found" },
      { status: 404 }
    );
  }

  return NextResponse.json({ progress: updated[0] });
}
