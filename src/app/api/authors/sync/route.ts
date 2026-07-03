import { NextResponse } from "next/server";
import { db } from "@/db";
import { books, readingProgress } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSession } from "@/lib/get-session";
import { ensureAuthorFollowed } from "@/lib/author-sync";

// POST /api/authors/sync
// Registers every distinct author from the user's book library with Gator
// and creates author follows so they appear in the news feed.
// Safe to call multiple times — all operations are idempotent.
export async function POST() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;

  // Get all distinct author names from books the user has added
  const rows = await db
    .selectDistinct({ author: books.author })
    .from(readingProgress)
    .innerJoin(books, eq(readingProgress.bookId, books.id))
    .where(eq(readingProgress.userId, userId));

  const authorNames = rows.map((r) => r.author).filter(Boolean);

  // Register + follow each in parallel (ensureAuthorFollowed is safe to fan out)
  await Promise.all(authorNames.map((name) => ensureAuthorFollowed(userId, name)));

  return NextResponse.json({ synced: authorNames.length, authors: authorNames });
}
