import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api";
import { isFriend } from "@/lib/db/friends";
import { getPublicBooksForUser } from "@/lib/db/books";

export const dynamic = "force-dynamic";

// GET /api/users/[userId]/books — books where [userId] has at least one PUBLIC
// entry, for the friend-journal page. Gated to self or accepted friends: a
// non-friend must not be able to enumerate someone's shelf by URL.
export const GET = withAuth(async (_req, session, params) => {
  const viewerId = session.user.id;
  const { userId } = params;

  if (userId !== viewerId && !(await isFriend(viewerId, userId))) {
    return NextResponse.json({ error: "Not friends with this user" }, { status: 403 });
  }

  const books = await getPublicBooksForUser(userId);
  return NextResponse.json({ books });
});
