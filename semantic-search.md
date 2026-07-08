# Semantic Search Implementation -- Claude Code Task

Reference CLAUDE_CODE_CONTEXT.md for project patterns and CLAUDE_CODE_REFACTOR.md
for the conventions (withAuth wrapper, service layer, TanStack Query hooks,
CacheKeys, Features). This task follows those conventions strictly.

Full taxonomy reference: BOOKLOOP_TAG_TAXONOMY.md (namespace list, open namespaces).

---

## PREREQUISITES (verify before starting)

These must already be true. If any are false, stop and tell the user.

1. pgvector extension enabled on Supabase, `embedding vector(1536)` column exists
   on journal_entries with `processing_status` column
2. Tables exist: journal_entry_tags, tag_taxonomy, tag_synonyms
3. The tagger Lambda is deployed and entries are getting tags + embeddings
   (check: `SELECT COUNT(*) FROM journal_entries WHERE processing_status = 'done'`
   returns > 0)
4. AWS credentials in env: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION
5. @aws-sdk/client-bedrock-runtime is installed (it is, per context doc)
6. Refactor conventions in place: src/lib/api.ts, src/lib/db/, src/hooks/,
   src/lib/features.ts, src/lib/cache-keys.ts

---

## MANUAL SETUP (user does this, not Claude Code)

### M1: HNSW index (run in Supabase SQL editor once entries have embeddings)

Only build after at least ~100 entries have embeddings. Before that, sequential
scan is fine and the index adds insert overhead for no benefit. The app works
identically either way -- this is purely a performance optimization.

```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_journal_entries_embedding
  ON journal_entries USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
```

### M2: Full-text search index (run now)

```sql
CREATE INDEX IF NOT EXISTS idx_journal_entries_fts
  ON journal_entries USING GIN (to_tsvector('english', content));
```

### M3: IAM permission check

The `bookloop-app` IAM user (used by the Next.js app on Vercel) needs
bedrock:InvokeModel on both models -- the query expansion and query embedding
happen in the API route, not the Lambda. Verify the IAM user's policy includes:

```json
{
  "Effect": "Allow",
  "Action": ["bedrock:InvokeModel"],
  "Resource": [
    "arn:aws:bedrock:us-east-2::foundation-model/us.anthropic.claude-haiku-4-5-20251001-v1:0",
    "arn:aws:bedrock:us-east-2::foundation-model/amazon.titan-embed-text-v2:0"
  ]
}
```

### M4: Env vars (add to .env.local and Vercel)

```
SEARCH_EXPANSION_MODEL_ID=us.anthropic.claude-haiku-4-5-20251001-v1:0
SEARCH_EMBEDDING_MODEL_ID=amazon.titan-embed-text-v2:0
```

---

## WHAT CLAUDE CODE BUILDS

Architecture of one search request:

```
User types query in SearchPanel
  -> useSearch hook -> GET /api/search?q=...&scope=...&tags=...
    -> parseQuery(): split explicit booru tags from natural language
    -> if natural language present:
         expandQuery() via Bedrock -> { tags[], semanticQuery }   [cached in Redis]
         embedQuery() via Titan -> float[1536]                    [cached in Redis]
    -> hybridSearch(): RRF over (tag rank, vector rank, FTS rank)
       with scope + spoiler filtering in SQL
    -> results ranked, returned with matched tags highlighted
```

---

## Task 1: Feature flag

Add to `src/lib/features.ts`:

```typescript
/** Semantic search (requires Bedrock access + tagged entries). */
search: !!process.env.SEARCH_EXPANSION_MODEL_ID && !!process.env.AWS_ACCESS_KEY_ID,
```

---

## Task 2: Query parser

File: `src/lib/search/parser.ts`

Pure function, no I/O. Fully unit-testable.

