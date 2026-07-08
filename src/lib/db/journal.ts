import { db } from "@/db";
import { sql } from "drizzle-orm";
import { assertUuid } from "./validate";

// NOTE: The tag-related helpers from refactor.md (getVisibleTags, getEntryTags)
// are intentionally omitted here — they depend on a `journal_entry_tags` table
// that does not yet exist in this schema. Spoiler tags currently live as a
// text[] `spoiler_tags` column on journal_entries (computed via Bedrock). Add
// the tag helpers here once the tagging pipeline / table lands (see
// semantic-search.md prerequisites).

/**
 * THE spoiler filter. Public entries from `ownerId` for `bookId`,
 * visible only up to the viewer's furthest chapter.
 * viewerChapter = 0 means the viewer hasn't started — sees nothing.
 */
export async function getPublicEntriesForViewer(
  ownerId: string,
  bookId: string,
  viewerChapter: number
) {
  assertUuid(bookId, "bookId");
  return db.execute(sql`
    SELECT je.*
    FROM journal_entries je
    WHERE je.user_id = ${ownerId}
      AND je.book_id = ${bookId}
      AND je.is_public = true
      AND je.chapter_end <= ${viewerChapter}
    ORDER BY je.chapter_end DESC
  `);
}

/** Count of spoiler-hidden public entries (for the "X entries hidden" banner). */
export async function getHiddenEntryCount(
  ownerId: string,
  bookId: string,
  viewerChapter: number
): Promise<number> {
  assertUuid(bookId, "bookId");
  const result = await db.execute(sql`
    SELECT COUNT(*)::int AS count
    FROM journal_entries je
    WHERE je.user_id = ${ownerId}
      AND je.book_id = ${bookId}
      AND je.is_public = true
      AND je.chapter_end > ${viewerChapter}
  `);
  return (result[0] as { count?: number })?.count ?? 0;
}
