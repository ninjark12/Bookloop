import { NextRequest, NextResponse } from "next/server"
import { db } from "@/db"
import { books, readingProgress } from "@/db/schema"
import { eq, InferSelectModel } from "drizzle-orm"
import { getSession } from "@/lib/get-session"
import { z } from "zod"

const addBookSchema = z.object({
  bookId: z.string().uuid().optional(),
  olKey: z.string().optional(),
  title: z.string().min(1).max(500),
  author: z.string().min(1).max(500),
  coverUrl: z.string().url().nullable().optional(),
  publishedYear: z.number().int().nullable().optional(),
  description: z.string().nullable().optional(),
  status: z.enum(["READING", "READ", "TBR", "DNF"]).default("TBR"),
})

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await request.json()
  const result = addBookSchema.safeParse(body)
  if (!result.success) {
    return NextResponse.json(
      { error: "Invalid data", details: result.error.flatten() },
      { status: 400 }
    )
  }

  const data = result.data

  // 1. Resolve the book row
  let book: InferSelectModel<typeof books> | undefined

  if (data.bookId) {
    // Caller already has a DB id — straight lookup
    const [existing] = await db
      .select()
      .from(books)
      .where(eq(books.id, data.bookId))
      .limit(1)

    if (!existing) {
      return NextResponse.json({ error: "Book not found" }, { status: 404 })
    }
    book = existing
  } else {
    // OL result — write-through: insert into local catalog so it becomes
    // searchable immediately. ON CONFLICT DO NOTHING is safe under concurrent
    // requests: at most one INSERT wins; the loser gets an empty returning()
    // and falls through to fetch the row the winner created.
    const [inserted] = await db
      .insert(books)
      .values({
        olKey: data.olKey ?? null,
        title: data.title,
        author: data.author,
        coverUrl: data.coverUrl ?? null,
        publishedYear: data.publishedYear ?? null,
        description: data.description ?? null,
      })
      .onConflictDoNothing({ target: books.olKey })
      .returning()

    if (inserted) {
      book = inserted
    } else if (data.olKey) {
      // Row already existed — fetch it
      const [existing] = await db
        .select()
        .from(books)
        .where(eq(books.olKey, data.olKey))
        .limit(1)
      book = existing
    }

    if (!book) {
      return NextResponse.json({ error: "Failed to resolve book" }, { status: 500 })
    }
  }

  // 2. Create or update reading progress for this user + book
  const [progress] = await db
    .insert(readingProgress)
    .values({
      userId: session.user.id,
      bookId: book.id,
      status: data.status,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [readingProgress.userId, readingProgress.bookId],
      set: {
        status: data.status,
        updatedAt: new Date(),
      },
    })
    .returning()

  return NextResponse.json({ book, progress }, { status: 201 })
}

