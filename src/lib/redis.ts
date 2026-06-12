import Redis from "ioredis";

// Singleton so Next.js hot-reload doesn't open a new connection on every save.
// Falls back to a no-op stub when REDIS_URL is not set (e.g. in test environments)
// so pages that import streak.ts don't crash just because Redis is unavailable.

declare global {
  // eslint-disable-next-line no-var
  var __redis: Redis | undefined;
}

function createClient(): Redis {
  const url = process.env.REDIS_URL ?? "redis://localhost:6379";
  const client = new Redis(url, {
    // Don't crash the whole app if Redis is unreachable -- just log and move on.
    // Streak dedup will be skipped but nothing else breaks.
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
  });

  client.on("error", (err) => {
    // Log once per error type rather than flooding the console
    console.error("[redis] connection error:", err.message);
  });

  return client;
}

export const redis: Redis =
  process.env.NODE_ENV === "production"
    ? createClient()
    : (globalThis.__redis ??= createClient());

// ─── Key helpers ──────────────────────────────────────────────
export const keys = {
  bookSearch: (query: string) =>
    `book_search:${encodeURIComponent(query.toLowerCase().trim())}`,
  streak: (userId: string) => `streak:${userId}`,
  feed: (userId: string) => `feed:${userId}`,
  rateLimit: (userId: string, endpoint: string) => `rl:${endpoint}:${userId}`,
  progress: (userId: string, bookId: string) => `progress:${userId}:${bookId}`,
} as const;

// ─── TTL constants (seconds) ──────────────────────────────────
export const TTL = {
  BOOK_SEARCH: 60 * 60,    // 1 hour
  STREAK: 60 * 60 * 25,   // 25 hours (1h grace past midnight)
  FEED: 60,                // 1 minute
  PROGRESS: 60 * 5,        // 5 minutes
} as const;

// ─── Typed JSON helpers (degrade gracefully on Redis outage) ──
export async function getJSON<T>(key: string): Promise<T | null> {
  try {
    const raw = await redis.get(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch (err) {
    console.error("[redis] getJSON failed:", (err as Error).message);
    return null;
  }
}

export async function setJSON<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
  try {
    const payload = JSON.stringify(value);
    if (ttlSeconds) await redis.set(key, payload, "EX", ttlSeconds);
    else await redis.set(key, payload);
  } catch (err) {
    console.error("[redis] setJSON failed:", (err as Error).message);
  }
}
