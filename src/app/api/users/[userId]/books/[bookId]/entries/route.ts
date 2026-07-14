import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api";
import { isFriend } from "@/lib/db/friends";
import { getPublicBookEntriesWithSpoilers } from "@/lib/db/journal";

export const dynamic = "force-dynamic";

// GET /api/users/[userId]/books/[bookId]/entries — [userId]'s PUBLIC entries for
// [bookId]. Nothing is hidden: every entry is returned, but each carries a
// `spoilered` flag computed against how far the VIEWER has read (same rule as the
// feed), so the client can blur-and-reveal past-progress entries. Gated to self
// or accepted friends. bookId is validated as a UUID in the service layer
// (assertUuid -> 400 via the wrapper).
export const GET = withAuth(async (_req, session, params) => {
  const viewerId = session.user.id;
  const { userId, bookId } = params;

  if (userId !== viewerId && !(await isFriend(viewerId, userId))) {
    return NextResponse.json({ error: "Not friends with this user" }, { status: 403 });
  }

  const entries = await getPublicBookEntriesWithSpoilers(userId, bookId, viewerId);
  return NextResponse.json({ entries });
});
