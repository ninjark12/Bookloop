import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/get-session";
import { db } from "@/db";
import { users } from "@/db/schema";
import { and, eq, ilike, isNotNull, ne } from "drizzle-orm";

const USER_COLS = {
  id: users.id,
  name: users.name,
  displayName: users.displayName,
  discriminator: users.discriminator,
  image: users.image,
} as const;

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
    if (!q) return NextResponse.json({ users: [] });

    const hashIdx = q.lastIndexOf("#");

    // --- Exact tag search: Name#1234 ---
    if (hashIdx !== -1) {
      const displayName = q.slice(0, hashIdx).trim();
      const discriminator = q.slice(hashIdx + 1).trim();

      if (!displayName || !/^\d{4}$/.test(discriminator)) {
        return NextResponse.json({ error: "Tag must be in Name#1234 format" }, { status: 400 });
      }

      const [user] = await db
        .select(USER_COLS)
        .from(users)
        .where(and(eq(users.displayName, displayName), eq(users.discriminator, discriminator)))
        .limit(1);

      if (!user || user.id === session.user.id) return NextResponse.json({ users: [] });
      return NextResponse.json({ users: [user] });
    }

    // --- Name search: partial match on displayName ---
    if (q.length < 2) {
      return NextResponse.json({ error: "Search must be at least 2 characters" }, { status: 400 });
    }

    const results = await db
      .select(USER_COLS)
      .from(users)
      .where(
        and(
          ilike(users.displayName, `%${q}%`),
          isNotNull(users.displayName),
          ne(users.id, session.user.id)
        )
      )
      .limit(5);

    return NextResponse.json({ users: results });
  } catch (e) {
    console.error("[GET /api/users/search]", e);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
