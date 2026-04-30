import { NextRequest, NextResponse } from "next/server"
import { db } from "@/db"
import { books, readingProgress } from "@/db/schema"
import { eq } from "drizzle-orm"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { z } from "zod"

const addBookSchema = z.object({
  // Either an existing book ID from our DB
  bookId: z.string().uuid().optional().or(z.literal(undefined)),
  // Or Open Library data to create a new book row
  olKey: z.string().optional(),
  title: z.string().min(1).max(500),
  author: z.string().min(1).max(500),
  coverUrl: z.string().url().nullable().optional(),
  publishedYear: z.number().int().nullable().optional(),
  status: z.enum(["READING", "READ", "TBR", "DNF"]).default("TBR"),
})

export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() })
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

  // 1. Find or create the book in our DB
  let book

  if (data.bookId && data.bookId.length > 0) {
    // Already in our DB — just look it up
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
    // From Open Library — check if we already have it by olKey
    if (data.olKey) {
      const [existing] = await db
        .select()
        .from(books)
        .where(eq(books.olKey, data.olKey))
        .limit(1)

      if (existing) {
        book = existing
      }
    }

    // Still no book — create it (write-through cache)
    if (!book) {
      const [newBook] = await db
        .insert(books)
        .values({
          olKey: data.olKey ?? null,
          title: data.title,
          author: data.author,
          coverUrl: data.coverUrl ?? null,
          publishedYear: data.publishedYear ?? null,
        })
        .returning()
      book = newBook
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

