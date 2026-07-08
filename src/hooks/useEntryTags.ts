"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export type EntryTag = {
  tag: string;
  namespace: string;
  name: string;
  source: string;
  verified: boolean;
};

async function fetchTags(entryId: string): Promise<EntryTag[]> {
  const res = await fetch(`/api/entries/${entryId}/tags`);
  if (!res.ok) throw new Error("Failed to load tags");
  const data = await res.json();
  return data.tags;
}

export function useEntryTags(entryId: string | null, enabled = true) {
  return useQuery({
    queryKey: ["entry-tags", entryId],
    queryFn: () => fetchTags(entryId as string),
    enabled: enabled && !!entryId,
  });
}

export function useAddEntryTag(entryId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (tag: string) => {
      const res = await fetch(`/api/entries/${entryId}/tags`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tag }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to add tag");
      }
      return (await res.json()).tags as EntryTag[];
    },
    onSuccess: (tags) => {
      queryClient.setQueryData(["entry-tags", entryId], tags);
    },
  });
}

export function useRemoveEntryTag(entryId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (tag: string) => {
      const res = await fetch(
        `/api/entries/${entryId}/tags?tag=${encodeURIComponent(tag)}`,
        { method: "DELETE" }
      );
      if (!res.ok) throw new Error("Failed to remove tag");
      return (await res.json()).tags as EntryTag[];
    },
    onSuccess: (tags) => {
      queryClient.setQueryData(["entry-tags", entryId], tags);
    },
  });
}
