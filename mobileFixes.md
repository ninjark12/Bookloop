# Bookloop — Search, Redis & Book Club Implementation Context

Handoff for Claude Code. Covers three workstreams specced in chat:
**(1) Redis on Upstash**, **(2) hybrid local book search (FTS + trigram)**,
**(3) book-club schema groundwork**. Implement in the order given —
each step depends on the one before at the route-assembly level.

---

## Stack reminder

- Next.js 15 App Router, TypeScript, Drizzle ORM
- Supabase PostgreSQL (transaction pooler, port 6543, `?pgbouncer=true&connection_limit=1` in prod; direct connection locally)
- Better Auth (session via `src/lib/get-session.ts` safe wrapper — returns `null`, never throws)
- Redis via **ioredis** (`src/lib/redis.ts`)
- Deployed on Vercel
- Repo: github.com/ninjark12/Bookloop · live: bookloop.sh

**Route conventions already established:**
- All session-checking routes need `export const dynamic = "force-dynamic"`
- Wrap handlers in try/catch; validate UUIDs before queries (connection-pool poisoning risk)
- `books` table has a unique-ish `ol_key` (Open Library key) used for dedupe

---

## WORKSTREAM 1 — Redis on Upstash (do first)

### Decision context
Hosting = **Upstash, TCP endpoint, keep ioredis.** Rationale: zero client
rewrite, free tier (volume is tiny), and everything is already behind
`getJSON`/`setJSON`/`keys` so a future swap to the `@upstash/redis` HTTP
client (if connection limits are ever hit) touches one file. Redis is NOT
hosted on Vercel (can't be — serverless has no long-lived process); it lives
on Upstash. Rate limiting (biggest pre-launch gap) also needs Redis-class
infra, so Redis stays regardless.

### Tasks
1. **Env**: set `REDIS_URL` to Upstash's connection string. It will be
   `rediss://` (double-s, TLS). Paste verbatim — do NOT downgrade to `redis://`.
   ioredis auto-enables TLS from the scheme; no `tls: {}` config needed.

2. **Confirm `src/lib/redis.ts` exports the helpers** the search code needs.
   Current file exports only `redis`. It MUST also export `keys`, `TTL`,
   `getJSON`, `setJSON`. If missing, append the block below. The JSON helpers
   MUST be wrapped in try/catch so a Redis outage produces a cache *miss*
   (search still works via Open Library) rather than a thrown 500 — because
   the client uses `enableOfflineQueue: false`, so `redis.get` rejects when
   Redis is down.

```typescript
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
  BOOK_SEARCH: 60 * 60,   // 1 hour
  STREAK: 60 * 60 * 25,   // 25 hours (1h grace past midnight)
  FEED: 60,               // 1 minute
  PROGRESS: 60 * 5,       // 5 minutes
} as const;

// ─── Typed JSON helpers (degrade gracefully) ──────────────────
export async function getJSON<T>(key: string): Promise<T | null> {
  try {
    const raw = await redis.get(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch (err) {
    console.error("[redis] getJSON failed:", (err as Error).message);
    return null; // miss on Redis trouble → falls through to source
  }
}

export async function setJSON<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
  try {
    const payload = JSON.stringify(value);
    if (ttlSeconds) await redis.set(key, payload, "EX", ttlSeconds);
    else await redis.set(key, payload);
  } catch (err) {
    console.error("[redis] setJSON failed:", (err as Error).message);
    // swallow — failing to cache must never break the request
  }
}
```

3. **Client config**: existing settings are correct for serverless
   (`lazyConnect: true`, `enableOfflineQueue: false`, `maxRetriesPerRequest: 1`,
   singleton via `globalThis.__redis`). One watch item: on cold starts the
   first command can occasionally race the TLS handshake with retries capped
   at 1. Leave at 1; if intermittent first-request misses appear, bump to 2–3.

### Cached Open Library search helper
Create `src/lib/book-search.ts` — extracts the OL fetch out of the route
into a cache-aside helper. **Never cache failures or empty-due-to-timeout
results.** Short timeout (~3.5s) — this is the user-facing search box.

```typescript
// src/lib/book-search.ts
import { keys, getJSON, setJSON, TTL } from "@/lib/redis";

export type BookSearchResult = {
  olKey: string;
  title: string;
  author: string;
  coverUrl: string | null;
  publishedYear: number | null;
  source?: "local" | "openlibrary";
};

const OL_TIMEOUT_MS = 3500;
const OL_ENDPOINT = "https://openlibrary.org/search.json";

export async function searchOpenLibraryCached(rawQuery: string): Promise<BookSearchResult[]> {
  const query = rawQuery.trim();
  if (query.length < 2) return [];

  const cacheKey = keys.bookSearch(query);
  const cached = await getJSON<BookSearchResult[]>(cacheKey);
  if (cached) return cached;

  let results: BookSearchResult[];
  try {
    results = await fetchOpenLibrary(query);
  } catch (err) {
    console.error("[book-search] OL fetch failed:", (err as Error).message);
    return []; // degrade, do NOT cache
  }

  if (results.length > 0) await setJSON(cacheKey, results, TTL.BOOK_SEARCH);
  return results;
}

async function fetchOpenLibrary(query: string): Promise<BookSearchResult[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OL_TIMEOUT_MS);
  try {
    const url = new URL(OL_ENDPOINT);
    url.searchParams.set("q", query);
    url.searchParams.set("limit", "20");
    url.searchParams.set("fields", "key,title,author_name,cover_i,first_publish_year");
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`OL responded ${res.status}`);
    const data = (await res.json()) as { docs?: OLDoc[] };
    return (data.docs ?? []).map(normalizeDoc);
  } finally {
    clearTimeout(timer);
  }
}

type OLDoc = {
  key: string; title: string;
  author_name?: string[]; cover_i?: number; first_publish_year?: number;
};

function normalizeDoc(doc: OLDoc): BookSearchResult {
  return {
    olKey: doc.key,
    title: doc.title,
    author: doc.author_name?.[0] ?? "Unknown",
    coverUrl: doc.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg` : null,
    publishedYear: doc.first_publish_year ?? null,
    source: "openlibrary",
  };
}
```

> **IMPORTANT — match existing field shape.** Verify `BookSearchResult` field
> names match what the current search UI consumes. If the existing route
> returned e.g. `id` instead of `olKey`, keep the existing names so the
> frontend doesn't change. Do not rename fields the client already reads.

---

## WORKSTREAM 2 — Hybrid local search (FTS + trigram)

### Goal
One search box. Backend decides field relevance (title outranks author)
without explicit user-facing fields. Local DB first; fall back to the cached
OL helper only when local results are weak. DB self-warms: every OL book a
user adds becomes a local row, so popular searches resolve locally over time.

All native Postgres — `pg_trgm` is a built-in extension (already available on
Supabase, just enable it). No Elasticsearch, no extra service.

### Migration (run in Supabase SQL editor first; eyeball rankings before coding)

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Weighted, generated search vector. A(title) outranks B(author).
ALTER TABLE books ADD COLUMN search_vector tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(title,  '')), 'A') ||
    setweight(to_tsvector('english', coalesce(author, '')), 'B')
  ) STORED;

-- Word/stemmed matching + ranking
CREATE INDEX books_search_idx ON books USING GIN (search_vector);
-- Fuzzy / typo / substring matching (gin_trgm_ops = "decompose to trigrams")
CREATE INDEX books_title_trgm_idx  ON books USING GIN (title  gin_trgm_ops);
CREATE INDEX books_author_trgm_idx ON books USING GIN (author gin_trgm_ops);
```

