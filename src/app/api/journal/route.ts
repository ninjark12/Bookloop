import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/get-session";
import { db } from "@/db";
import { journalEntries, readingProgress } from "@/db/schema";
import { and, eq, ne } from "drizzle-orm";
import { updateStreak, toLocalDateStr } from "@/lib/streak";
import { redis, keys } from "@/lib/redis";
import { getSpoilerTags } from "@/lib/bedrock";
import { enqueueForTagging } from "@/lib/tagging";
import { Client as QStashClient } from "@upstash/qstash";

function scheduleReminderEmail(userId: string) {
  const token = process.env.QSTASH_TOKEN;
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!token || !baseUrl) return;
  const qstash = new QStashClient({ token });
  void qstash.publishJSON({
    url: `${baseUrl}/api/reminders/daily`,
    body: { userId },
    delay: 12 * 60 * 60, // 12 hours in seconds
  }).catch((e) => console.error("[journal] QStash schedule failed:", e));
}

function computeAndStoreTags(entryId: string, content: string) {
  void getSpoilerTags(content)
    .then((tags) => {
      if (tags.length > 0) {
        return db.update(journalEntries)
          .set({ spoilerTags: tags })
          .where(eq(journalEntries.id, entryId));
      }
    })
    .catch((e) => console.error("[journal] spoilerTags computation failed:", e));
}

const VALID_SCOPES = ["CHAPTER", "RANGE", "WHOLE_BOOK"] as const;
type Scope = (typeof VALID_SCOPES)[number];

// Always returns JSON -- even on unexpected server errors.
// The "JSON.parse: unexpected end of data" client error was caused by
// unhandled DB exceptions reaching Next.js which returns an empty body.

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
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

    // Advance furthestChapter — non-fatal
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
      console.error("[POST /api/journal] furthestChapter update failed:", e);
    }

    // Compute spoiler tags in the background for public entries
    if (isPublic && content.trim().length >= 20) {
      computeAndStoreTags(entry.id, content.trim());
    }

    // Enqueue for taxonomy tagging + embedding (own + friends' search).
    // Runs for public and private entries; no-op unless the pipeline is set up.
    if (content.trim().length >= 20) {
      enqueueForTagging(entry.id, content.trim());
    }

    // Update streak — only when the day has actually changed.
    // Check the Redis cache here (at the write site) so updateStreak is only
    // called when a real journal entry changes the calendar day.
    try {
      let wroteToday = false;
      try {
        const cached = await redis.get(keys.streak(userId));
        if (cached !== null) wroteToday = cached.split(":")[0] === toLocalDateStr(new Date());
      } catch {}
      if (!wroteToday) await updateStreak(userId);
    } catch (e) {
      console.error("[POST /api/journal] streak update failed:", e);
    }

    // Schedule a daily reminder 12 hours from now in case they don't write again today
    scheduleReminderEmail(userId);

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
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let entryId: string;
    let content: string;
    let isPublic: boolean | undefined;
    let scope: Scope | undefined;
    let chapterStart: number | undefined;
    let chapterEnd: number | undefined;

    try {
      const body = await req.json();
      entryId = body.entryId;
      content = body.content;
      isPublic = typeof body.isPublic === "boolean" ? body.isPublic : undefined;
      scope = VALID_SCOPES.includes(body.scope) ? body.scope : undefined;
      chapterStart = typeof body.chapterStart === "number" ? body.chapterStart : undefined;
      chapterEnd = typeof body.chapterEnd === "number" ? body.chapterEnd : undefined;
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

    let resolvedStart: number | undefined;
    let resolvedEnd: number | undefined;

    if (scope !== undefined) {
      resolvedStart = scope === "WHOLE_BOOK" ? 9999 : (chapterStart ?? 1);
      resolvedEnd =
        scope === "WHOLE_BOOK" ? 9999
          : scope === "CHAPTER" ? (chapterStart ?? 1)
            : (chapterEnd ?? chapterStart ?? 1);

      // Duplicate guard: check no other entry for this book already covers this range
      const duplicate = await db
        .select({ id: journalEntries.id })
        .from(journalEntries)
        .where(
          and(
            eq(journalEntries.userId, userId),
            ne(journalEntries.id, entryId),
            eq(journalEntries.chapterStart, resolvedStart),
            eq(journalEntries.chapterEnd, resolvedEnd)
          )
        )
        .limit(1);

      if (duplicate.length > 0) {
        const label =
          scope === "WHOLE_BOOK" ? "the whole book"
            : scope === "CHAPTER" ? `chapter ${resolvedStart}`
              : `chapters ${resolvedStart}-${resolvedEnd}`;
        return NextResponse.json(
          { error: `You already have an entry for ${label}.` },
          { status: 409 }
        );
      }
    }

    const [updated] = await db
      .update(journalEntries)
      .set({
        content: content.trim(),
        updatedAt: new Date(),
        spoilerTags: null, // recompute below
        ...(isPublic !== undefined && { isPublic }),
        ...(scope !== undefined && { scope, chapterStart: resolvedStart, chapterEnd: resolvedEnd }),
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

    if ((updated.isPublic ?? false) && content.trim().length >= 20) {
      computeAndStoreTags(updated.id, content.trim());
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
    const session = await getSession();
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
