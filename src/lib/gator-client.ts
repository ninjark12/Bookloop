// lib/gator-client.ts
//
// SECURITY NOTES
// --------------
// 1. "server-only" throws a build error if this file is ever imported in a
//    client component, preventing GATOR_API_KEY from being bundled into
//    browser JS.
//
// 2. All requests have a 10-second timeout so a slow or downed Gator service
//    cannot hang Book Loop page loads indefinitely.
//
// 3. GATOR_URL is validated at startup to require HTTPS in production.
//    A misconfigured HTTP URL in prod would send the API key in plaintext.
//
// 4. Gator should be on a private network so the API key is a second layer,
//    not the only one.

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
  throw new Error(
    `[gator-client] GATOR_URL must use HTTPS in production. Got: ${GATOR_URL}`
  );
}

if (!GATOR_API_KEY && process.env.NODE_ENV === "production") {
  console.error("[gator-client] GATOR_API_KEY is not set -- requests will be rejected by Gator");
}

// -- Types --

export type GatorPostType = "UpcomingRelease" | "News" | "Adaptation" | "Event";
export type GatorPostSource = "GoogleBooks" | "GNews";

export type GatorPost = {
  id: string;
  title: string;
  url: string;
  description: string | null;
  type: GatorPostType;
  source: GatorPostSource;
  publishedAt: string | null;
  createdAt: string;
  isbn: string | null;
  coverImageUrl: string | null;
  releaseDate: string | null;
};

export type GatorAuthor = {
  id: string;
  name: string;
  createdAt: string;
};

export type GatorPostsPage = {
  posts: GatorPost[];
  nextCursor: string | null;
};

// Opaque per-author cursors encoded as a single base64 string.
// This lets the feed route pass a single cursor value for multiple authors.
type CompoundCursor = Record<string, string | null>;

// -- Internal helpers --

function baseHeaders(): HeadersInit {
  return {
    "Content-Type": "application/json",
    "X-Api-Key": GATOR_API_KEY,
  };
}

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

function encodeCompoundCursor(c: CompoundCursor): string {
  return Buffer.from(JSON.stringify(c)).toString("base64url");
}

function decodeCompoundCursor(raw: string): CompoundCursor | null {
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString());
    if (typeof parsed === "object" && parsed !== null) return parsed as CompoundCursor;
    return null;
  } catch {
    return null;
  }
}

// -- Authors --

export async function listAuthors(): Promise<GatorAuthor[]> {
  const result = await gatorFetch<GatorAuthor[]>("/authors", {
    next: { revalidate: 60 },
  } as RequestInit);
  return result ?? [];
}

export async function getAuthor(id: string): Promise<GatorAuthor | null> {
  return gatorFetch<GatorAuthor>(`/authors/${id}`);
}

// Register a new author with Gator. Returns the created author with Gator's
// assigned id (store as gatorAuthorId on the local authors row).
export async function registerAuthor(name: string): Promise<GatorAuthor | null> {
  return gatorFetch<GatorAuthor>("/authors", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export async function updateAuthor(id: string, name: string): Promise<GatorAuthor | null> {
  return gatorFetch<GatorAuthor>(`/authors/${id}`, {
    method: "PUT",
    body: JSON.stringify({ name }),
  });
}

// Returns true on success (204), false on not-found or network error.
export async function deleteAuthor(id: string): Promise<boolean> {
  if (!GATOR_URL) return false;

  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  try {
    const controller = new AbortController();
    timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    const res = await fetch(`${GATOR_URL}/authors/${id}`, {
      method: "DELETE",
      headers: baseHeaders(),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return res.ok;
  } catch {
    if (timeoutId) clearTimeout(timeoutId);
    return false;
  }
}

// -- Posts --

export async function getPostsForAuthor(
  gatorAuthorId: string,
  options: {
    cursor?: string;
    pageSize?: number;
    type?: GatorPostType;
  } = {}
): Promise<GatorPostsPage> {
  const { cursor, pageSize = 20, type } = options;
  const params = new URLSearchParams({ pageSize: String(pageSize) });
  if (cursor) params.set("cursor", cursor);
  if (type) params.set("type", type);

  const result = await gatorFetch<GatorPostsPage>(
    `/authors/${gatorAuthorId}/posts?${params}`
  );
  return result ?? { posts: [], nextCursor: null };
}

export async function getFeed(
  options: {
    cursor?: string;
    pageSize?: number;
    source?: GatorPostSource;
    type?: GatorPostType;
    q?: string;
  } = {}
): Promise<GatorPostsPage> {
  const { cursor, pageSize = 20, source, type, q } = options;
  const params = new URLSearchParams({ pageSize: String(pageSize) });
  if (cursor) params.set("cursor", cursor);
  if (source) params.set("source", source);
  if (type) params.set("type", type);
  if (q) params.set("q", q);

  const result = await gatorFetch<GatorPostsPage>(`/feed?${params}`);
  return result ?? { posts: [], nextCursor: null };
}

// Fetch paginated posts for a list of Gator author IDs.
// Calls /authors/{id}/posts in parallel for each author, merges results sorted
// by createdAt desc. The cursor is an opaque compound cursor encoding each
// author's individual Gator cursor; pass it back verbatim for the next page.
export async function getPostsForAuthors(
  gatorAuthorIds: string[],
  cursor?: string,
  pageSize = 20
): Promise<GatorPostsPage> {
  const empty: GatorPostsPage = { posts: [], nextCursor: null };

  const safeIds = gatorAuthorIds.filter((id) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
  );
  if (safeIds.length === 0) return empty;

  const cursorMap: CompoundCursor = cursor ? (decodeCompoundCursor(cursor) ?? {}) : {};

  // On continuation pages, skip authors whose cursor is null (exhausted)
  const activeIds = cursor
    ? safeIds.filter((id) => cursorMap[id] !== null)
    : safeIds;

  if (activeIds.length === 0) return empty;

  const results = await Promise.all(
    activeIds.map(async (authorId) => {
      const authorCursor = cursorMap[authorId] ?? undefined;
      const page = await getPostsForAuthor(authorId, { cursor: authorCursor, pageSize });
      return { authorId, posts: page.posts, nextCursor: page.nextCursor };
    })
  );

  const allPosts = results.flatMap((r) => r.posts);
  allPosts.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const pagePosts = allPosts.slice(0, pageSize);

  // Build compound cursor: start from fully-exhausted state for all ids,
  // then overwrite with fresh cursors from this fetch.
  const newCursorMap: CompoundCursor = Object.fromEntries(safeIds.map((id) => [id, null]));
  for (const r of results) {
    newCursorMap[r.authorId] = r.nextCursor;
  }

  const hasMore =
    Object.values(newCursorMap).some((c) => c !== null) ||
    allPosts.length > pageSize;

  return {
    posts: pagePosts,
    nextCursor: hasMore ? encodeCompoundCursor(newCursorMap) : null,
  };
}
