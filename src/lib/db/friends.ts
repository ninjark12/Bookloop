import { db } from "@/db";
import { sql } from "drizzle-orm";

/**
 * True if an ACCEPTED friend request exists between the two users
 * in either direction. This is THE friendship check — use it everywhere.
 */
export async function isFriend(userA: string, userB: string): Promise<boolean> {
  const result = await db.execute(sql`
    SELECT 1 FROM friend_requests
    WHERE status = 'ACCEPTED'
      AND (
        (sender_id = ${userA} AND receiver_id = ${userB})
        OR
        (sender_id = ${userB} AND receiver_id = ${userA})
      )
    LIMIT 1
  `);
  return result.length > 0;
}

/** All accepted friends of a user, with display info. */
export async function getFriends(userId: string) {
  return db.execute(sql`
    SELECT u.id, u.name, u.image, u.display_name, u.discriminator
    FROM users u
    JOIN friend_requests fr ON (
      (fr.sender_id = ${userId} AND fr.receiver_id = u.id)
      OR
      (fr.receiver_id = ${userId} AND fr.sender_id = u.id)
    )
    WHERE fr.status = 'ACCEPTED' AND u.id != ${userId}
    ORDER BY u.name
  `);
}

/**
 * Removes a friendship by setting status to DECLINED.
 * Returns true if a friendship was found and removed.
 * NOTE: friend_requests has no updated_at column in this schema, so we only
 * flip status.
 */
export async function removeFriend(userId: string, friendId: string): Promise<boolean> {
  const result = await db.execute(sql`
    UPDATE friend_requests
    SET status = 'DECLINED'
    WHERE status = 'ACCEPTED'
      AND (
        (sender_id = ${userId} AND receiver_id = ${friendId})
        OR
        (sender_id = ${friendId} AND receiver_id = ${userId})
      )
    RETURNING id
  `);
  return result.length > 0;
}

/** Pending incoming requests for the inbox panel. */
export async function getPendingRequests(userId: string) {
  return db.execute(sql`
    SELECT fr.id, fr.created_at, u.id as sender_id, u.name, u.image,
           u.display_name, u.discriminator
    FROM friend_requests fr
    JOIN users u ON u.id = fr.sender_id
    WHERE fr.receiver_id = ${userId} AND fr.status = 'PENDING'
    ORDER BY fr.created_at DESC
  `);
}