> Drizzle note: the generated column + GIN indexes may need to be declared in
> the schema with `.$type()` / custom SQL or managed as a raw migration, since
> Drizzle's generated-column + tsvector support is limited. Simplest path:
> apply this as a hand-written SQL migration and represent `search_vector` in
> the Drizzle schema as an opaque column (or omit it from the select shape and
> reference it only in raw `sql` fragments).

### Local query (hybrid: FTS `@@` + trigram `%`)

```sql
SELECT id, title, author, cover_url, ol_key,
       ts_rank(search_vector, websearch_to_tsquery('english', $1)) AS lex_rank,
       GREATEST(similarity(title, $1), similarity(author, $1)) AS trgm_sim
FROM books
WHERE search_vector @@ websearch_to_tsquery('english', $1)
   OR title  % $1
   OR author % $1
ORDER BY (ts_rank(search_vector, websearch_to_tsquery('english', $1))
          + GREATEST(similarity(title, $1), similarity(author, $1))) DESC
LIMIT 20;
```

- `@@` → real word matches ("gatsby" → "The Great Gatsby")
- `%` → typos/partials ("gatsy", "fitzgerld"); trigram threshold default 0.3,
  tune via `set_limit()` / `pg_trgm.similarity_threshold`
- **Always use `websearch_to_tsquery`** (safe constructor, won't throw on weird
  input). NEVER string-build a `to_tsquery`. Parameterize `$1`.

