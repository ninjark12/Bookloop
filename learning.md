# Bookloop — Idioms & Patterns

A reference for the conventions established across the refactor + semantic search
+ tagging work. Follow these for all new code. Cross-refs: `refactor.md`,
`semantic-search.md`, `booklooptag.md`.

---

## 1. API route wrapper (`src/lib/api.ts`)

Every new route handler is wrapped so session-check + error boundary aren't
re-written per route.

```ts
export const GET = withAuth(async (req, session, params) => {
  // session.user.id guaranteed; params already awaited
  return NextResponse.json({ data });
});
```

- `withAuth` → 401 if no session, `session.user` guaranteed inside.
- `withOptionalAuth` → same boundary, `session` may be null (public routes).
- Both await Next 15's `params` Promise so the handler gets a plain object.
- Both convert a thrown `ValidationError` → 400, anything else → 500 (logged).

**Idiom:** never do `getSession()` + try/catch boilerplate in a route again.
Throw `ValidationError` (from `@/lib/db/validate`) for bad input; the wrapper
turns it into a 400.

---

## 2. Service layer (`src/lib/db/*`)

Domain queries live here, never inline in routes. Uses raw SQL via drizzle's
`sql` tag through `db.execute` (not the query builder) for anything non-trivial.

```ts
export async function isFriend(a: string, b: string): Promise<boolean> {
  const rows = await db.execute(sql`
    SELECT 1 FROM friend_requests
    WHERE status = 'ACCEPTED'
      AND ((sender_id = ${a} AND receiver_id = ${b})
        OR (sender_id = ${b} AND receiver_id = ${a}))
    LIMIT 1
  `);
  return rows.length > 0;
}
```

- Interpolated values (`${a}`) are **parameterized**, not string-concatenated.
- UUID validation happens here via `assertUuid(id, "label")`, not in routes.
- Canonical helpers are single-source-of-truth: `isFriend`, the spoiler filter
  (`getPublicEntriesForViewer` / the `chapter_end <= viewerChapter` rule).
  Never reimplement them.

---

## 3. Registries: Features & CacheKeys

Central config objects instead of scattered inline `process.env`/string checks.

```ts
// src/lib/features.ts — server-only; gate routes/components on these
export const Features = {
  gator:   !!process.env.GATOR_URL,
  email:   !!process.env.RESEND_API_KEY,
  search:  !!process.env.SEARCH_EXPANSION_MODEL_ID && !!process.env.AWS_ACCESS_KEY_ID,
  tagging: !!process.env.BOOKLOOP_TAGGING_QUEUE_URL,
} as const;

// src/lib/cache-keys.ts — never inline a redis key string in a route
export const CacheKeys = {
  searchExpansion: (q: string) => `search:expand:${q.toLowerCase().trim()}`,
} as const;
```

**Idiom:** a feature flag reflects whether its infra is configured. A new redis
key gets a builder here so invalidation stays consistent. When matching an
existing key format, copy it byte-for-byte to avoid invalidating prod cache.

---

## 4. TanStack Query (client data fetching)

Provider wraps the app once (`QueryProvider`, outermost client provider in
`layout.tsx`). Hooks live in `src/hooks/`.

```ts
// query
useQuery({
  queryKey: ["search", debouncedQuery, scope], // scope/args in the key -> auto refetch
  queryFn: async () => (await fetch(...)).json(),
  enabled: debouncedQuery.length >= 2,          // gate eager fetches
  staleTime: 60_000,
  placeholderData: (prev) => prev,               // keep old results while refetching
});

// mutation with optimistic update
useMutation({
  mutationFn: (id) => fetch(...),
  onMutate: async (id) => {                       // cancel + snapshot + optimistic set
    await qc.cancelQueries({ queryKey: ["friends"] });
    const prev = qc.getQueryData(["friends"]);
    qc.setQueryData(["friends"], (old) => old?.filter(...));
    return { prev };
  },
  onError: (_e, _v, ctx) => qc.setQueryData(["friends"], ctx.prev), // rollback
  onSettled: () => qc.invalidateQueries({ queryKey: ["friends"] }),
});
```

**Idiom:** args that change the result go in the `queryKey`. `enabled` avoids
fetching before the modal opens. Optimistic = cancel → snapshot → set → rollback
on error → invalidate on settle.

---

## 5. Query parsing + Bedrock (semantic search)

- **Parser** (`src/lib/search/parser.ts`): pure, tokenizes `namespace:value`
  booru tags vs natural language; validates namespaces against a fixed list;
  quoted phrases stay as NL. Pure functions = trivially unit-testable.
- **Expand** (`expand.ts`): `ConverseCommand` with a forced **tool call**
  (`toolChoice: { tool: {...} }`) for structured output; `temperature: 0`;
  Redis-cached; degrades to raw query on failure.
