import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/get-session";
import { db } from "@/db";
import {
  journalEntries,
  readingProgress,
  books,
  users,
  friendRequests,
  authorFollows,
  authors,
} from "@/db/schema";
import { and, eq, inArray, desc, or } from "drizzle-orm";
import { getPostsForAuthors } from "@/lib/gator-client";
import { getSpoilerTags } from "@/lib/bedrock";

function isSpoiler(entryChapterEnd: number, viewerBookStatus: string, viewerChapter: number | null): boolean {
  if (viewerBookStatus === "READ") {
    return false;
  } else {
    return entryChapterEnd > (viewerChapter ?? 0);
  }
}

type FriendEntry = {
  id: string;
  content: string | null;
  chapterStart: number;
  chapterEnd: number;
  scope: string;
  createdAt: Date;
  isPublic: boolean | null;
  authorId: string;
  authorName: string | null;
  bookId: string;
  bookTitle: string;
  bookCoverUrl: string | null;
  spoilered: boolean;
  spoilerTags: string[];
};

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;
    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get("page") ?? "0", 10);
    const limit = 20;

    // -- 1. Friends activity --

    const acceptedFriends = await db
      .select({ senderId: friendRequests.senderId, receiverId: friendRequests.receiverId })
      .from(friendRequests)
      .where(
        and(
          eq(friendRequests.status, "ACCEPTED"),
          or(
            eq(friendRequests.senderId, userId),
            eq(friendRequests.receiverId, userId)
          )
        )
      );

    // Extract the other person's ID from each accepted request
    const followingIds = acceptedFriends.map((r) =>
      r.senderId === userId ? r.receiverId : r.senderId
    );

    let friendEntries: FriendEntry[] = [];

    if (followingIds.length > 0) {
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

      const bookIds = [...new Set(rawEntries.map((e) => e.bookId))];
      const viewerProgress =
        bookIds.length > 0
          ? await db
            .select({
              bookId: readingProgress.bookId,
              furthestChapter: readingProgress.furthestChapter,
              status: readingProgress.status
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
        viewerProgress.map((p) => [p.bookId, p])
      );

      // First pass: determine spoiler status for every entry
      const withSpoilerFlag = rawEntries.map((entry) => {
        const prog = progressMap.get(entry.bookId);
        return {
          ...entry,
          spoilered: isSpoiler(entry.chapterEnd, prog?.status ?? "TBR", prog?.furthestChapter ?? null),
        };
      });

      // Second pass: fetch AI tags for spoilered entries in parallel.
      // Non-spoilered entries resolve immediately with [].
      // getSpoilerTags never throws, so Promise.all is safe here.
      const tagResults = await Promise.all(
        withSpoilerFlag.map((entry) =>
          entry.spoilered ? getSpoilerTags(entry.content ?? "") : Promise.resolve([])
        )
      );

      friendEntries = withSpoilerFlag.map((entry, i): FriendEntry => ({
        ...entry,
        // Always send content — spoiler hiding is the client's job
        content: entry.content,
        spoilerTags: tagResults[i],
      }));
    }

    // -- 2. Author news from Gator --

    const followedAuthors = await db
      .select({ gatorAuthorId: authors.gatorAuthorId, name: authors.name })
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
      friendsCount: followingIds.length,
      followedAuthorsCount: followedAuthors.length,
    });

  } catch (e) {
    console.error("[GET /api/feed] unhandled error:", e);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
