import "server-only";
import { db } from "@/db";
import { sql, type SQL } from "drizzle-orm";

export type SearchScope = "mine" | "friends";

export type SearchParams = {
  viewerId: string;
  scope: SearchScope;
  includeTags: string[]; // hard filter: entry must have ALL of these
  excludeTags: string[]; // hard filter: entry must have NONE of these
  expandedTags: string[]; // soft signal from Bedrock: boosts rank, not a filter
  queryVector: number[] | null; // null when query is pure tags
  ftsQuery: string | null; // natural language for tsquery, null if pure tags
  limit?: number;
};

/**
 * The set of (entry) rows the viewer may see AT ALL.
 * - mine: all of the viewer's own entries (public and private)
 * - friends: public entries of ACCEPTED friends, spoiler-filtered per book
 *   against the viewer's own reading progress (unstarted book -> 0 -> nothing).
 */
function scopeCte(viewerId: string, scope: SearchScope): SQL {
  return scope === "mine"
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
}

/** Hard tag filters applied inside the `filtered` CTE (references alias `s`). */
function includeFilterSql(includeTags: string[]): SQL {
  if (includeTags.length === 0) return sql``;
  return sql`AND s.id IN (
    SELECT entry_id FROM journal_entry_tags
    WHERE tag IN ${includeTags}
    GROUP BY entry_id
    HAVING COUNT(DISTINCT tag) = ${includeTags.length}
  )`;
}

function excludeFilterSql(excludeTags: string[]): SQL {
  if (excludeTags.length === 0) return sql``;
  return sql`AND s.id NOT IN (
    SELECT entry_id FROM journal_entry_tags
    WHERE tag IN ${excludeTags}
  )`;
}

const EMPTY_RANKER = (name: SQL) =>
  sql`${name} AS (SELECT NULL::uuid AS id, NULL::bigint AS rank WHERE false)`;

/**
 * Hybrid search with reciprocal rank fusion (k=60) over three ranked lists:
 * vector similarity, full-text search, and taxonomy-tag matches. Scope and
 * spoiler filtering happen inside the SQL so no invisible entry ever leaves
 * the database layer.
 */
export async function hybridSearch(params: SearchParams) {
  const {
    viewerId,
    scope,
    includeTags,
    excludeTags,
    expandedTags,
    queryVector,
    ftsQuery,
    limit = 20,
  } = params;

  const vectorLiteral = queryVector ? `[${queryVector.join(",")}]` : null;

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
    : EMPTY_RANKER(sql`vec_rank`);

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
    : EMPTY_RANKER(sql`fts_rank`);

  const tagRanker =
    expandedTags.length > 0
      ? sql`
      tag_rank AS (
        SELECT jet.entry_id AS id, ROW_NUMBER() OVER (
          ORDER BY COUNT(*) FILTER (WHERE jet.verified) * 2 + COUNT(*) DESC
        ) AS rank
        FROM journal_entry_tags jet
        JOIN filtered s ON s.id = jet.entry_id
        WHERE jet.tag IN ${expandedTags}
        GROUP BY jet.entry_id
        LIMIT 100
      )`
      : EMPTY_RANKER(sql`tag_rank`);

  return db.execute(sql`
    WITH ${scopeCte(viewerId, scope)},
    filtered AS (
      SELECT s.* FROM scoped s
      WHERE true ${includeFilterSql(includeTags)} ${excludeFilterSql(excludeTags)}
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
}

/**
 * Pure-tag search fallback: when the query has tags but no natural language
 * (no vector, no FTS), rank by verified-boosted tag-match count then recency.
 * Reuses the same scope + hard-filter SQL as hybridSearch.
 */
export async function tagOnlySearch(
  params: Omit<SearchParams, "queryVector" | "ftsQuery" | "expandedTags">
) {
  const { viewerId, scope, includeTags, excludeTags, limit = 20 } = params;

  // Score by how many of the requested includeTags an entry carries, with a
  // 2x boost for user-verified tags. With no includeTags (pure exclusion),
  // this degrades to recency order.
  const scoreTags = includeTags.length > 0 ? includeTags : [""];

  return db.execute(sql`
    WITH ${scopeCte(viewerId, scope)},
    filtered AS (
      SELECT s.* FROM scoped s
      WHERE true ${includeFilterSql(includeTags)} ${excludeFilterSql(excludeTags)}
    ),
    scored AS (
      SELECT f.id,
             COALESCE(SUM(
               CASE WHEN jet.verified THEN 2 ELSE 1 END
             ) FILTER (WHERE jet.tag IN ${scoreTags}), 0) AS tag_score
      FROM filtered f
      LEFT JOIN journal_entry_tags jet ON jet.entry_id = f.id
      GROUP BY f.id
    )
    SELECT f2.*, scored.tag_score,
           b.title AS book_title, b.author AS book_author, b.cover_url AS book_cover_url
    FROM scored
    JOIN filtered f2 ON f2.id = scored.id
    JOIN books b ON b.id = f2.book_id
    ORDER BY scored.tag_score DESC, f2.created_at DESC
    LIMIT ${limit}
  `);
}
