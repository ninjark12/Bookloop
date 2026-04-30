import { NextRequest, NextResponse } from "next/server"
import { db } from "@/db"
import { books } from "@/db/schema"
import { ilike, or } from "drizzle-orm"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"

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

  // 1. Check our DB first (write-through cache)
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

  if (localResults.length > 0) {
    return NextResponse.json({ results: localResults, source: "local" })
  }

  // 2. Fall back to Open Library
  try {
    const res = await fetch(
      `https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&limit=10&fields=key,title,author_name,cover_i,first_publish_year`,
      { next: { revalidate: 3600 } } // cache OL responses for 1 hour
    )

    if (!res.ok) {
      return NextResponse.json({ error: "Open Library unavailable" }, { status: 502 })
    }

    const olData = await res.json()

    const results = (olData.docs ?? []).map((doc: any) => ({
      id: null, // not in our DB yet
      olKey: doc.key,
      title: doc.title ?? "Unknown title",
      author: doc.author_name?.[0] ?? "Unknown author",
      coverUrl: doc.cover_i
        ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg`
        : null,
      publishedYear: doc.first_publish_year ?? null,
      source: "openlibrary",
    }))

    return NextResponse.json({ results, source: "openlibrary" })
  } catch {
    return NextResponse.json({ error: "Failed to fetch from Open Library" }, { status: 500 })
  }
}

