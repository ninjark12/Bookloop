"use client";

import { useQuery } from "@tanstack/react-query";
import { useState, useEffect, useCallback } from "react";

export type SearchScope = "mine" | "friends";

/** A raw journal-entry search row (snake_case, straight from the SQL layer). */
export type SearchResult = {
  id: string;
  user_id: string;
  book_id: string;
  content: string;
  chapter_start: number;
  chapter_end: number;
  is_public: boolean | null;
  created_at: string;
  book_title: string;
  book_author: string;
  book_cover_url: string | null;
  author_name?: string;
  author_display_name?: string | null;
  rrf_score?: number;
  tag_score?: number;
};

export type SearchResponse = {
  results: SearchResult[];
  expansion: { tags: string[] } | null;
  parsed?: { includeTags: string[]; excludeTags: string[] };
};

/** Debounced value helper */
function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

export function useSearch(query: string, scope: SearchScope) {
  const trimmed = query.trim();
  const debouncedQuery = useDebounced(trimmed, 500);

  // The term actually sent to the API. It normally follows the debounced input
  // (live preview as you type), but `submit` forces it to the current input
  // right away so pressing Enter / the search icon skips the debounce wait.
  const [submitted, setSubmitted] = useState(trimmed);
  useEffect(() => setSubmitted(debouncedQuery), [debouncedQuery]);

  const query$ = useQuery<SearchResponse>({
    queryKey: ["search", submitted, scope],
    queryFn: async () => {
      const params = new URLSearchParams({ q: submitted, scope });
      const res = await fetch(`/api/search?${params}`);
      if (!res.ok) throw new Error("Search failed");
      return res.json();
    },
    enabled: submitted.length >= 2,
    staleTime: 60_000, // same query within a minute reuses the result
    placeholderData: (prev) => prev, // keep old results while new ones load
  });

  const submit = useCallback(() => setSubmitted(query.trim()), [query]);

  return { ...query$, submit };
}
