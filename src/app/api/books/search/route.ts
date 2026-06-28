import { NextRequest, NextResponse } from "next/server"
import { db } from "@/db"
import { sql } from "drizzle-orm"
import { getSession } from "@/lib/get-session"
import { searchOpenLibraryCached } from "@/lib/book-search"
import { getJSON, keys, setJSON, TTL } from "@/lib/redis"

const LOCAL_RESULT_LIMIT = 20
const MIN_RELEVANT_LOCAL_RESULTS_BEFORE_SKIP_OL = 5
const RELEVANT_LOCAL_SCORE = 0.1

const ENGLISH_STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "but",
  "by",
  "for",
  "from",
  "how",
  "if",
  "in",
  "into",
  "is",
  "it",
  "no",
  "not",
  "of",
  "on",
  "or",
  "such",
  "that",
  "the",
  "their",
  "then",
  "there",
  "these",
  "they",
  "this",
  "to",
  "was",
  "what",
  "when",
  "where",
  "who",
  "will",
  "with",
])

function hasSearchLexemes(query: string): boolean {
  return (query.toLowerCase().match(/[a-z0-9]+/g) ?? []).some((token) => {
    return /\d/.test(token) || !ENGLISH_STOP_WORDS.has(token)
  })
}

function isShortOrAmbiguous(query: string): boolean {
  const tokens = query.toLowerCase().match(/[a-z0-9]+/g) ?? []
  return query.length <= 4 || tokens.length <= 1
}

// JS equivalent of pg_trgm's similarity(): 2-overlap / (|a| + |b|).
// Used to re-rank OL results with the same scoring the DB uses locally.
function trigramSimilarity(a: string, b: string): number {
  const trigrams = (s: string) => {
    const padded = `  ${s.toLowerCase()}  `
    const set = new Set<string>()
    for (let i = 0; i < padded.length - 2; i++) set.add(padded.slice(i, i + 3))
    return set
  }
  const ta = trigrams(a)
  const tb = trigrams(b)
  let overlap = 0
  for (const t of ta) if (tb.has(t)) overlap++
  return (2 * overlap) / (ta.size + tb.size)
}

function olScore(query: string, title: string, author: string): number {
  return Math.max(trigramSimilarity(title, query), trigramSimilarity(author, query))
}

type CachedLocalRow = {
  id: string
  olKey: string | null
  title: string
  author: string
  coverUrl: string | null
  publishedYear: number | null
  combinedScore: number
}

type LocalRow = CachedLocalRow & {
  readingStatus: "READING" | "READ" | "TBR" | "DNF" | null
}

async function searchLocalBooksRaw(q: string) {
  return hasSearchLexemes(q)
    ? await db.execute(sql`
      SELECT
        b.id::text,
        b.ol_key                                                           AS "olKey",
        b.title,
        b.author,
        b.cover_url                                                        AS "coverUrl",
        b.published_year                                                   AS "publishedYear",
        ts_rank(b.search_vector, websearch_to_tsquery('english', ${q}))
          + GREATEST(similarity(b.title, ${q}), similarity(b.author, ${q})) AS "combinedScore"
      FROM books b
      WHERE b.search_vector @@ websearch_to_tsquery('english', ${q})
         OR b.title  % ${q}
         OR b.author % ${q}
      ORDER BY "combinedScore" DESC
      LIMIT ${LOCAL_RESULT_LIMIT}
    `)
    : await db.execute(sql`
      SELECT
        b.id::text,
        b.ol_key                                            AS "olKey",
        b.title,
        b.author,
        b.cover_url                                         AS "coverUrl",
        b.published_year                                    AS "publishedYear",
        GREATEST(similarity(b.title, ${q}), similarity(b.author, ${q}))
          AS "combinedScore"
      FROM books b
      WHERE b.title  % ${q}
         OR b.author % ${q}
      ORDER BY "combinedScore" DESC
      LIMIT ${LOCAL_RESULT_LIMIT}
    `)
}

async function searchLocalBooksCached(q: string): Promise<{ rows: CachedLocalRow[]; cacheHit: boolean }> {
  const cacheKey = keys.bookLocalSearch(q)
  const cached = await getJSON<CachedLocalRow[]>(cacheKey)
  if (cached) return { rows: cached, cacheHit: true }

  const rows = await searchLocalBooksRaw(q) as unknown as CachedLocalRow[]
  await setJSON(cacheKey, rows, TTL.BOOK_LOCAL_SEARCH)
  return { rows, cacheHit: false }
}

async function hydrateLocalProgress(rows: CachedLocalRow[], userId: string): Promise<LocalRow[]> {
  if (rows.length === 0) return []

  const ids = rows.map((r) => r.id)
  const progressRows = await db.execute(sql`
    SELECT
      book_id::text AS "bookId",
      status        AS "readingStatus"
    FROM reading_progress
    WHERE user_id = ${userId}
      AND book_id IN (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})
  `)

  const progressByBookId = new Map(
    (progressRows as unknown as Array<{ bookId: string; readingStatus: LocalRow["readingStatus"] }>).map((row) => [
      row.bookId,
      row.readingStatus,
    ]),
  )

  return rows.map((row) => ({
    ...row,
    readingStatus: progressByBookId.get(row.id) ?? null,
  }))
}

