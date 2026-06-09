import { db } from "@/db";
import { users } from "@/db/schema";
import { and, eq, isNotNull, ne } from "drizzle-orm";

/**
 * Finds an unused 4-digit discriminator for `displayName`.
 * Pass `excludeUserId` to skip the calling user when checking conflicts.
 * Returns null only if all 10 000 slots are exhausted.
 */
export async function assignDiscriminator(
  displayName: string,
  excludeUserId?: string
): Promise<string | null> {
  const baseCondition = and(
    eq(users.displayName, displayName),
    isNotNull(users.discriminator),
    ...(excludeUserId ? [ne(users.id, excludeUserId)] : [])
  );

  const takenRows = await db
    .select({ discriminator: users.discriminator })
    .from(users)
    .where(baseCondition);

  const taken = new Set(takenRows.map((r) => r.discriminator).filter(Boolean));

  // Try 20 random candidates first — avoids a full scan in the common case.
  for (let i = 0; i < 20; i++) {
    const c = String(Math.floor(Math.random() * 10000)).padStart(4, "0");
    if (!taken.has(c)) return c;
  }

  if (taken.size >= 10000) return null;

  for (let n = 0; n < 10000; n++) {
    const c = String(n).padStart(4, "0");
    if (!taken.has(c)) return c;
  }

  return null;
}

/** Sanitizes a raw user name into a valid display name (strips #, trims, caps at 32). */
export function sanitizeDisplayName(raw: string): string {
  return raw.replace(/#/g, "").trim().slice(0, 32) || "Reader";
}