- **Embed** (`embed.ts`): `InvokeModelCommand` → Titan → 1536-dim vector; cached.

**Idiom:** for structured LLM output use tool-use with a JSON input schema, not
prose parsing. Always have a graceful fallback (LLM/network can fail).

---

## 6. Hybrid search SQL (`src/lib/db/search.ts`)

Reciprocal Rank Fusion (k=60) over three rankers (vector / FTS / tag), with
scope + spoiler filtering **inside the SQL** so no hidden row escapes the DB.

Composing big SQL from drizzle `sql` fragments:

```ts
function scopeCte(viewerId, scope): SQL { return scope === "mine" ? sql`...` : sql`...`; }
const vectorRanker = vectorLiteral ? sql`vec_rank AS (...)` : EMPTY_RANKER(sql`vec_rank`);

db.execute(sql`
  WITH ${scopeCte(viewerId, scope)},
  filtered AS (SELECT s.* FROM scoped s WHERE true ${includeFilter} ${excludeFilter}),
  ${vectorRanker}, ${ftsRanker}, ${tagRanker},
  fused AS (SELECT id, SUM(1.0 / (60 + rank)) AS rrf_score FROM (...) GROUP BY id)
  SELECT ... ORDER BY fused.rrf_score DESC LIMIT ${limit}
`);
```

**Idioms:**
- `sql` fragments compose; an empty fragment is `sql\`\``; interpolate arrays as
  `${arr}::text[]`, a pgvector literal as `${'[1,2]'}::vector`.
- AND-semantics for "must have all tags" = `HAVING COUNT(DISTINCT tag) = N`.
- Keep authz (scope) + spoiler rules in SQL, never filter after the fact in JS.

---

## 7. Testing idioms (`src/tests/`)

Tests live under `src/tests/` (not `tests/`). Global mocks in `setup.ts`
(auth session authenticated by default, `db.*` chainable, redis, `server-only`).

```ts
// mock a module, then import the mocked symbol to assert on it
vi.mock("@/lib/search/expand", () => ({ expandQuery: vi.fn() }));
import { expandQuery } from "@/lib/search/expand";

// call ordering
expect(vi.mocked(a).mock.invocationCallOrder[0])
  .toBeLessThan(vi.mocked(b).mock.invocationCallOrder[0]);

// assert on generated SQL without a DB: compile the drizzle SQL object
import { PgDialect } from "drizzle-orm/pg-core";
const { sql, params } = new PgDialect().sqlToQuery(dbExecuteMock.mock.calls.at(-1)[0]);
expect(sql).toContain("HAVING COUNT(DISTINCT tag) =");
```

**Idiom:** to test SQL builders, capture the `sql` object passed to the mocked
`db.execute` and compile it with `PgDialect().sqlToQuery` — this also proves the
composition is well-formed. Toggle a mocked `Features` flag per test by mutating
the mocked object in `beforeEach`.

---

## 8. UI idioms (modals / panels)

Inline styles with CSS custom-property tokens: `var(--card)`, `var(--border)`,
`var(--primary)`, `var(--muted-foreground)`, `var(--radius)`. Consistent modal
recipe (see `EntryTagsModal`, `SearchPanel`, `BugReportModal`):

- Fixed overlay `inset: 0`, `rgba(0,0,0,0.5)`; click-outside closes
  (`if (e.target === e.currentTarget) onClose()`).
- Escape closes via a `keydown` listener; lock `document.body.style.overflow`
  while open and restore on cleanup.
- Autofocus the primary input on mount.
- When a child modal owns Escape, guard the parent's Escape handler
  (`if (showChildModal) return;`).

`TagChip`: namespace → color map, name-only label, full tag in `title`, ~15%
opacity background (hex `+ "26"`).

---

## 9. REST endpoint shape

One resource endpoint, multiple methods — not a spread of sub-routes (matches
the "single REST endpoint" preference).

```
/api/entries/[entryId]/tags   GET (list) | POST (add) | DELETE (remove)
```

Ownership checked once per method (owner-only → 404 hides existence). Input
normalized/validated against the taxonomy namespaces before writing.

---

## 10. Async pipeline: SQS → Lambda tagger

App side (`src/lib/tagging.ts`): fire-and-forget enqueue, no-op unless
configured, never throws (best-effort must not block a write).

```ts
export function enqueueForTagging(entryId, content) {
  if (!Features.tagging) return;
  void client.send(new SendMessageCommand({ QueueUrl, MessageBody: JSON.stringify(...) }))
    .catch((e) => console.error(...));
}
```

Lambda side (`tagger/index.mjs`):
- **Module-scope clients + caches** reused across warm invocations (Bedrock
  client, one pooled `postgres` connection, taxonomy loaded once).
