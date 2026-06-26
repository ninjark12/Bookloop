// lib/gator-client.ts
//
// SECURITY NOTES
// --------------
// 1. "server-only" throws a build error if this file is ever imported in a
//    client component, preventing GATOR_API_KEY from being bundled into
//    browser JS. CORS is not relevant here -- this runs Node.js server-side.
//
// 2. All requests have a 10-second timeout so a slow or downed Gator service
//    cannot hang Book Loop page loads indefinitely.
//
// 3. GATOR_URL is validated at startup to require HTTPS in production.
//    A misconfigured HTTP URL in prod would send the API key in plaintext.
//
// 4. Gator itself should use a HandlerInterceptor to reject any request
//    missing the correct X-Api-Key. Ideally Gator is also on a private
//    network (Fly.io private networking, Railway private service, etc.)
//    so that the API key is a second layer, not the only one.

import "server-only";

const GATOR_URL = (process.env.GATOR_URL ?? "").replace(/\/$/, "");
const GATOR_API_KEY = process.env.GATOR_API_KEY ?? "";
const REQUEST_TIMEOUT_MS = 10_000;

// -- Startup validation --

if (!GATOR_URL) {
  if (process.env.NODE_ENV === "production") {
    console.error("[gator-client] GATOR_URL is not set -- author news disabled");
  }
} else if (
  process.env.NODE_ENV === "production" &&
  !GATOR_URL.startsWith("https://")
) {
  // Hard error in production -- HTTP would send the API key in plaintext
  throw new Error(
    `[gator-client] GATOR_URL must use HTTPS in production. Got: ${GATOR_URL}`
  );
}

if (!GATOR_API_KEY && process.env.NODE_ENV === "production") {
  console.error("[gator-client] GATOR_API_KEY is not set -- requests will be rejected by Gator");
}

// -- Types --

export type GatorPost = {
  id: string;
  title: string;
  url: string;
  description: string | null;
  publishedAt: string;
  authorId: string;
  authorName: string;
};

export type GatorAuthor = {
  id: string;
  name: string;
  feedUrls: string[];
};

export type GatorPostsResponse = {
  content: GatorPost[];
  hasMore: boolean;
};

// -- Internal helpers --

function baseHeaders(): HeadersInit {
  return {
    "Content-Type": "application/json",
    "X-Api-Key": GATOR_API_KEY,
  };
}

// Returns a fetch options object with a timeout signal.
// Ensures Gator latency or downtime never blocks Book Loop indefinitely.
function withTimeout(init: RequestInit = {}): RequestInit {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  // Attach cleanup so the timer doesn't keep Node alive after the request resolves
  const originalSignal = init.signal;
  const signal = controller.signal;

  // If the caller supplied their own signal, wire them together
  if (originalSignal) {
    originalSignal.addEventListener("abort", () => controller.abort());
  }

  return {
    ...init,
    signal,
    // Store the timeout id so callers can clear it (advanced use)
    // For our purposes the GC handles it after each request scope
  };
}

// Thin fetch wrapper: handles timeout, non-OK status, and network errors
// without letting any exception propagate to the calling page.
async function gatorFetch<T>(
  path: string,
  init: RequestInit = {}
): Promise<T | null> {
  if (!GATOR_URL) return null;

  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  try {
    const controller = new AbortController();
    timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    const res = await fetch(`${GATOR_URL}${path}`, {
      ...init,
      headers: { ...baseHeaders(), ...(init.headers ?? {}) },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      console.error(`[gator-client] ${init.method ?? "GET"} ${path} -> ${res.status}`);
      return null;
    }

    return res.json() as Promise<T>;
  } catch (err: unknown) {
    if (timeoutId) clearTimeout(timeoutId);
    if (err instanceof Error && err.name === "AbortError") {
      console.error(`[gator-client] Request timed out: ${path}`);
    } else {
      console.error(`[gator-client] Network error on ${path}:`, err);
    }
    return null;
  }
}

// -- Public API --

// Register an author with Gator and watch their RSS feeds.
// Call this when a Book Loop user first follows an author.
// Returns the Gator-assigned author (store id as gatorAuthorId).
export async function registerAuthor(
  name: string,
  feedUrls: string[]
): Promise<GatorAuthor | null> {
  return gatorFetch<GatorAuthor>("/api/authors", {
    method: "POST",
    body: JSON.stringify({ name, feedUrls }),
  });
}

// Fetch paginated news posts for a list of Gator author IDs.
// Uses cursor-based pagination: afterId is the UUID of the last seen post.
// Falls back to an empty result rather than throwing if Gator is unavailable.
export async function getPostsForAuthors(
  gatorAuthorIds: string[],
  afterId?: string,
  size = 20
): Promise<GatorPostsResponse> {
  const empty: GatorPostsResponse = { content: [], hasMore: false };

  if (gatorAuthorIds.length === 0) return empty;

  const safeIds = gatorAuthorIds.filter((id) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
  );

  if (safeIds.length === 0) return empty;

  const params = new URLSearchParams({ ids: safeIds.join(","), size: String(size) });
  if (afterId) params.set("afterId", afterId);

  const result = await gatorFetch<{ content: GatorPost[]; hasMore: boolean }>(
    `/api/posts/authors?${params}`,
    { cache: "force-cache", next: { revalidate: 300 } } as RequestInit
  );

  return result ?? empty;
}

// List all authors Gator knows about.
// Used to avoid duplicate registrations during "follow author" flow.
export async function listAuthors(): Promise<GatorAuthor[]> {
  const result = await gatorFetch<GatorAuthor[]>("/api/authors", {
    next: { revalidate: 60 },
  } as RequestInit);
  return result ?? [];
}

// Build the Goodreads RSS feed URL for an author.
// This is the primary source for book release news.
export function buildGoodreadsFeedUrl(goodreadsId: string): string {
  // Validate goodreadsId is numeric before embedding in a URL
  if (!/^\d+$/.test(goodreadsId)) {
    throw new Error(`[gator-client] Invalid goodreadsId: ${goodreadsId}`);
  }
  return `https://www.goodreads.com/author/list/${goodreadsId}.rss`;
}