```typescript
export const VALID_NAMESPACES = [
  "type", "mode",
  "theme", "emotion", "character", "relationship", "plot", "trope", "tone",
  "claim", "evidence", "method", "concept", "discipline", "relation",
  "strength", "question",
] as const;

export type ParsedQuery = {
  /** Tags the user typed explicitly, e.g. theme:betrayal */
  includeTags: string[];
  /** Tags prefixed with -, e.g. -type:summary */
  excludeTags: string[];
  /** Everything that is not a tag -- natural language remainder */
  naturalLanguage: string;
};

const NAMESPACE_SET = new Set<string>(VALID_NAMESPACES);

/**
 * Splits a raw query string into explicit booru tags and natural language.
 *
 * Rules:
 * - token matching `namespace:value` where namespace is valid -> include tag
 * - token matching `-namespace:value` -> exclude tag
 * - quoted phrases stay together as natural language: "found family"
 * - tag values are lowercased; multi-word tag values are not supported in
 *   direct syntax (taxonomy uses hyphens: theme:found-family)
 * - anything else -> natural language, joined with spaces
 */
export function parseQuery(raw: string): ParsedQuery {
  const includeTags: string[] = [];
  const excludeTags: string[] = [];
  const nlParts: string[] = [];

  // Tokenize respecting double quotes
  const tokens = raw.match(/"[^"]+"|\S+/g) ?? [];

  for (const token of tokens) {
    // Quoted phrase -> natural language, strip quotes
    if (token.startsWith('"') && token.endsWith('"')) {
      nlParts.push(token.slice(1, -1));
      continue;
    }

    const isExclude = token.startsWith("-");
    const body = isExclude ? token.slice(1) : token;
    const colonIdx = body.indexOf(":");

    if (colonIdx > 0) {
      const namespace = body.slice(0, colonIdx).toLowerCase();
      const value = body.slice(colonIdx + 1).toLowerCase();
      if (NAMESPACE_SET.has(namespace) && value.length > 0) {
        const tag = `${namespace}:${value}`;
        (isExclude ? excludeTags : includeTags).push(tag);
        continue;
      }
    }

    // Not a valid tag -> natural language (keep the - if it was there,
    // since "-something" in prose is rare but stripping changes meaning)
    nlParts.push(token);
  }

  return {
    includeTags: [...new Set(includeTags)],
    excludeTags: [...new Set(excludeTags)],
    naturalLanguage: nlParts.join(" ").trim(),
  };
}
```

Also create `tests/lib/search-parser.test.ts` with vitest covering:
- pure tag query: `theme:betrayal type:quote`
- exclusion: `theme:betrayal -type:summary`
- pure natural language: `sad chapters about betrayal`
- mixed: `type:quote quotes that connect to socialism`
- quoted phrase: `"found family" emotion:joy`
- invalid namespace treated as NL: `foo:bar hello`
- empty string
- case normalization: `THEME:Betrayal` -> `theme:betrayal`

---

## Task 3: Bedrock query expansion

File: `src/lib/search/expand.ts`

Server-only. Converts natural language into taxonomy tags + a semantic query
string for embedding. Cached in Redis (expansion for the same query text is
deterministic enough at temperature 0).

```typescript
import "server-only";
import {
  BedrockRuntimeClient,
  ConverseCommand,
} from "@aws-sdk/client-bedrock-runtime";
import { redis } from "@/lib/redis";
import { CacheKeys } from "@/lib/cache-keys";

const client = new BedrockRuntimeClient({ region: process.env.AWS_REGION });

export type QueryExpansion = {
  tags: string[];          // taxonomy tags inferred from the NL query
  semanticQuery: string;   // enriched text to embed for vector search
};

const EXPAND_TOOL = {
  toolSpec: {
    name: "expand_search_query",
    description: "Convert a natural language reading-journal search into tags and an enriched semantic query.",
    inputSchema: {
      json: {
        type: "object",
        properties: {
          tags: {
            type: "array",
            items: { type: "string" },
            description: "0-5 namespace:value tags from the controlled vocabulary that match the query intent. Empty array if none clearly apply.",
          },
          semanticQuery: {
            type: "string",
            description: "The query rewritten as a dense set of semantically related terms for embedding-based retrieval. 10-25 words.",
          },
        },
        required: ["tags", "semanticQuery"],
      },
    },
  },
};

const SYSTEM = `You convert reading-journal search queries into structured search parameters.

The journal contains entries about books (fiction, manga, academic papers).
Tags use namespace:value format. Only use tags from this vocabulary:

