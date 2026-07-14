"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

// Flat display rows from GET /api/friends (service layer, snake_case).
export type Friend = {
  id: string;
  name: string | null;
  image: string | null;
  display_name: string | null;
  discriminator: string | null;
};

const FRIENDS_KEY = ["friends"] as const;

async function fetchFriends(): Promise<Friend[]> {
  const res = await fetch("/api/friends");
  if (!res.ok) throw new Error("Failed to load friends");
  const data = await res.json();
  return data.friends ?? [];
}

/**
 * The viewer's accepted friends. Pass `enabled: false` (e.g. until a modal opens)
 * to avoid fetching eagerly; reopening within staleTime serves from cache.
 */
export function useFriends(enabled = true) {
  return useQuery<Friend[]>({
    queryKey: FRIENDS_KEY,
    queryFn: fetchFriends,
    enabled,
  });
}

/**
 * Remove a friendship. Optimistically drops the row from the cached list and
 * rolls back on error. Also invalidates the feed, since the removed friend's
 * entries should no longer appear there.
 */
export function useRemoveFriend() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (friendId: string) => {
      const res = await fetch(`/api/friends/${friendId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to remove friend");
      }
      return friendId;
    },
    onMutate: async (friendId) => {
      await queryClient.cancelQueries({ queryKey: FRIENDS_KEY });
      const previous = queryClient.getQueryData<Friend[]>(FRIENDS_KEY);
      queryClient.setQueryData<Friend[]>(FRIENDS_KEY, (old) =>
        old?.filter((f) => f.id !== friendId) ?? []
      );
      return { previous };
    },
    onError: (_err, _friendId, context) => {
      if (context?.previous) {
        queryClient.setQueryData(FRIENDS_KEY, context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: FRIENDS_KEY });
      queryClient.invalidateQueries({ queryKey: ["feed"] });
    },
  });
}
