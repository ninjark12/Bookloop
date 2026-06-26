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
import { and, eq, inArray, desc, or, lt } from "drizzle-orm";
import { getPostsForAuthors } from "@/lib/gator-client";
import { getSpoilerTags } from "@/lib/bedrock";
import { getJSON, setJSON, keys, TTL } from "@/lib/redis";

const LIMIT = 20;

function isSpoiler(entryChapterEnd: number, viewerBookStatus: string, viewerChapter: number | null): boolean {
  if (viewerBookStatus === "READ") return false;
  return entryChapterEnd > (viewerChapter ?? 0);
}

type FriendsCursor = { at: string; id: string };

function encodeCursor(at: Date, id: string): string {
  return Buffer.from(JSON.stringify({ at: at.toISOString(), id })).toString("base64url");
}

function decodeCursor(raw: string): FriendsCursor | null {
  try {
    return JSON.parse(Buffer.from(raw, "base64url").toString()) as FriendsCursor;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;
    const { searchParams } = new URL(req.url);
    const friendsCursorParam = searchParams.get("friendsCursor");
    const gatorCursorParam = searchParams.get("gatorCursor");
    const isFirstPage = !friendsCursorParam && !gatorCursorParam;

    // Serve first page from Redis cache
    if (isFirstPage) {
      const cached = await getJSON(keys.feed(userId));
      if (cached) return NextResponse.json(cached);
    }

    const friendsCursor = friendsCursorParam ? decodeCursor(friendsCursorParam) : null;

    // -- 1. Resolve friends --

    const [acceptedFriends, followedAuthors] = await Promise.all([
      db
        .select({ senderId: friendRequests.senderId, receiverId: friendRequests.receiverId })
        .from(friendRequests)
        .where(
          and(
            eq(friendRequests.status, "ACCEPTED"),
            or(eq(friendRequests.senderId, userId), eq(friendRequests.receiverId, userId))
          )
        ),
      db
        .select({ gatorAuthorId: authors.gatorAuthorId, name: authors.name })
        .from(authorFollows)
        .innerJoin(authors, eq(authorFollows.authorId, authors.id))
        .where(eq(authorFollows.userId, userId)),
    ]);

    const followingIds = acceptedFriends.map((r) =>
      r.senderId === userId ? r.receiverId : r.senderId
    );

    // -- 2. Friends entries (only when friendsCursor is present or it's the first page) --

    let friendEntries: {
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
      spoilerTags: string[] | null;
      spoilered: boolean;
      spoilerTagsResult: string[];
    }[] = [];
    let nextFriendsCursor: string | null = null;

    if (!gatorCursorParam && followingIds.length > 0) {
      const rawEntries = await db
        .select({
          id: journalEntries.id,
          content: journalEntries.content,
          chapterStart: journalEntries.chapterStart,
          chapterEnd: journalEntries.chapterEnd,
          scope: journalEntries.scope,
          createdAt: journalEntries.createdAt,
          isPublic: journalEntries.isPublic,
          spoilerTags: journalEntries.spoilerTags,
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
            eq(journalEntries.isPublic, true),
            friendsCursor
              ? or(
                  lt(journalEntries.createdAt, new Date(friendsCursor.at)),
                  and(
                    eq(journalEntries.createdAt, new Date(friendsCursor.at)),
                    lt(journalEntries.id, friendsCursor.id)
                  )
                )
              : undefined
          )
        )
        .orderBy(desc(journalEntries.createdAt), desc(journalEntries.id))
        .limit(LIMIT + 1);

      const hasMoreFriends = rawEntries.length > LIMIT;
      const page = hasMoreFriends ? rawEntries.slice(0, LIMIT) : rawEntries;

      if (hasMoreFriends) {
        const last = page[page.length - 1];
        nextFriendsCursor = encodeCursor(last.createdAt, last.id);
      }

      const bookIds = [...new Set(page.map((e) => e.bookId))];
      const viewerProgress = bookIds.length > 0
        ? await db
          .select({ bookId: readingProgress.bookId, furthestChapter: readingProgress.furthestChapter, status: readingProgress.status })
          .from(readingProgress)
          .where(and(eq(readingProgress.userId, userId), inArray(readingProgress.bookId, bookIds)))
        : [];
      const progressMap = new Map(viewerProgress.map((p) => [p.bookId, p]));

      // Tag entries: use stored tags if present, compute lazily for nulls
      const entriesToTag = page.map((entry) => {
        const prog = progressMap.get(entry.bookId);
        const spoilered = isSpoiler(entry.chapterEnd, prog?.status ?? "TBR", prog?.furthestChapter ?? null);
        return { ...entry, spoilered };
      });

      const tagResults = await Promise.all(
        entriesToTag.map(async (entry) => {
          if (!entry.spoilered) return [];
          if (entry.spoilerTags !== null) return entry.spoilerTags;
          // Lazy compute + persist for legacy entries without stored tags
          const tags = await getSpoilerTags(entry.content ?? "");
          if (tags.length > 0) {
            void db.update(journalEntries)
              .set({ spoilerTags: tags })
              .where(eq(journalEntries.id, entry.id))
              .catch(() => {});
          }
          return tags;
        })
      );

      friendEntries = entriesToTag.map((entry, i) => ({
        ...entry,
        spoilerTagsResult: tagResults[i],
      }));
    }

    // -- 3. Author news --

    const gatorIds = followedAuthors.map((a) => a.gatorAuthorId).filter((id): id is string => !!id);
    const authorNewsResult = !friendsCursorParam
      ? await getPostsForAuthors(gatorIds, gatorCursorParam ?? undefined)
      : { content: [], hasMore: false };

    // -- 4. Build response --

    const response = {
      friends: friendEntries.map((e) => ({
        id: e.id,
        content: e.content,
        chapterStart: e.chapterStart,
        chapterEnd: e.chapterEnd,
        scope: e.scope,
        createdAt: e.createdAt,
        isPublic: e.isPublic,
        authorId: e.authorId,
        authorName: e.authorName,
        bookId: e.bookId,
        bookTitle: e.bookTitle,
        bookCoverUrl: e.bookCoverUrl,
        spoilered: e.spoilered,
        spoilerTags: e.spoilerTagsResult,
      })),
      authorNews: authorNewsResult.content,
      nextFriendsCursor,
      nextGatorCursor: authorNewsResult.hasMore
        ? (authorNewsResult.content[authorNewsResult.content.length - 1]?.id ?? null)
        : null,
      friendsCount: followingIds.length,
      followedAuthorsCount: followedAuthors.length,
    };

    if (isFirstPage) {
      await setJSON(keys.feed(userId), response, TTL.FEED).catch(() => {});
    }

    return NextResponse.json(response);

  } catch (e) {
    console.error("[GET /api/feed] unhandled error:", e);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
