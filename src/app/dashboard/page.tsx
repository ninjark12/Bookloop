import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { db } from "@/db"
import { readingProgress, books, users } from "@/db/schema"
import { eq } from "drizzle-orm"
import DashboardClient from "@/components/DashboardClient"

export default async function Dashboard() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect("/login")

  const [userBooks, userData] = await Promise.all([
    db
      .select({
        id: books.id,
        title: books.title,
        author: books.author,
        coverUrl: books.coverUrl,
        status: readingProgress.status,
        furthestChapter: readingProgress.furthestChapter,
      })
      .from(readingProgress)
      .innerJoin(books, eq(readingProgress.bookId, books.id))
      .where(eq(readingProgress.userId, session.user.id)),

    db
      .select({ streakCount: users.streakCount })
      .from(users)
      .where(eq(users.id, session.user.id))
      .limit(1)
      .then(rows => rows[0]),
  ])

  const streak = userData?.streakCount ?? 0

  return <DashboardClient books={userBooks} streak={streak} />
}