type: reflection, quote, summary, prediction, critique, connection, question, note, analysis, character-study
theme: betrayal, redemption, sacrifice, power, identity, loss, found-family, revenge, coming-of-age, war, love, mortality, freedom, justice, isolation, corruption, loyalty, hope, survival, fate, ambition, honor, truth, cycle, transformation
emotion: grief, joy, rage, dread, awe, hope, melancholy, catharsis, tension, relief, confusion, excitement, frustration, satisfaction, heartbreak, wonder, fear, nostalgia, numbness
plot: twist, revelation, death, battle, reunion, sacrifice, betrayal-event, transformation, confrontation, discovery, escape, loss
tone: dark, hopeful, bittersweet, comedic, tragic, tense, melancholic, ominous, cathartic, satirical
claim: thesis, hypothesis, counterargument, assumption, conclusion, definition, analogy, caveat
evidence: empirical, statistical, anecdotal, citation, case-study, experiment, theoretical, historical, comparative
discipline: economics, philosophy, history, cs, psychology, sociology, biology, political-science, law, anthropology, linguistics, mathematics, physics, education, medicine
concept: (open -- coin from query, lowercase-hyphenated, e.g. concept:socialism)
character: (open -- coin from query if a character is named, e.g. character:guts)

Rules:
- Only add a tag when the query CLEARLY implies it. Fewer, more confident tags beat many weak ones.
- "quotes" implies type:quote. "predictions"/"theories" imply type:prediction.
- Named concepts (socialism, opportunity cost) become concept: tags.
- The semanticQuery should expand the topic with related vocabulary likely to
  appear in journal entries about it. Do not include tag syntax in semanticQuery.`;

export async function expandQuery(naturalLanguage: string): Promise<QueryExpansion> {
  const cacheKey = CacheKeys.searchExpansion(naturalLanguage);

  // Redis cache first (graceful if Redis down)
  try {
    const cached = await redis.get(cacheKey);
    if (cached) return JSON.parse(cached);
  } catch { /* cache miss path */ }

  const response = await client.send(new ConverseCommand({
    modelId: process.env.SEARCH_EXPANSION_MODEL_ID,
    system: [{ text: SYSTEM }],
    messages: [{ role: "user", content: [{ text: naturalLanguage }] }],
    toolConfig: {
      tools: [EXPAND_TOOL],
      toolChoice: { tool: { name: "expand_search_query" } },
    },
    inferenceConfig: { maxTokens: 300, temperature: 0 },
  }));

  const toolBlock = response.output?.message?.content?.find((b) => b.toolUse);
  if (!toolBlock?.toolUse?.input) {
    // Degrade gracefully: no tags, embed the raw query
    return { tags: [], semanticQuery: naturalLanguage };
  }

  const expansion = toolBlock.toolUse.input as QueryExpansion;

  // Validate tags against parser namespaces (defense against model drift)
  const { parseQuery } = await import("./parser");
  const validated = expansion.tags.filter(
    (t) => parseQuery(t).includeTags.length === 1
  );

  const result: QueryExpansion = {
    tags: validated,
    semanticQuery: expansion.semanticQuery || naturalLanguage,
  };

  try {
    await redis.set(cacheKey, JSON.stringify(result), "EX", 60 * 60 * 24); // 24h
  } catch { /* non-fatal */ }

  return result;
}
```

---

## Task 4: Query embedding

File: `src/lib/search/embed.ts`

```typescript
import "server-only";
import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";
import { redis } from "@/lib/redis";
import { CacheKeys } from "@/lib/cache-keys";

const client = new BedrockRuntimeClient({ region: process.env.AWS_REGION });

/** Embed a search query via Titan. Returns 1536-dim vector. Redis-cached 24h. */
export async function embedQuery(text: string): Promise<number[]> {
  const cacheKey = CacheKeys.searchEmbedding(text);

  try {
    const cached = await redis.get(cacheKey);
    if (cached) return JSON.parse(cached);
  } catch { /* miss */ }

  const response = await client.send(new InvokeModelCommand({
    modelId: process.env.SEARCH_EMBEDDING_MODEL_ID,
    contentType: "application/json",
    accept: "application/json",
    body: JSON.stringify({
      inputText: text.slice(0, 8000),
      dimensions: 1536,
      normalize: true,
    }),
  }));

  const parsed = JSON.parse(new TextDecoder().decode(response.body));
  const embedding: number[] = parsed.embedding;

  try {
    await redis.set(cacheKey, JSON.stringify(embedding), "EX", 60 * 60 * 24);
  } catch { /* non-fatal */ }

  return embedding;
}
```

