import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api";
import { getFriends } from "@/lib/db/friends";

export const dynamic = "force-dynamic";

// GET /api/friends — the viewer's accepted friends, flat display rows from the
// service layer: { id, name, image, display_name, discriminator }.
// (Previously returned a nested { id, createdAt, friend } shape; nothing consumed
// it, so this migrates to the service-layer shape per refactor.md Task 4.)
export const GET = withAuth(async (_req, session) => {
  const friends = await getFriends(session.user.id);
  return NextResponse.json({ friends });
});
