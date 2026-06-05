import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/get-session";
import { db } from "@/db";
import { users } from "@/db/schema";
import { and, eq } from "drizzle-orm";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
    const hashIdx = q.lastIndexOf("#");
    if (hashIdx === -1) {
      return NextResponse.json({ error: "Search must be in Name#1234 format" }, { status: 400 });
    }

    const displayName = q.slice(0, hashIdx).trim();
    const discriminator = q.slice(hashIdx + 1).trim();

    if (!displayName || !/^\d{4}$/.test(discriminator)) {
      return NextResponse.json({ error: "Search must be in Name#1234 format" }, { status: 400 });
    }

    const [user] = await db
      .select({
        id: users.id,
        name: users.name,
        displayName: users.displayName,
        discriminator: users.discriminator,
        image: users.image,
      })
      .from(users)
      .where(and(eq(users.displayName, displayName), eq(users.discriminator, discriminator)))
      .limit(1);

    // Don't surface yourself in search results
    if (!user || user.id === session.user.id) {
      return NextResponse.json({ user: null });
    }

    return NextResponse.json({ user });
  } catch (e) {
    console.error("[GET /api/users/search]", e);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
