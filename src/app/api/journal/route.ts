import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { journalEntries, readingProgress } from "@/db/schema";
import { and, eq } from "drizzle-orm";
export const dynamic = "force-dynamic"
const VALID_SCOPES = ["CHAPTER", "RANGE", "WHOLE_BOOK"] as const;
type Scope = (typeof VALID_SCOPES)[number];

// Always returns JSON -- even on unexpected server errors.
// The "JSON.parse: unexpected end of data" client error was caused by
// unhandled DB exceptions reaching Next.js which returns an empty body.

export async function POST(req: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let body: {
      bookId: string;
      chapterStart: number;
      chapterEnd: number;
      scope: Scope;
      content: string;
      isPublic?: boolean;
    };

    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { bookId, chapterStart, chapterEnd, scope, content, isPublic = false } = body;

    if (!bookId || typeof bookId !== "string") {
      return NextResponse.json({ error: "bookId is required" }, { status: 400 });
    }
    if (!content || !content.trim()) {
      return NextResponse.json({ error: "content is required" }, { status: 400 });
    }
    if (!VALID_SCOPES.includes(scope)) {
      return NextResponse.json(
        { error: `scope must be one of: ${VALID_SCOPES.join(", ")}` },
        { status: 400 }
      );
    }

    const userId = session.user.id;

    const resolvedStart = scope === "WHOLE_BOOK" ? 9999 : chapterStart;
    const resolvedEnd =
      scope === "WHOLE_BOOK" ? 9999
        : scope === "CHAPTER" ? chapterStart
          : chapterEnd;

    // Duplicate chapter guard
    const existing = await db
      .select({ id: journalEntries.id })
      .from(journalEntries)
      .where(
        and(
          eq(journalEntries.userId, userId),
          eq(journalEntries.bookId, bookId),
          eq(journalEntries.chapterStart, resolvedStart),
          eq(journalEntries.chapterEnd, resolvedEnd)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      const label =
        scope === "WHOLE_BOOK" ? "the whole book"
          : scope === "CHAPTER" ? `chapter ${resolvedStart}`
            : `chapters ${resolvedStart}-${resolvedEnd}`;
      return NextResponse.json(
        { error: `You already have an entry for ${label}. Edit the existing one instead.` },
        { status: 409 }
      );
    }

    const [entry] = await db
      .insert(journalEntries)
      .values({
        userId,
        bookId,
        chapterStart: resolvedStart,
        chapterEnd: resolvedEnd,
        scope,
        content: content.trim(),
        isPublic,
        updatedAt: new Date(),
      })
      .returning();

    // Advance furthestChapter -- never regress, never throw if this fails
    try {
      await db
        .update(readingProgress)
        .set({ furthestChapter: resolvedEnd, updatedAt: new Date() })
        .where(
          and(
            eq(readingProgress.userId, userId),
            eq(readingProgress.bookId, bookId)
          )
        );
    } catch (e) {
      // Non-fatal: entry is saved, streak update failure shouldn't block the response
      console.error("[POST /api/journal] furthestChapter update failed:", e);
    }

    return NextResponse.json({ entry }, { status: 201 });

  } catch (e: unknown) {
    // Catch-all: always return JSON so the client never sees an empty body
    console.error("[POST /api/journal] unhandled error:", e);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let entryId: string;
    let content: string;
    let isPublic: boolean | undefined;

    try {
      const body = await req.json();
      entryId = body.entryId;
      content = body.content;
      isPublic = typeof body.isPublic === "boolean" ? body.isPublic : undefined;
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    if (!entryId || typeof entryId !== "string") {
      return NextResponse.json({ error: "entryId is required" }, { status: 400 });
    }
    if (!content || !content.trim()) {
      return NextResponse.json({ error: "content is required" }, { status: 400 });
    }

    const userId = session.user.id;

    const [updated] = await db
      .update(journalEntries)
      .set({
        content: content.trim(),
        updatedAt: new Date(),
        ...(isPublic !== undefined && { isPublic }),
      })
      .where(
        and(
          eq(journalEntries.id, entryId),
          eq(journalEntries.userId, userId)
        )
      )
      .returning();

    if (!updated) {
      return NextResponse.json(
        { error: "Entry not found or does not belong to you" },
        { status: 404 }
      );
    }

    return NextResponse.json({ entry: updated });

  } catch (e: unknown) {
    console.error("[PATCH /api/journal] unhandled error:", e);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let entryId: string;

    try {
      const body = await req.json();
      entryId = body.entryId;
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    if (!entryId || typeof entryId !== "string") {
      return NextResponse.json({ error: "entryId is required" }, { status: 400 });
    }

    const userId = session.user.id;

    const [deleted] = await db
      .delete(journalEntries)
      .where(
        and(
          eq(journalEntries.id, entryId),
          eq(journalEntries.userId, userId)
        )
      )
      .returning();

    if (!deleted) {
      return NextResponse.json(
        { error: "Entry not found or does not belong to you" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });

  } catch (e: unknown) {
    console.error("[DELETE /api/journal] unhandled error:", e);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
