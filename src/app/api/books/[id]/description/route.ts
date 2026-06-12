import { NextRequest, NextResponse } from "next/server"
import { db } from "@/db"
import { books } from "@/db/schema"
import { eq } from "drizzle-orm"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { fetchBookDescription } from "@/lib/book-search"

export const dynamic = "force-dynamic"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Invalid book ID" }, { status: 400 })
  }

  const [book] = await db
    .select({ id: books.id, olKey: books.olKey, description: books.description })
    .from(books)
    .where(eq(books.id, id))
    .limit(1)

  if (!book) {
    return NextResponse.json({ error: "Book not found" }, { status: 404 })
  }

  // DB hit — return immediately
  if (book.description) {
    return NextResponse.json({ description: book.description })
  }

  // No OL key to look up
  if (!book.olKey) {
    return NextResponse.json({ description: null })
  }

  // Fetch from OL and write through
  const description = await fetchBookDescription(book.olKey)

  if (description) {
    await db.update(books).set({ description }).where(eq(books.id, id))
  }

  return NextResponse.json({ description })
}