Add to `src/lib/cache-keys.ts`:

```typescript
searchExpansion: (q: string) => `search:expand:${q.toLowerCase().trim()}`,
searchEmbedding: (q: string) => `search:embed:${q.toLowerCase().trim()}`,
```

---

## Task 5: Hybrid search service (the core)

File: `src/lib/db/search.ts`

Reciprocal rank fusion over three ranked lists: tag matches, vector similarity,
full-text search. Scope and spoiler filtering happen inside the SQL so no
invisible entry ever leaves the database layer.

```typescript
import "server-only";
import { db } from "@/db";
import { sql } from "drizzle-orm";

export type SearchScope = "mine" | "friends";

export type SearchParams = {
  viewerId: string;
  scope: SearchScope;
  includeTags: string[];     // hard filter: entry must have ALL of these
  excludeTags: string[];     // hard filter: entry must have NONE of these
  expandedTags: string[];    // soft signal from Bedrock: boosts rank, not a filter
  queryVector: number[] | null;  // null when query is pure tags
  ftsQuery: string | null;       // natural language for tsquery, null if pure tags
  limit?: number;
};

/**
 * Hybrid search with RRF (k=60).
 *
 * Scope semantics:
 * - mine: all of the viewer's own entries (public and private)
 * - friends: public entries of ACCEPTED friends, spoiler-filtered per book
 *   against the viewer's own reading progress (unstarted book -> 0 -> nothing visible)
 *
 * RRF: score = SUM over rankers of 1 / (60 + rank). Rankers:
 * 1. vector: ORDER BY embedding <=> query (only entries with embeddings)
 * 2. fts: ORDER BY ts_rank (only when ftsQuery present; catches pending entries)
 * 3. tag: entries matching expandedTags, ranked by match count + verified boost
 */
export async function hybridSearch(params: SearchParams) {
  const {
    viewerId, scope, includeTags, excludeTags, expandedTags,
    queryVector, ftsQuery, limit = 20,
  } = params;

  const vectorLiteral = queryVector ? `[${queryVector.join(",")}]` : null;

  // Scope CTE: the set of (entry) rows the viewer may see AT ALL.
  const scopeSql =
    scope === "mine"
      ? sql`
        scoped AS (
          SELECT je.*, u.name AS author_name, u.display_name AS author_display_name
          FROM journal_entries je
          JOIN users u ON u.id = je.user_id
          WHERE je.user_id = ${viewerId}
        )`
      : sql`
        friend_ids AS (
          SELECT CASE
            WHEN fr.sender_id = ${viewerId} THEN fr.receiver_id
            ELSE fr.sender_id
          END AS fid
          FROM friend_requests fr
          WHERE fr.status = 'ACCEPTED'
            AND (fr.sender_id = ${viewerId} OR fr.receiver_id = ${viewerId})
        ),
        scoped AS (
          SELECT je.*, u.name AS author_name, u.display_name AS author_display_name
          FROM journal_entries je
          JOIN users u ON u.id = je.user_id
          JOIN friend_ids f ON f.fid = je.user_id
          LEFT JOIN reading_progress vp
            ON vp.user_id = ${viewerId} AND vp.book_id = je.book_id
          WHERE je.is_public = true
            AND je.chapter_end <= COALESCE(vp.furthest_chapter, 0)
        )`;

  // Hard tag filters
  const includeFilter =
    includeTags.length > 0
      ? sql`AND s.id IN (
          SELECT entry_id FROM journal_entry_tags
          WHERE tag = ANY(${includeTags}::text[])
          GROUP BY entry_id
          HAVING COUNT(DISTINCT tag) = ${includeTags.length}
        )`
      : sql``;

  const excludeFilter =
    excludeTags.length > 0
      ? sql`AND s.id NOT IN (
          SELECT entry_id FROM journal_entry_tags
          WHERE tag = ANY(${excludeTags}::text[])
        )`
      : sql``;

  // Ranker CTEs -- each produces (id, rank)
  const vectorRanker = vectorLiteral
    ? sql`
      vec_rank AS (
        SELECT s.id, ROW_NUMBER() OVER (
          ORDER BY s.embedding <=> ${vectorLiteral}::vector
        ) AS rank
        FROM filtered s
        WHERE s.embedding IS NOT NULL
        LIMIT 100
      )`
    : sql`vec_rank AS (SELECT NULL::uuid AS id, NULL::bigint AS rank WHERE false)`;

  const ftsRanker = ftsQuery
    ? sql`
      fts_rank AS (
        SELECT s.id, ROW_NUMBER() OVER (
          ORDER BY ts_rank(
            to_tsvector('english', s.content),
            plainto_tsquery('english', ${ftsQuery})
          ) DESC
        ) AS rank
        FROM filtered s
        WHERE to_tsvector('english', s.content) @@ plainto_tsquery('english', ${ftsQuery})
        LIMIT 100
      )`
    : sql`fts_rank AS (SELECT NULL::uuid AS id, NULL::bigint AS rank WHERE false)`;

  const tagRanker =
    expandedTags.length > 0
      ? sql`
      tag_rank AS (
        SELECT jet.entry_id AS id, ROW_NUMBER() OVER (
          ORDER BY
            COUNT(*) FILTER (WHERE jet.verified) * 2 + COUNT(*) DESC
        ) AS rank
        FROM journal_entry_tags jet
        JOIN filtered s ON s.id = jet.entry_id
        WHERE jet.tag = ANY(${expandedTags}::text[])
        GROUP BY jet.entry_id
        LIMIT 100
      )`
      : sql`tag_rank AS (SELECT NULL::uuid AS id, NULL::bigint AS rank WHERE false)`;

  const result = await db.execute(sql`
    WITH ${scopeSql},
    filtered AS (
      SELECT s.* FROM scoped s
      WHERE true ${includeFilter} ${excludeFilter}
    ),
    ${vectorRanker},
    ${ftsRanker},
    ${tagRanker},
    fused AS (
      SELECT id, SUM(1.0 / (60 + rank)) AS rrf_score
      FROM (
        SELECT id, rank FROM vec_rank
        UNION ALL
        SELECT id, rank FROM fts_rank
        UNION ALL
        SELECT id, rank FROM tag_rank
      ) all_ranks
      WHERE id IS NOT NULL
      GROUP BY id
    )
    SELECT f2.*, fused.rrf_score,
           b.title AS book_title, b.author AS book_author, b.cover_url AS book_cover_url
    FROM fused
    JOIN filtered f2 ON f2.id = fused.id
    JOIN books b ON b.id = f2.book_id
    ORDER BY fused.rrf_score DESC
    LIMIT ${limit}
  `);

  return result;
}

/**
 * Pure-tag search fallback: when the query has tags but no natural language
 * (no vector, no FTS), rank by verified-boosted tag match count then recency.
 */
export async function tagOnlySearch(params: Omit<SearchParams, "queryVector" | "ftsQuery" | "expandedTags">) {
  const { viewerId, scope, includeTags, excludeTags, limit = 20 } = params;
  // Same scoped/filtered CTEs, then:
  // ORDER BY (verified matches * 2 + total matches) DESC, created_at DESC
  // Claude Code: implement by reusing the scope + filter SQL from hybridSearch,
  // with the tag_rank ordering applied directly. Keep it in this file.
}
```

