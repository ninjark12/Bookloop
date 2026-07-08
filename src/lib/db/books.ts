import { db } from "@/db";
import { sql } from "drizzle-orm";

/** Books where `ownerId` has at least one PUBLIC entry — for friend profile grid. */
export async function getPublicBooksForUser(ownerId: string) {
  return db.execute(sql`
    SELECT
      b.*,
      rp.status,
      rp.furthest_chapter,
      COUNT(je.id)::int AS public_entry_count
    FROM books b
    JOIN reading_progress rp ON rp.book_id = b.id AND rp.user_id = ${ownerId}
    JOIN journal_entries je ON je.book_id = b.id
      AND je.user_id = ${ownerId}
      AND je.is_public = true
    GROUP BY b.id, rp.status, rp.furthest_chapter, rp.updated_at
    ORDER BY rp.updated_at DESC
  `);
}

/** The viewer's furthest chapter on a book. 0 if not started. */
export async function getViewerChapter(viewerId: string, bookId: string): Promise<number> {
  const result = await db.execute(sql`
    SELECT furthest_chapter FROM reading_progress
    WHERE user_id = ${viewerId} AND book_id = ${bookId}
    LIMIT 1
  `);
  return (result[0] as { furthest_chapter?: number })?.furthest_chapter ?? 0;
}
