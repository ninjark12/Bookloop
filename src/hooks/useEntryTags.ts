"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export type EntryTag = {
  tag: string;
  namespace: string;
  name: string;
  source: string;
  verified: boolean;
};

export type ProcessingStatus = "pending" | "processing" | "done" | "failed" | "skipped" | null;

export type EntryTagsData = {
  tags: EntryTag[];
  processingStatus: ProcessingStatus;
};

async function fetchTags(entryId: string): Promise<EntryTagsData> {
  const res = await fetch(`/api/entries/${entryId}/tags`);
  if (!res.ok) throw new Error("Failed to load tags");
  return res.json();
}

const key = (entryId: string | null) => ["entry-tags", entryId];

export function useEntryTags(entryId: string | null, enabled = true) {
  return useQuery<EntryTagsData>({
    queryKey: key(entryId),
    queryFn: () => fetchTags(entryId as string),
    enabled: enabled && !!entryId,
    // Poll while the tagger is still working; stop once terminal.
    refetchInterval: (query) => {
      const status = query.state.data?.processingStatus;
      return status === "pending" || status === "processing" ? 2500 : false;
    },
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
      return (await res.json()) as EntryTagsData;
    },
    onSuccess: (data) => queryClient.setQueryData(key(entryId), data),
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
      return (await res.json()) as EntryTagsData;
    },
    onSuccess: (data) => queryClient.setQueryData(key(entryId), data),
  });
}