IMPLEMENTATION NOTE for Claude Code: the exact sql template composition above is
the shape to aim for, but drizzle sql fragments compose with sql.join / sql.raw --
adjust syntax so it compiles. The non-negotiables:
1. Scope and spoiler logic in the SQL, not in JS after the fact
2. RRF with k=60 over the three rankers
3. includeTags is AND semantics (HAVING COUNT(DISTINCT tag) = N)
4. Verified tags get 2x weight in the tag ranker
5. LIMIT 100 inside each ranker before fusion (bounds the work)

---

## Task 6: The /api/search route

File: `src/app/api/search/route.ts`

```typescript
import { withAuth } from "@/lib/api";
import { Features } from "@/lib/features";
import { parseQuery } from "@/lib/search/parser";
import { expandQuery } from "@/lib/search/expand";
import { embedQuery } from "@/lib/search/embed";
import { hybridSearch, tagOnlySearch } from "@/lib/db/search";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export const GET = withAuth(async (req, session) => {
  if (!Features.search) {
    return NextResponse.json({ error: "Search is not enabled" }, { status: 503 });
  }

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").slice(0, 300).trim();
  const scope = url.searchParams.get("scope") === "friends" ? "friends" : "mine";

  if (q.length < 2) {
    return NextResponse.json({ results: [], expansion: null });
  }

  const parsed = parseQuery(q);
  const hasNL = parsed.naturalLanguage.length > 0;

  let expandedTags: string[] = [];
  let queryVector: number[] | null = null;
  let ftsQuery: string | null = null;

  if (hasNL) {
    // Expansion and embedding run in parallel where possible:
    // expansion produces the semanticQuery that gets embedded, so it is
    // sequential -- but FTS uses the raw NL, so set that immediately.
    ftsQuery = parsed.naturalLanguage;
    const expansion = await expandQuery(parsed.naturalLanguage);
    expandedTags = expansion.tags.filter(
      (t) => !parsed.excludeTags.includes(t)
    );
    queryVector = await embedQuery(expansion.semanticQuery);
  }

  const results = hasNL
    ? await hybridSearch({
        viewerId: session.user.id,
        scope,
        includeTags: parsed.includeTags,
        excludeTags: parsed.excludeTags,
        expandedTags,
        queryVector,
        ftsQuery,
      })
    : await tagOnlySearch({
        viewerId: session.user.id,
        scope,
        includeTags: parsed.includeTags,
        excludeTags: parsed.excludeTags,
      });

  return NextResponse.json({
    results,
    expansion: hasNL ? { tags: expandedTags } : null,
    parsed: { includeTags: parsed.includeTags, excludeTags: parsed.excludeTags },
  });
});
```

