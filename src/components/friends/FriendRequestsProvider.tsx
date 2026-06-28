"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { authClient } from "@/lib/auth-client";

export type PendingFriendRequest = {
  id: string;
  createdAt: string;
  sender: {
    id: string;
    name: string | null;
    displayName: string | null;
    discriminator: string | null;
    image: string | null;
  };
};

type FriendRequestsContextValue = {
  requests: PendingFriendRequest[];
  pendingCount: number;
  loading: boolean;
  error: string | null;
  refreshFriendRequests: () => Promise<PendingFriendRequest[]>;
  invalidateFriendRequests: () => Promise<PendingFriendRequest[]>;
  removeFriendRequest: (requestId: string) => void;
};

type FriendRequestsResponse = {
  requests?: PendingFriendRequest[];
};

const FriendRequestsContext = createContext<FriendRequestsContextValue | null>(null);
const FRIEND_REQUESTS_STALE_TIME = 60_000;

let cachedUserId: string | null = null;
let cachedRequests: PendingFriendRequest[] = [];
let cachedAt = 0;
let inFlightUserId: string | null = null;
let inFlightRequest: Promise<PendingFriendRequest[]> | null = null;

function hasFreshCache(userId: string) {
  return cachedUserId === userId && Date.now() - cachedAt < FRIEND_REQUESTS_STALE_TIME;
}

function clearCache() {
  cachedUserId = null;
  cachedRequests = [];
  cachedAt = 0;
  inFlightUserId = null;
  inFlightRequest = null;
}

async function fetchFriendRequests(userId: string, force = false): Promise<PendingFriendRequest[]> {
  if (!force && hasFreshCache(userId)) return cachedRequests;
  if (!force && inFlightRequest && inFlightUserId === userId) return inFlightRequest;

  inFlightUserId = userId;
  inFlightRequest = fetch("/api/friends/requests")
    .then(async (res) => {
      if (!res.ok) throw new Error("Failed to load friend requests");
      const json: FriendRequestsResponse = await res.json();
      const requests = json.requests ?? [];
      cachedUserId = userId;
      cachedRequests = requests;
      cachedAt = Date.now();
      return requests;
    })
    .finally(() => {
      inFlightUserId = null;
      inFlightRequest = null;
    });

  return inFlightRequest;
}

export function FriendRequestsProvider({ children }: { children: React.ReactNode }) {
  const { data: session } = authClient.useSession();
  const userId = session?.user.id ?? null;
  const [requests, setRequests] = useState<PendingFriendRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadRequests = useCallback(async (force = false) => {
    if (!userId) {
      clearCache();
      setRequests([]);
      setLoading(false);
      setError(null);
      return [];
    }

    setLoading(true);
    setError(null);
    try {
      const nextRequests = await fetchFriendRequests(userId, force);
      setRequests(nextRequests);
      return nextRequests;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load friend requests");
      return cachedUserId === userId ? cachedRequests : [];
    } finally {
      setLoading(false);
    }
  }, [userId]);

  const refreshFriendRequests = useCallback(() => loadRequests(false), [loadRequests]);

  const invalidateFriendRequests = useCallback(() => {
    cachedAt = 0;
    return loadRequests(true);
  }, [loadRequests]);

  const removeFriendRequest = useCallback((requestId: string) => {
    setRequests((prev) => {
      const nextRequests = prev.filter((request) => request.id !== requestId);
      if (cachedUserId === userId) {
        cachedRequests = nextRequests;
        cachedAt = Date.now();
      }
      return nextRequests;
    });
  }, [userId]);

  useEffect(() => {
    let cancelled = false;

    async function syncRequests() {
      if (!userId) {
        clearCache();
        if (!cancelled) {
          setRequests([]);
          setLoading(false);
          setError(null);
        }
        return;
      }

      if (hasFreshCache(userId)) {
        setRequests(cachedRequests);
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const nextRequests = await fetchFriendRequests(userId);
        if (!cancelled) setRequests(nextRequests);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load friend requests");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    syncRequests();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    const activeUserId = userId;

    function handleVisibilityChange() {
      if (document.visibilityState === "visible" && !hasFreshCache(activeUserId)) {
        void loadRequests(false);
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [loadRequests, userId]);

  const value = useMemo<FriendRequestsContextValue>(() => ({
    requests,
    pendingCount: requests.length,
    loading,
    error,
    refreshFriendRequests,
    invalidateFriendRequests,
    removeFriendRequest,
  }), [error, invalidateFriendRequests, loading, refreshFriendRequests, removeFriendRequest, requests]);

  return (
    <FriendRequestsContext.Provider value={value}>
      {children}
    </FriendRequestsContext.Provider>
  );
}

export function useFriendRequests() {
  const context = useContext(FriendRequestsContext);
  if (!context) {
    throw new Error("useFriendRequests must be used within FriendRequestsProvider");
  }
  return context;
}
