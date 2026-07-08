/**
 * Go-forward Redis cache-key registry. Never write a key string inline in a
 * route — add it here so invalidation stays consistent.
 *
 * NOTE: An older key registry also lives in src/lib/redis.ts (`keys.*`) and is
 * still used by the book-search route. To avoid invalidating the production
 * cache, `bookSearch` here MATCHES that existing format exactly; the book-search
 * route is intentionally NOT migrated. New Redis usage should use this file.
 */
export const CacheKeys = {
  /** Matches the existing keys.bookSearch format in src/lib/redis.ts. */
  bookSearch: (q: string) => `book_search:${encodeURIComponent(q.toLowerCase().trim())}`,
  /** Semantic-search query-expansion cache (see src/lib/search/expand.ts). */
  searchExpansion: (q: string) => `search:expand:${q.toLowerCase().trim()}`,
  /** Semantic-search query-embedding cache (see src/lib/search/embed.ts). */
  searchEmbedding: (q: string) => `search:embed:${q.toLowerCase().trim()}`,
} as const;
