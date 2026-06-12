import { NextRequest, NextResponse } from "next/server"
import { db } from "@/db"
import { sql } from "drizzle-orm"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { searchOpenLibraryCached } from "@/lib/book-search"

export const dynamic = "force-dynamic"

// ts_rank sits in [0, 1]; require a meaningful match before skipping OL.
const LOCAL_THRESHOLD = 0.1

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

type LocalRow = {
  id: string
  olKey: string | null
  title: string
  author: string
  coverUrl: string | null
  publishedYear: number | null
  combinedScore: number
}

export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const q = request.nextUrl.searchParams.get("q")
  if (!q || q.trim().length < 2) {
    return NextResponse.json({ error: "q must be at least 2 characters" }, { status: 400 })
  }
  if (q.length > 200) {
    return NextResponse.json({ error: "Query too long" }, { status: 400 })
  }

  try {
    // Hybrid: FTS word/stem match (@@) + trigram fuzzy match (%)
    // websearch_to_tsquery is safe — never throws on weird input
    const rows = await db.execute(sql`
      SELECT
        id::text,
        ol_key                                                           AS "olKey",
        title,
        author,
        cover_url                                                        AS "coverUrl",
        published_year                                                   AS "publishedYear",
        ts_rank(search_vector, websearch_to_tsquery('english', ${q}))
          + GREATEST(similarity(title, ${q}), similarity(author, ${q})) AS "combinedScore"
      FROM books
      WHERE search_vector @@ websearch_to_tsquery('english', ${q})
         OR title  % ${q}
         OR author % ${q}
      ORDER BY "combinedScore" DESC
      LIMIT 20
    `)

    const localRows = rows as unknown as LocalRow[]

    const best = localRows[0]?.combinedScore ?? 0
    const enoughHits = localRows.length >= 3

    if (best >= LOCAL_THRESHOLD && enoughHits) {
      return NextResponse.json({
        results: localRows.map((r) => ({ ...r, source: "local" as const })),
        source: "local",
      })
    }

    // Weak local results — augment with cached OL, dedupe by ol_key
    const ol = await searchOpenLibraryCached(q)
    const localOlKeys = new Set(localRows.map((r) => r.olKey).filter(Boolean))
    const olDeduped = ol
      .filter((o) => !localOlKeys.has(o.olKey))
      .map((o) => ({ id: null, ...o }))
      .sort((a, b) => olScore(q, b.title, b.author) - olScore(q, a.title, a.author))


    return NextResponse.json({
      results: [
        ...localRows.map((r) => ({ ...r, source: "local" as const })),
        ...olDeduped,
      ],
      source: localRows.length > 0 ? "mixed" : "openlibrary",
    })
  } catch (err) {
    console.error("[search] error:", (err as Error).message)
    return NextResponse.json({ error: "Search failed" }, { status: 500 })
  }
}