### Confidence gate → OL fallback (in the route)

```typescript
const best = localRows[0]?.combinedScore ?? 0;
const enoughHits = localRows.length >= 3;

if (best >= LOCAL_THRESHOLD && enoughHits) {
  return localRows.map(r => ({ ...r, source: "local" as const }));
}

// weak local → augment with cached OL, dedupe by ol_key
const ol = await searchOpenLibraryCached(query);
const olDeduped = ol.filter(o => !localRows.some(r => r.ol_key === o.olKey));

return [
  ...localRows.map(r => ({ ...r, source: "local" as const })),
  ...olDeduped, // already source: "openlibrary"
];
```

- `LOCAL_THRESHOLD`: start ~0.1 (ts_rank scale). Log best-score distribution
  for ~a week, then set it where good queries sit above and junk below.
- Dedupe on `ol_key` so the same book never appears twice.

### Route shape
`src/app/api/books/search/route.ts` — `export const dynamic = "force-dynamic"`,
auth via `getSession()` (401 if null), min query length 2, try/catch → 500.
Route stays thin: auth + call the hybrid search function in `lib/`.

---

## WORKSTREAM 3 — Write-through / self-warming (already partly true)

When a user adds an OL result, the add route MUST upsert keyed on `ol_key`
so two users adding the same book don't create duplicate rows:

```sql
INSERT INTO books (ol_key, title, author, ...) VALUES (...)
ON CONFLICT (ol_key) DO NOTHING   -- or DO UPDATE SET ...
RETURNING id;
```

**Requires a UNIQUE constraint on `ol_key`.** Add it BEFORE launch —
retrofitting after duplicates exist is painful. This is the single most
common write-through bug. The generated `search_vector` populates
automatically on insert, so newly added books are immediately searchable
locally.

Do NOT pre-seed the DB with an OL dump — it bloats storage, adds ranking
noise, and defeats self-warming. Let real usage fill it.

No stale-refresh logic needed (book metadata is stable). If ever required,
the standard fix is a `last_synced_at` column + lazy refresh on detail-page
view. Note it, skip it for now.

### Optional: search analytics (separate from cache!)
If you want "what are people searching / what returns no results," log
searches to a `search_log` table. This is a DURABLE log (keep everything, no
eviction), NOT a cache — different purpose, lives alongside Redis, do not
conflate. Lightweight insert in the route, fire-and-forget.

---

## WORKSTREAM 4 — Book club (soon, but v1 = refreshable, no realtime)

Feature is Postgres-shaped: clubs organized by book, chapter-scoped discussion
threads, Reddit-style posts mirroring the `journal_entries` structure
(reuse `chapter_start` / `chapter_end` scoping). Ship v1 with normal
request/response — NO Redis pub/sub (doesn't work on serverless anyway).

Live updates are a v2 polish pass via **Supabase Realtime** subscribing to
inserts on the posts table filtered by club/chapter — zero new infra, watches
the same table the non-realtime code writes to. Schema (`clubs`,
`club_members`, `club_posts`, `club_comments`) not yet drafted — design when
this workstream starts so it slots into existing Drizzle setup.

---

## Recommended order
1. Redis env swap + confirm helpers exist + drop in `book-search.ts` (~fast)
2. Trigram + FTS migration in Supabase SQL editor; eyeball rankings
3. Hybrid query + confidence gate in the search route (builds on 1 & 2)
4. Unique `ol_key` constraint + upsert in add route (do before launch)
5. (Later) book-club schema, then Supabase Realtime as v2

Do NOT build the hybrid route logic before the cache exists — the cache is a
stable seam the local-first logic plugs into; building search first means
editing the route twice.