function shouldQueryOpenLibrary(q: string, localRows: CachedLocalRow[]): boolean {
  const relevantLocalRows = localRows.filter((r) => r.combinedScore >= RELEVANT_LOCAL_SCORE)
  return (
    localRows.length === 0 ||
    relevantLocalRows.length < MIN_RELEVANT_LOCAL_RESULTS_BEFORE_SKIP_OL ||
    isShortOrAmbiguous(q)
  )
}

async function searchOpenLibrary(q: string, excludeOlKeys: string[]) {
  const { results: ol, cacheHit } = await searchOpenLibraryCached(q)
  const localOlKeys = new Set(excludeOlKeys)
  const results = ol
    .filter((o) => !localOlKeys.has(o.olKey))
    .map((o) => ({ id: null, ...o }))
    .sort((a, b) => olScore(q, b.title, b.author) - olScore(q, a.title, a.author))

  return { results, cacheHit }
}

async function hydrateOpenLibraryProgress<T extends { olKey: string | null }>(
  results: T[],
  userId: string,
): Promise<Array<T & { id: string | null; readingStatus: LocalRow["readingStatus"] }>> {
  const olKeys = results.map((r) => r.olKey).filter((key): key is string => Boolean(key))
  if (olKeys.length === 0) {
    return results.map((r) => ({ ...r, id: null, readingStatus: null }))
  }

  const rows = await db.execute(sql`
    SELECT
      b.id::text,
      b.ol_key  AS "olKey",
      rp.status AS "readingStatus"
    FROM books b
    INNER JOIN reading_progress rp
      ON rp.book_id = b.id
     AND rp.user_id = ${userId}
    WHERE b.ol_key IN (${sql.join(olKeys.map((olKey) => sql`${olKey}`), sql`, `)})
  `)

  const progressByOlKey = new Map(
    (rows as unknown as Array<{ id: string; olKey: string; readingStatus: LocalRow["readingStatus"] }>).map((row) => [
      row.olKey,
      { id: row.id, readingStatus: row.readingStatus },
    ]),
  )

  return results.map((result) => {
    const progress = result.olKey ? progressByOlKey.get(result.olKey) : undefined
    return {
      ...result,
      id: progress?.id ?? null,
      readingStatus: progress?.readingStatus ?? null,
    }
  })
}

export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const q = request.nextUrl.searchParams.get("q")?.trim()
  if (!q || q.trim().length < 2) {
    return NextResponse.json({ error: "q must be at least 2 characters" }, { status: 400 })
  }
  if (q.length > 200) {
    return NextResponse.json({ error: "Query too long" }, { status: 400 })
  }

  try {
    const source = request.nextUrl.searchParams.get("source")
    if (source === "openlibrary") {
      const excludeOlKeys = request.nextUrl.searchParams.getAll("excludeOlKey")
      const { results, cacheHit } = await searchOpenLibrary(q, excludeOlKeys)
      const hydratedResults = await hydrateOpenLibraryProgress(results, session.user.id)
      return NextResponse.json(
        {
          results: hydratedResults,
          localResults: [],
          openLibraryResults: hydratedResults,
          shouldQueryOpenLibrary: true,
          source: "openlibrary",
        },
        { headers: { "x-redis-cache": cacheHit ? "HIT" : "MISS" } },
      )
    }

    const { rows, cacheHit: localCacheHit } = await searchLocalBooksCached(q)
    const localRows = await hydrateLocalProgress(rows, session.user.id)
    const localResults = localRows.map((r) => ({ ...r, source: "local" as const }))
    const queryOpenLibrary = shouldQueryOpenLibrary(q, rows)

    if (source === "local") {
      return NextResponse.json(
        {
          results: localResults,
          localResults,
          openLibraryResults: [],
          shouldQueryOpenLibrary: queryOpenLibrary,
          source: "local",
        },
        { headers: { "x-local-cache": localCacheHit ? "HIT" : "MISS" } },
      )
    }

    if (!queryOpenLibrary) {
      return NextResponse.json(
        {
          results: localResults,
          localResults,
          openLibraryResults: [],
          shouldQueryOpenLibrary: false,
          source: "local",
        },
        { headers: { "x-local-cache": localCacheHit ? "HIT" : "MISS" } },
      )
    }

    const localOlKeys = localRows.map((r) => r.olKey).filter((olKey): olKey is string => Boolean(olKey))
    const { results: openLibraryResults, cacheHit } = await searchOpenLibrary(q, localOlKeys)
    const hydratedOpenLibraryResults = await hydrateOpenLibraryProgress(openLibraryResults, session.user.id)

    const scoredResults = [
      ...localResults,
      ...hydratedOpenLibraryResults,
    ].sort((a, b) => {
      const aScore = "combinedScore" in a ? a.combinedScore : olScore(q, a.title, a.author)
      const bScore = "combinedScore" in b ? b.combinedScore : olScore(q, b.title, b.author)
      return bScore - aScore
    })

    return NextResponse.json(
      {
        results: scoredResults,
        localResults,
        openLibraryResults: hydratedOpenLibraryResults,
        shouldQueryOpenLibrary: true,
        source: localRows.length > 0 ? "mixed" : "openlibrary",
      },
      { headers: { "x-redis-cache": cacheHit ? "HIT" : "MISS" } },
    )
  } catch (err) {
    console.error("[search] error:", (err as Error).message)
    return NextResponse.json({ error: "Search failed" }, { status: 500 })
  }
}
