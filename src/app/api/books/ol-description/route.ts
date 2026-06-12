import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { fetchBookDescription } from "@/lib/book-search"
import { keys, getJSON, setJSON, TTL } from "@/lib/redis"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const olKey = request.nextUrl.searchParams.get("olKey")
  if (!olKey || !olKey.startsWith("/works/")) {
    return NextResponse.json({ error: "Invalid olKey" }, { status: 400 })
  }

  const cacheKey = keys.bookDesc(olKey)

  // Wrap cached value so we can distinguish a stored null (confirmed miss)
  // from a missing key — both return null from getJSON otherwise.
  const cached = await getJSON<{ d: string | null }>(cacheKey)
  if (cached !== null) {
    return NextResponse.json({ description: cached.d })
  }

  const description = await fetchBookDescription(olKey)

  // Cache hits and confirmed misses so we don't hammer OL on every open
  await setJSON(cacheKey, { d: description }, TTL.BOOK_DESC)

  return NextResponse.json({ description })
}
