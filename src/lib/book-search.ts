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

type OLDescription = string | { value: string } | undefined | null;

export async function fetchBookDescription(olKey: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OL_TIMEOUT_MS);
  try {
    const res = await fetch(`https://openlibrary.org${olKey}.json`, {
      signal: controller.signal,
      headers: { "User-Agent": "Bookloop/1.0 (bookloop.sh)" },
    });
    if (!res.ok) return null;
    const data = await res.json() as { description?: OLDescription };
    const desc = data.description;
    if (!desc) return null;
    if (typeof desc === "string") return desc;
    if (typeof desc === "object" && desc.value) return desc.value;
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

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
    return [];
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
  key: string;
  title: string;
  author_name?: string[];
  cover_i?: number;
  first_publish_year?: number;
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
