-- NOTE: pg_trgm must be enabled in the Supabase dashboard (Database → Extensions)
-- before this migration runs. The CREATE EXTENSION statement is intentionally
-- omitted here because Supabase restricts it to superuser/dashboard only.

-- Weighted generated search vector: title (A) outranks author (B)
ALTER TABLE "books" ADD COLUMN "search_vector" tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(author, '')), 'B')
  ) STORED;--> statement-breakpoint

-- GIN index for full-text search (@@)
CREATE INDEX "books_search_idx" ON "books" USING GIN ("search_vector");--> statement-breakpoint

-- GIN trigram indexes for fuzzy / typo / substring matching (%)
CREATE INDEX "books_title_trgm_idx"  ON "books" USING GIN ("title"  gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "books_author_trgm_idx" ON "books" USING GIN ("author" gin_trgm_ops);