import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { redirect, notFound } from "next/navigation"
import { db } from "@/db"
import { journalEntries, books, readingProgress } from "@/db/schema"
import { eq, and, desc } from "drizzle-orm"
import JournalPageClient from "@/components/JournalPageClient"
export const dynamic = "force-dynamic"
export default async function JournalPage({
  params,
}: {
  params: Promise<{ bookId: string }>
}) {
  const { bookId } = await params

  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect("/login")

  const [book] = await db
    .select()
    .from(books)
    .where(eq(books.id, bookId))
    .limit(1)

  if (!book) notFound()

  const [entries, progress] = await Promise.all([
    db
      .select()
      .from(journalEntries)
      .where(
        and(
          eq(journalEntries.bookId, bookId),
          eq(journalEntries.userId, session.user.id)
        )
      )
      .orderBy(desc(journalEntries.createdAt)),

    db
      .select()
      .from(readingProgress)
      .where(
        and(
          eq(readingProgress.userId, session.user.id),
          eq(readingProgress.bookId, bookId)
        )
      )
      .limit(1)
      .then(rows => rows[0] ?? null),
  ])

  return (
    <JournalPageClient
      book={book}
      initialEntries={entries}
      progress={progress}
      userId={session.user.id}
    />
  )
}

