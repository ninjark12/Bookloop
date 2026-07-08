import { db } from "@/db";
import { sql } from "drizzle-orm";
import { assertUuid, ValidationError } from "./validate";

// Tag helpers operate on the `journal_entry_tags` table (schema defined in
// booklooptag.md). They are non-functional until that migration is applied.

export type EntryTag = {
  tag: string;
  namespace: string;
  name: string;
  source: string;
  verified: boolean;
};

/** True if the entry exists and belongs to `userId`. */
export async function entryBelongsToUser(entryId: string, userId: string): Promise<boolean> {
  assertUuid(entryId, "entryId");
  const result = await db.execute(sql`
    SELECT 1 FROM journal_entries
    WHERE id = ${entryId} AND user_id = ${userId}
    LIMIT 1
  `);
  return result.length > 0;
}

/** All tags on a single entry (for the entry tags modal). */
export async function getEntryTags(entryId: string): Promise<EntryTag[]> {
  assertUuid(entryId, "entryId");
  const result = await db.execute(sql`
    SELECT tag, namespace, name, source, verified
    FROM journal_entry_tags
    WHERE entry_id = ${entryId}
    ORDER BY namespace, name
  `);
  return result as unknown as EntryTag[];
}

/**
 * Add a user tag to an entry. `tag` is a full "namespace:name" string.
 * Idempotent: re-adding an existing tag marks it user-verified.
 */
export async function addEntryTag(entryId: string, tag: string): Promise<void> {
  assertUuid(entryId, "entryId");
  const colonIdx = tag.indexOf(":");
  if (colonIdx <= 0) throw new ValidationError("Invalid tag");
  const namespace = tag.slice(0, colonIdx);
  const name = tag.slice(colonIdx + 1);
  await db.execute(sql`
    INSERT INTO journal_entry_tags (entry_id, tag, namespace, name, source, verified)
    VALUES (${entryId}, ${tag}, ${namespace}, ${name}, 'user', true)
    ON CONFLICT (entry_id, tag)
    DO UPDATE SET verified = true, source = 'user'
  `);
}

/** Remove a tag from an entry. */
export async function removeEntryTag(entryId: string, tag: string): Promise<void> {
  assertUuid(entryId, "entryId");
  await db.execute(sql`
    DELETE FROM journal_entry_tags
    WHERE entry_id = ${entryId} AND tag = ${tag}
  `);
}

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
