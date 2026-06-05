import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { GET } from "@/app/api/feed/route";

vi.mock("@/lib/bedrock", () => ({
  getSpoilerTags: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/lib/gator-client", () => ({
  getPostsForAuthors: vi.fn().mockResolvedValue({
    content: [],
    totalPages: 0,
    totalElements: 0,
    page: 0,
  }),
}));

import { getSpoilerTags } from "@/lib/bedrock";
import { getPostsForAuthors } from "@/lib/gator-client";

const req = new NextRequest("http://localhost/api/feed?page=0");

describe("GET /api/feed", () => {
  describe("authentication", () => {
    it("returns 401 when not authenticated", async () => {
      vi.mocked(auth.api.getSession).mockResolvedValueOnce(null);
      const res = await GET(req);
      expect(res.status).toBe(401);
    });
  });

  describe("empty feed", () => {
    it("returns empty friends and authorNews when user has no connections", async () => {
      // friendRequests query -> []
      // authorFollows query -> []
      const res = await GET(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.friends).toEqual([]);
      expect(data.authorNews).toEqual([]);
      expect(data.friendsCount).toBe(0);
      expect(data.followedAuthorsCount).toBe(0);
    });
  });

  describe("friend entries", () => {
    it("returns friend journal entries with spoilered flag", async () => {
      const friendId = "friend-1";
      const acceptedFriend = { senderId: "user-123", receiverId: friendId };
      const entry = {
        id: "entry-1",
        content: "Chapter 10 was wild",
        chapterStart: 10,
        chapterEnd: 10,
        scope: "CHAPTER",
        createdAt: new Date(),
        isPublic: true,
        authorId: friendId,
        authorName: "Friend",
        bookId: "book-1",
        bookTitle: "Dune",
        bookCoverUrl: null,
      };

      vi.mocked(db.then)
        .mockImplementationOnce((resolve: (v: unknown) => void) => resolve([acceptedFriend])) // accepted friends
        .mockImplementationOnce((resolve: (v: unknown) => void) => resolve([entry]))           // journal entries
        .mockImplementationOnce((resolve: (v: unknown) => void) => resolve([]))                // viewer progress
        .mockImplementationOnce((resolve: (v: unknown) => void) => resolve([]));               // followed authors

      const res = await GET(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.friends).toHaveLength(1);
      expect(data.friends[0].id).toBe("entry-1");
    });

    it("marks entries as spoilered when entry chapter exceeds viewer progress", async () => {
      const friendId = "friend-1";
      const acceptedFriend = { senderId: "user-123", receiverId: friendId };
      const entry = {
        id: "entry-1",
        content: "Shocking ending at chapter 20",
        chapterStart: 20,
        chapterEnd: 20,
        scope: "CHAPTER",
        createdAt: new Date(),
        isPublic: true,
        authorId: friendId,
        authorName: "Friend",
        bookId: "book-1",
        bookTitle: "Dune",
        bookCoverUrl: null,
      };
      const progress = { bookId: "book-1", furthestChapter: 5 };

      vi.mocked(db.then)
        .mockImplementationOnce((resolve: (v: unknown) => void) => resolve([acceptedFriend]))
        .mockImplementationOnce((resolve: (v: unknown) => void) => resolve([entry]))
        .mockImplementationOnce((resolve: (v: unknown) => void) => resolve([progress]))
        .mockImplementationOnce((resolve: (v: unknown) => void) => resolve([]));

      const res = await GET(req);
      const data = await res.json();
      expect(data.friends[0].spoilered).toBe(true);
    });

    it("always includes content regardless of spoiler status (reveal is client-side)", async () => {
      const friendId = "friend-1";
      const acceptedFriend = { senderId: "user-123", receiverId: friendId };
      const entry = {
        id: "entry-1",
        content: "Secret plot twist",
        chapterStart: 30,
        chapterEnd: 30,
        scope: "CHAPTER",
        createdAt: new Date(),
        isPublic: true,
        authorId: friendId,
        authorName: "Friend",
        bookId: "book-1",
        bookTitle: "Dune",
        bookCoverUrl: null,
      };
      const progress = { bookId: "book-1", furthestChapter: 1 };

      vi.mocked(db.then)
        .mockImplementationOnce((resolve: (v: unknown) => void) => resolve([acceptedFriend]))
        .mockImplementationOnce((resolve: (v: unknown) => void) => resolve([entry]))
        .mockImplementationOnce((resolve: (v: unknown) => void) => resolve([progress]))
        .mockImplementationOnce((resolve: (v: unknown) => void) => resolve([]));

      const res = await GET(req);
      const data = await res.json();
      expect(data.friends[0].content).toBe("Secret plot twist");
    });

    it("calls getSpoilerTags for spoilered entries but not for safe ones", async () => {
      const friendId = "friend-1";
      const acceptedFriend = { senderId: "user-123", receiverId: friendId };

      const safeEntry = { id: "e1", content: "Good chapter", chapterStart: 1, chapterEnd: 1, scope: "CHAPTER", createdAt: new Date(), isPublic: true, authorId: friendId, authorName: "F", bookId: "book-1", bookTitle: "B", bookCoverUrl: null };
      const spoilerEntry = { id: "e2", content: "Big reveal", chapterStart: 50, chapterEnd: 50, scope: "CHAPTER", createdAt: new Date(), isPublic: true, authorId: friendId, authorName: "F", bookId: "book-1", bookTitle: "B", bookCoverUrl: null };
      const progress = { bookId: "book-1", furthestChapter: 10 };

      vi.mocked(db.then)
        .mockImplementationOnce((resolve: (v: unknown) => void) => resolve([acceptedFriend]))
        .mockImplementationOnce((resolve: (v: unknown) => void) => resolve([safeEntry, spoilerEntry]))
        .mockImplementationOnce((resolve: (v: unknown) => void) => resolve([progress]))
        .mockImplementationOnce((resolve: (v: unknown) => void) => resolve([]));

      vi.mocked(getSpoilerTags).mockResolvedValueOnce(["a major revelation"]);

      await GET(req);
      expect(vi.mocked(getSpoilerTags)).toHaveBeenCalledTimes(1);
      expect(vi.mocked(getSpoilerTags)).toHaveBeenCalledWith("Big reveal");
    });
  });

  describe("author news", () => {
    it("returns author news from gator for followed authors", async () => {
      const followedAuthor = { gatorAuthorId: "00000000-0000-0000-0000-000000000001", name: "Brandon" };
      const post = { id: "p1", title: "New Book!", url: "http://example.com", description: null, publishedAt: "2024-01-01", authorId: followedAuthor.gatorAuthorId, authorName: "Brandon" };

      vi.mocked(db.then)
        .mockImplementationOnce((resolve: (v: unknown) => void) => resolve([]))           // no friends
        .mockImplementationOnce((resolve: (v: unknown) => void) => resolve([followedAuthor])); // followed authors

      vi.mocked(getPostsForAuthors).mockResolvedValueOnce({ content: [post], totalPages: 1, totalElements: 1, page: 0 });

      const res = await GET(req);
      const data = await res.json();
      expect(data.authorNews).toHaveLength(1);
      expect(data.authorNews[0].title).toBe("New Book!");
      expect(data.followedAuthorsCount).toBe(1);
    });
  });
});