Latency note: a cold NL search = 1 Bedrock call (~400-800ms) + 1 Titan call
(~100-200ms) + 1 Postgres query (~50ms). Warm (Redis-cached expansion+embedding)
= just the Postgres query. This is acceptable for an explicit search action.
Do NOT call this endpoint on every keystroke -- the hook debounces (Task 7).

---

## Task 7: useSearch hook

File: `src/hooks/useSearch.ts`

```typescript
"use client";

import { useQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";

export type SearchScope = "mine" | "friends";

/** Debounced value helper */
function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

export function useSearch(query: string, scope: SearchScope) {
  const debouncedQuery = useDebounced(query.trim(), 500);

  return useQuery({
    queryKey: ["search", debouncedQuery, scope],
    queryFn: async () => {
      const params = new URLSearchParams({ q: debouncedQuery, scope });
      const res = await fetch(`/api/search?${params}`);
      if (!res.ok) throw new Error("Search failed");
      return res.json(); // { results, expansion, parsed }
    },
    enabled: debouncedQuery.length >= 2,
    staleTime: 60_000,      // same query within a minute reuses the result
    placeholderData: (prev) => prev, // keep old results while new ones load
  });
}
```

---

## Task 8: SearchPanel UI

File: `src/components/search/SearchPanel.tsx`

A slide-out panel from the right side, triggered by a search icon in the navbar.

Structure:

```
[Overlay -- click to close]
[Panel: fixed right, full height, width 480px desktop / 100% mobile]
  [Header row]
    Search input (autofocus on open)
    Close button (X, and Escape key closes)
  [Scope toggle -- two segmented buttons]
    "My journal" | "Friends"
  [Syntax hint -- one muted line]
    Try: theme:betrayal -type:summary, or just describe what you remember
  [Expansion chips -- when response.expansion?.tags present]
    "Searching:" followed by the expanded tag chips (muted style)
    Each chip has a small x to exclude it (adds -tag to the query)
  [Results list -- scrollable]
    Each result card:
      Book cover thumbnail + title (small)
      Chapter badge (same formatChapter logic as journal)
      Author name (only in friends scope)
      Content preview -- 3 line clamp
      Tag chips (max 4 shown, "+N" for more)
    Click -> navigate:
      mine scope    -> /journal/[bookId]  (existing own-journal page)
      friends scope -> /users/[userId]/books/[bookId]
  [States]
    Loading: 3 skeleton cards
    Empty (query >= 2 chars, no results): "No entries found" + hint to try
      different words or fewer tags
    Error: inline message with retry button
    Idle (query < 2 chars): recent searches would go here later -- for now,
      show a short "what you can search" explainer with 2-3 example queries
      as clickable chips that fill the input:
        - theme:betrayal
        - quotes about power
        - type:prediction -tone:comedic
```

