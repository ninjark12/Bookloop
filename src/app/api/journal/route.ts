import { NextRequest, NextResponse } from "next/server"
import { db } from "@/db"
import { journalEntries, readingProgress } from "@/db/schema"
import { eq, desc, sql } from "drizzle-orm"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { z } from "zod"
import { updateStreak } from "@/lib/streak"
import { and } from "drizzle-orm"

const createEntrySchema = z.object({
  bookId: z.string().uuid(),
  chapterStart: z.number().int().min(1),
  chapterEnd: z.number().int().min(1),
  scope: z.enum(["CHAPTER", "RANGE", "WHOLE_BOOK"]),
  content: z.string().min(1).max(10000),
  isPublic: z.boolean().default(false),
})

export async function GET(request: NextRequest) {
  // 1. Check session — only logged in users can read entries
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // 2. Get bookId from query params
  const bookId = request.nextUrl.searchParams.get("bookId")
  if (!bookId) {
    return NextResponse.json({ error: "bookId is required" }, { status: 400 })
  }

  // 3. Query DB — only this user's entries for this book, newest first
  const entries = await db
    .select()
    .from(journalEntries)
    .where(
      and(
        eq(journalEntries.userId, session.user.id),
        eq(journalEntries.bookId, bookId)
      )
    )
    .orderBy(desc(journalEntries.createdAt))

  return NextResponse.json({ entries })
}

export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const body = await request.json();
  const result = createEntrySchema.safeParse(body);
  if (!result.success) {
    return NextResponse.json(
      { error: "Invalid Data", details: result.error.flatten() },
      { status: 400 }
    )

  }
  const data = result.data

  const [entry] = await db
    .insert(journalEntries)
    .values({
      userId: session.user.id,
      bookId: data.bookId,
      chapterStart: data.chapterStart,
      chapterEnd: data.chapterEnd,
      scope: data.scope,
      content: data.content,
      isPublic: data.isPublic,
      updatedAt: new Date(),
    })
    .returning()


  await updateStreak(session.user.id)

  await db
    .insert(readingProgress)
    .values({
      userId: session.user.id,
      bookId: data.bookId,
      furthestChapter: data.chapterEnd,
      status: "READING",
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [readingProgress.userId, readingProgress.bookId],
      set: {
        furthestChapter: sql`GREATEST(reading_progress.furthest_chapter, ${data.chapterEnd})`,
        updatedAt: new Date(),
      },
    })

  return NextResponse.json({ entry }, { status: 201 })
}