- **Supabase transaction pooler** (`prepare: false`) — the right connection mode
  for Lambda concurrency.
- Structured tags via Bedrock **tool-use**; normalize (synonyms) → validate
  against `tag_taxonomy` → apply implications.
- **Partial batch failure:** return `{ batchItemFailures: [{ itemIdentifier }] }`
  so only failed messages retry (then DLQ). Mark the row `processing_status`
  `processing` → `done` / `failed`.

---

## 11. Drizzle migrations

Workflow: edit `schema.ts` → `db:generate` → `db:migrate`. Hand-written
migrations (like `0001_books_fts.sql`, `0003_semantic_search_tags.sql`) are used
for things the schema DSL can't express (generated columns, pgvector, GIN/HNSW
indexes, seed data) and are registered in `meta/_journal.json` with a snapshot.

**Idioms:**
- Make hand-written migrations **idempotent**: `CREATE TABLE IF NOT EXISTS`,
  `ADD COLUMN IF NOT EXISTS`, `ON CONFLICT DO NOTHING`. Then they're safe whether
  run via `db:migrate` or pasted into the Supabase SQL editor.
- `CREATE EXTENSION` (pg_trgm, vector) is a dashboard/superuser step — note it,
  don't put it in the migration.
- Objects that exist only in the DB (not modeled in `schema.ts`) are invisible to
  `generate` (safe) but **`db:push` would drop them** — so avoid `push` here.
- **Adopting drizzle on a hand-applied DB:** baseline by inserting rows into
  `drizzle.__drizzle_migrations` (hash + `created_at` = journal `when`) for the
  already-applied migrations; drizzle then only runs newer ones. It decides what
  to apply by comparing `when` to the last recorded `created_at`, not by hash.
- Migrations want a **direct** connection (port 5432), not the transaction pooler
  (6543).

---

## 12. Terraform (`tagger/main.tf`)

**Why Terraform:** declarative desired-state (describe what exists, it computes
the diff), state tracking (idempotent `apply`, previewable `plan`, clean
`destroy`), an automatic dependency graph from resource references, and
versioned/reviewable infra-as-code. Preferred over Console (not reproducible),
an SDK script (imperative, no drift management), or SAM/CDK (CloudFormation-
coupled; CDK needs bootstrap).

Idioms used here:

```hcl
terraform { required_providers { aws = { source = "hashicorp/aws", version = "~> 5.0" } } }

variable "database_url" { type = string, sensitive = true }   # secrets marked sensitive

# reference-driven dependencies: the mapping depends on both by referencing them
resource "aws_lambda_event_source_mapping" "sqs" {
  event_source_arn        = aws_sqs_queue.tagger.arn
  function_name           = aws_lambda_function.tagger.arn
  function_response_types = ["ReportBatchItemFailures"]   # matches the handler's return
}

# let Terraform build the zip (no external `zip` CLI); function code lives in
# its own dir so the archive excludes the .tf files
data "archive_file" "tagger" {
  type        = "zip"
  source_dir  = "${path.module}/function"
  output_path = "${path.module}/build/tagger.zip"
}

resource "aws_lambda_function" "tagger" {
  filename         = data.archive_file.tagger.output_path
  source_code_hash = data.archive_file.tagger.output_base64sha256  # re-uploads on change
}

output "queue_url" { value = aws_sqs_queue.tagger.url }   # surface what the app needs
```

- **Build the zip in Terraform:** the `archive_file` data source zips the code
  at plan time — no `zip` CLI, and `source_code_hash` auto-triggers re-upload.
  Keep function code in its own dir (`function/`) so the archive doesn't pull in
  the `.tf`/state files. Run `npm install` there first so deps are bundled.
- **DLQ + redrive:** `redrive_policy` with `maxReceiveCount` routes poison
  messages to a dead-letter queue after N retries.
- **Visibility timeout ≥ Lambda timeout** so a message isn't re-delivered while
  still being processed.
- **IAM least-ish privilege:** scope SQS actions to the queue ARN; `InvokeModel`
  is `*` only to sidestep cross-region inference-profile ARNs (tighten later).
- `sensitive = true` keeps secrets out of plan/apply output.
- **State** (`.tfstate`) is gitignored; a team would use a remote backend (S3).

---

## 13. Git / workflow conventions

- Commits: short, lowercase, comma-separated, single line (e.g. `add tagger
  lambda, sqs enqueue, terraform infra`). No `Co-Authored-By`, no em dashes, no
  `+`, no verbose bodies.
- Planning docs (`refactor.md`, `semantic-search.md`, `booklooptag.md`, this
  file) stay untracked / committed only on request.
- Build verification uses dummy secrets locally (gator HTTPS + QStash keys) since
  those modules validate env at import. The 5 failing `feed.test.ts` tests are
  pre-existing (fail on `main` too), not regressions.
