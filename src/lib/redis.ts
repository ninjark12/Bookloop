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
