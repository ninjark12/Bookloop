import { NextRequest, NextResponse } from "next/server"
import { db } from "@/db"
import { books } from "@/db/schema"
import { ilike, or } from "drizzle-orm"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
export const dynamic = "force-dynamic"

// Only call Open Library when the DB returns fewer than this many results.
// As the catalog grows, more searches stay local.
const OL_THRESHOLD = 5

function fieldScore(q: string, s: string): number {
  if (!s) return 0
  if (s === q) return 100
  if (s.startsWith(q)) return 90
  if (s.includes(q)) return 70
  let i = 0
  while (i < q.length && i < s.length && q[i] === s[i]) i++
  return i > 0 ? (i / q.length) * 60 : 0
}

function rankScore(q: string, title: string, author: string): number {
  const qn = q.toLowerCase().trim()
  return Math.max(fieldScore(qn, title.toLowerCase()), fieldScore(qn, author.toLowerCase()))
}

export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const q = request.nextUrl.searchParams.get("q")
  if (!q || q.trim().length === 0) {
    return NextResponse.json({ error: "q is required" }, { status: 400 })
  }
  if (q.length > 200) {
    return NextResponse.json({ error: "Query too long" }, { status: 400 })
  }

  // 1. DB search — check for the query anywhere in title or author
  const localResults = await db
    .select()
    .from(books)
    .where(
      or(
        ilike(books.title, `%${q}%`),
        ilike(books.author, `%${q}%`)
      )
    )
    .limit(10)

  // 2. Enough DB results — return without hitting Open Library
  if (localResults.length >= OL_THRESHOLD) {
    return NextResponse.json({
      results: localResults.map((b) => ({ ...b, source: "local" })),
      source: "local",
    })
  }

  // 3. Supplement with Open Library (also handles typos via OL's own fuzzy search)
  try {
    const res = await fetch(
      `https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&limit=15&fields=key,title,author_name,cover_i,first_publish_year`,
      { next: { revalidate: 3600 } }
    )
    const olData = res.ok ? await res.json() : { docs: [] }

    // Don't show OL results that are already in our DB
    const localOlKeys = new Set(localResults.map((b) => b.olKey).filter(Boolean))
    const olResults = (olData.docs ?? [])
      .filter((doc: { key: string }) => !localOlKeys.has(doc.key))
      .slice(0, 10 - localResults.length)
      .map((doc: {
        key: string
        title?: string
        author_name?: string[]
        cover_i?: number
        first_publish_year?: number
      }) => ({
        id: null,
        olKey: doc.key,
        title: doc.title ?? "Unknown title",
        author: doc.author_name?.[0] ?? "Unknown author",
        coverUrl: doc.cover_i
          ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg`
          : null,
        publishedYear: doc.first_publish_year ?? null,
        source: "openlibrary",
      }))

    olResults.sort((a, b) => rankScore(q, b.title, b.author) - rankScore(q, a.title, a.author))

    return NextResponse.json({
      results: [
        ...localResults.map((b) => ({ ...b, source: "local" })),
        ...olResults,
      ],
      source: localResults.length > 0 ? "mixed" : "openlibrary",
    })
  } catch {
    // OL failed — return whatever the DB had
    return NextResponse.json({
      results: localResults.map((b) => ({ ...b, source: "local" })),
      source: "local",
    })
  }
}
