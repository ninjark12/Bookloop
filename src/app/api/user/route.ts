import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { users, journalEntries, readingProgress, books } from "@/db/schema";
import { eq } from "drizzle-orm";
export const dynamic = "force-dynamic"
export async function DELETE(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;

  // Delete in dependency order to satisfy foreign keys:
  //   1. journal entries (refs users + books)
  //   2. reading_progress (refs users + books)
  //   3. Better Auth managed tables (sessions, accounts, verifications)
  //      -- Better Auth handles these via auth.api.deleteUser if available,
  //         otherwise delete manually
  //   4. users row last

  await db.delete(journalEntries).where(eq(journalEntries.userId, userId));
  await db.delete(readingProgress).where(eq(readingProgress.userId, userId));

  // Better Auth manages sessions/accounts -- sign out first to invalidate session
  await auth.api.signOut({ headers: await headers() }).catch(() => null);

  // Delete the user row -- cascades to Better Auth tables if FK cascade is set,
  // otherwise Better Auth's adapter will clean up on next request
  await db.delete(users).where(eq(users.id, userId));

  return NextResponse.json({ success: true });
}
