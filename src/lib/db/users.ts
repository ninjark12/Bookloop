import { db } from "@/db";
import { sql } from "drizzle-orm";

/** Look up a user by their URL identifier. Uses id since Better Auth ids are text. */
export async function getUserById(id: string) {
  const result = await db.execute(sql`
    SELECT id, name, image, display_name, discriminator, streak_count
    FROM users WHERE id = ${id} LIMIT 1
  `);
  return result[0] ?? null;
}

/** Search by displayName#discriminator, e.g. "Maya#0001". */
export async function findUserByTag(displayName: string, discriminator: string) {
  const result = await db.execute(sql`
    SELECT id, name, image, display_name, discriminator
    FROM users
    WHERE display_name = ${displayName} AND discriminator = ${discriminator}
    LIMIT 1
  `);
  return result[0] ?? null;
}
