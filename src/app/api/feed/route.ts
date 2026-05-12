import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import {
  journalEntries,
  readingProgress,
  books,
  users,
  userFollows,
  authorFollows,
  authors,
} from "@/db/schema";
import { and, eq, inArray, desc, sql } from "drizzle-orm";
import { getPostsForAuthors } from "@/lib/gator-client";

// Spoiler filter -- same logic as lib/spoiler.ts but applied inline
// so we don't duplicate the import in the server component
function isSpoiler(
  entryChapterEnd: number,
  viewerChapter: number | null
): boolean {
  return entryChapterEnd > (viewerChapter ?? 0);
}

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;
  const { searchParams } = new URL(req.url);
  const page = parseInt(searchParams.get("page") ?? "0", 10);
  const limit = 20;

  // -- 1. Friends activity --
  // Find who this user follows
  const following = await db
    .select({ followingId: userFollows.followingId })
    .from(userFollows)
    .where(eq(userFollows.followerId, userId));

  const followingIds = following.map((f) => f.followingId);

  let friendEntries: {
    id: string;
    content: string | null;
    chapterStart: number;
    chapterEnd: number;
    scope: string;
    createdAt: Date;
    isPublic: boolean;
    authorId: string;
    authorName: string | null;
    bookId: string;
    bookTitle: string;
    bookCoverUrl: string | null;
    spoilered: boolean;
  }[] = [];

  if (followingIds.length > 0) {
    // Fetch public entries from people the user follows
    const rawEntries = await db
      .select({
        id: journalEntries.id,
        content: journalEntries.content,
        chapterStart: journalEntries.chapterStart,
        chapterEnd: journalEntries.chapterEnd,
        scope: journalEntries.scope,
        createdAt: journalEntries.createdAt,
        isPublic: journalEntries.isPublic,
        authorId: users.id,
        authorName: users.name,
        bookId: books.id,
        bookTitle: books.title,
        bookCoverUrl: books.coverUrl,
      })
      .from(journalEntries)
      .innerJoin(books, eq(journalEntries.bookId, books.id))
      .innerJoin(users, eq(journalEntries.userId, users.id))
      .where(
        and(
          inArray(journalEntries.userId, followingIds),
          eq(journalEntries.isPublic, true)
        )
      )
      .orderBy(desc(journalEntries.createdAt))
      .limit(limit)
      .offset(page * limit);

    // Fetch viewer's own reading progress for all these books
    // to apply spoiler filtering
    const bookIds = [...new Set(rawEntries.map((e) => e.bookId))];
    const viewerProgress =
      bookIds.length > 0
        ? await db
          .select({
            bookId: readingProgress.bookId,
            furthestChapter: readingProgress.furthestChapter,
          })
          .from(readingProgress)
          .where(
            and(
              eq(readingProgress.userId, userId),
              inArray(readingProgress.bookId, bookIds)
            )
          )
        : [];

    const progressMap = new Map(
      viewerProgress.map((p) => [p.bookId, p.furthestChapter])
    );

    friendEntries = rawEntries.map((entry) => {
      const viewerChapter = progressMap.get(entry.bookId) ?? null;
      const spoilered = isSpoiler(entry.chapterEnd, viewerChapter);
      return {
        ...entry,
        // Null out content if it's a spoiler
        content: spoilered ? null : entry.content,
        spoilered,
      };
    });
  }

  // -- 2. Author news from Gator --
  const followedAuthors = await db
    .select({
      gatorAuthorId: authors.gatorAuthorId,
      name: authors.name,
    })
    .from(authorFollows)
    .innerJoin(authors, eq(authorFollows.authorId, authors.id))
    .where(eq(authorFollows.userId, userId));

  const gatorIds = followedAuthors
    .map((a) => a.gatorAuthorId)
    .filter((id): id is string => !!id);

  const authorNews = await getPostsForAuthors(gatorIds, page);

  return NextResponse.json({
    friends: friendEntries,
    authorNews: authorNews.content,
    authorNewsPages: authorNews.totalPages,
    followingCount: followingIds.length,
    followedAuthorsCount: followedAuthors.length,
  });
}