Behavior:
- Panel state (open/closed) lives in the navbar or a small zustand-free context;
  simplest: local state in Navbar with the panel rendered there
- Keyboard: "/" opens the panel when not in an input, Escape closes
- Body scroll locked while open (same pattern as journal modal)
- Uses useSearch hook -- no manual fetch
- Scope toggle state resets results naturally via queryKey change

Navbar change: add a Search icon button (lucide Search) next to the feedback
button. On mobile bottom navbar (if present), add search there too.

Styling: match existing app patterns -- var(--card), var(--border),
var(--primary), same radius and font tokens as JournalPageClient inline styles
or Tailwind classes, whichever the neighboring components use.

---

## Task 9: Entry tag chips (shared component)

File: `src/components/search/TagChip.tsx`

Small shared chip used by SearchPanel results, entry detail views, and the
friend journal tag filter.

```tsx
type Props = {
  tag: string;              // full "namespace:name"
  active?: boolean;         // for filter toggles
  onClick?: () => void;
  size?: "sm" | "md";
};
```

Rendering: namespace gets a color from a fixed map, name is the label.

```typescript
const NAMESPACE_COLORS: Record<string, string> = {
  type: "#6ab8f7",
  theme: "#7c6af7",
  emotion: "#f76ab8",
  character: "#f7a26a",
  plot: "#6af7b0",
  tone: "#f7e16a",
  trope: "#b06af7",
  relationship: "#6af7e1",
  claim: "#f76a6a",
  evidence: "#a2f76a",
  method: "#6a8df7",
  concept: "#f7c96a",
  discipline: "#8df76a",
  relation: "#f78d6a",
  strength: "#6af78d",
  question: "#c9f76a",
  mode: "#8888aa",
};
```

Chip shows `name` only (namespace conveyed by color + tooltip with full tag).
This keeps chips compact. Use color at ~15% opacity for background, full color
for text, matching the existing chapter badge pattern.

---

## Task 10: Tests

vitest, following existing test patterns in tests/.

- tests/lib/search-parser.test.ts (from Task 2 -- pure function, thorough)
- tests/api/search.test.ts:
  - 503 when Features.search is false (mock env)
  - empty results for q shorter than 2 chars
  - pure tag query does NOT call Bedrock (mock expand/embed, assert not called)
  - NL query calls expand then embed (mock, assert call order)
  - scope=friends passes through to service layer
- tests/lib/db/search.test.ts: mock db.execute, assert:
  - includeTags produce the HAVING COUNT clause with the right length
  - friends scope SQL contains the spoiler comparison and COALESCE(...,0)
  - excludeTags produce NOT IN

---

## Build order and verification

1. Task 1-2 (flag + parser) -> run parser tests
2. Task 3-4 (expand + embed) -> verify with a temporary script or route call
   that expansion returns sane tags for "quotes about socialism"
3. Task 5 (hybrid search) -> test in isolation with SQL against real data
4. Task 6 (route) -> curl it: /api/search?q=theme:betrayal and an NL query
5. Task 7-9 (hook + panel + chips) -> manual UI testing
6. Task 10 (tests) -> bun run test
7. bun run build must pass

Manual test checklist:
- [ ] theme:betrayal returns tagged entries, no Bedrock call (check no latency)
- [ ] "sad chapters about betrayal" returns semantically ranked results
- [ ] type:quote quotes about power -- hybrid: hard-filtered to quotes, ranked by meaning
- [ ] -type:summary excludes summaries
- [ ] Friends scope: only public friend entries, spoiler-safe (test with Maya
      seed data -- her chapter 8/15 Dune entries must NOT appear while you are
      at chapter 5)
- [ ] Friends scope on a book you have not started: friend entries absent
- [ ] Repeat identical NL query is fast (Redis-cached expansion + embedding)
- [ ] Entry still in processing (no embedding) is findable via FTS words
- [ ] Search panel opens with "/", closes with Escape
- [ ] Empty and error states render
