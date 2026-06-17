import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/get-session";
import { db } from "@/db";
import { readingProgress, journalEntries } from "@/db/schema";
import { and, eq } from "drizzle-orm";

export async function DELETE(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let bookId: string;
    try {
      const body = await req.json();
      bookId = body.bookId;
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    if (!bookId || typeof bookId !== "string") {
      return NextResponse.json({ error: "bookId is required" }, { status: 400 });
    }

    const userId = session.user.id;

    // Wrap both deletes in a transaction so a partial failure
    // never leaves orphaned journal entries behind
    const deleted = await db.transaction(async (tx) => {
      await tx
        .delete(journalEntries)
        .where(and(eq(journalEntries.bookId, bookId), eq(journalEntries.userId, userId)));

      return tx
        .delete(readingProgress)
        .where(and(eq(readingProgress.bookId, bookId), eq(readingProgress.userId, userId)))
        .returning();
    });

    if (deleted.length === 0) {
      return NextResponse.json(
        { error: "Book not found in your reading list" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });

  } catch (e) {
    console.error("[DELETE /api/books/remove] unhandled error:", e);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
