import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { db } from "@/db"
import { readingProgress, books } from "@/db/schema"
import { eq, desc } from "drizzle-orm"
import DashboardClient from "@/components/DashboardClient"
import { getStreakCount } from "@/lib/streak"
export const dynamic = "force-dynamic"
export default async function Dashboard() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect("/login")

  const [userBooks, streak] = await Promise.all([
    db
      .select({
        id: books.id,
        title: books.title,
        author: books.author,
        coverUrl: books.coverUrl,
        status: readingProgress.status,
        furthestChapter: readingProgress.furthestChapter,
        createdAt: books.createdAt,
      })
      .from(readingProgress)
      .innerJoin(books, eq(readingProgress.bookId, books.id))
      .where(eq(readingProgress.userId, session.user.id))
      .orderBy(desc(books.createdAt)),
    getStreakCount(session.user.id),
  ])

  return <DashboardClient books={userBooks} streak={streak} userName={session.user.name} />
}
