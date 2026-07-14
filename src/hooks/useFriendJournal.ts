"use client";

import { useQuery } from "@tanstack/react-query";

// A book on a friend's shelf that has at least one public entry.
// Rows come straight from the SQL layer (snake_case), b.* + progress + count.
export type FriendBook = {
  id: string;
  title: string;
  author: string;
  cover_url: string | null;
  status: string | null;
  furthest_chapter: number | null;
  public_entry_count: number;
};

// A friend's public entry, flagged `spoilered` against the viewer's progress.
export type FriendEntry = {
  id: string;
  user_id: string;
  book_id: string;
  content: string | null;
  chapter_start: number;
  chapter_end: number;
  scope: string;
  is_public: boolean | null;
  created_at: string;
  spoiler_tags: string[] | null;
  spoilered: boolean;
};

async function fetchFriendBooks(userId: string): Promise<FriendBook[]> {
  const res = await fetch(`/api/users/${userId}/books`);
  if (!res.ok) throw new Error("Failed to load books");
  const data = await res.json();
  return data.books ?? [];
}

async function fetchFriendEntries(userId: string, bookId: string): Promise<FriendEntry[]> {
  const res = await fetch(`/api/users/${userId}/books/${bookId}/entries`);
  if (!res.ok) throw new Error("Failed to load entries");
  const data = await res.json();
  return data.entries ?? [];
}

/** Books on a friend's shelf that carry public entries. */
export function useFriendBooks(userId: string, enabled = true) {
  return useQuery<FriendBook[]>({
    queryKey: ["friend-books", userId],
    queryFn: () => fetchFriendBooks(userId),
    enabled: enabled && !!userId,
  });
}

/**
 * A friend's public entries for one book, spoiler-flagged to the viewer's
 * progress. Caches per (userId, bookId) so opening a book fetches once.
 */
export function useFriendEntries(userId: string, bookId: string | null, enabled = true) {
  return useQuery<FriendEntry[]>({
    queryKey: ["friend-entries", userId, bookId],
    queryFn: () => fetchFriendEntries(userId, bookId as string),
    enabled: enabled && !!userId && !!bookId,
  });
}
