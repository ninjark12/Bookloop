import { db } from "@/db";
import { authors, authorFollows } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { registerAuthor } from "@/lib/gator-client";

// Ensure an author is registered with Gator and followed by the user.
// Safe to call multiple times — all inserts are on-conflict-do-nothing.
// Returns silently on any error so callers never need to handle failures.
export async function ensureAuthorFollowed(
  userId: string,
  authorName: string
): Promise<void> {
  try {
    const trimmed = authorName.trim();
    if (!trimmed) return;

    // Check if author already exists in local catalog (case-insensitive)
    const [existing] = await db
      .select({ id: authors.id, gatorAuthorId: authors.gatorAuthorId })
      .from(authors)
      .where(sql`lower(${authors.name}) = lower(${trimmed})`)
      .limit(1);

    let authorId: string;

    if (existing) {
      authorId = existing.id;
      // If previously registered without a Gator ID (e.g. Gator was down), retry
      if (!existing.gatorAuthorId) {
        const gatorAuthor = await registerAuthor(trimmed);
        if (gatorAuthor) {
          await db
            .update(authors)
            .set({ gatorAuthorId: gatorAuthor.id })
            .where(eq(authors.id, existing.id))
            .catch(() => {});
        }
      }
    } else {
      // Register with Gator first so we have the ID before inserting locally
      const gatorAuthor = await registerAuthor(trimmed);

      const [inserted] = await db
        .insert(authors)
        .values({
          name: trimmed,
          gatorAuthorId: gatorAuthor?.id ?? null,
        })
        .onConflictDoNothing()
        .returning({ id: authors.id });

      if (!inserted) {
        // Lost a race — fetch the row the winner created
        const [raced] = await db
          .select({ id: authors.id })
          .from(authors)
          .where(sql`lower(${authors.name}) = lower(${trimmed})`)
          .limit(1);
        if (!raced) return;
        authorId = raced.id;
      } else {
        authorId = inserted.id;
      }
    }

    await db
      .insert(authorFollows)
      .values({ userId, authorId })
      .onConflictDoNothing();
  } catch (err) {
    console.error("[author-sync] ensureAuthorFollowed failed:", err);
  }
}
