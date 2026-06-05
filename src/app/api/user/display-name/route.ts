import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/get-session";
import { db } from "@/db";
import { users } from "@/db/schema";
import { and, eq, ne } from "drizzle-orm";
export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const userId = session.user.id;

    let body: { displayName?: string };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const displayName = body.displayName?.trim();
    if (!displayName) {
      return NextResponse.json({ error: "displayName is required" }, { status: 400 });
    }
    if (displayName.length > 32) {
      return NextResponse.json({ error: "Display name must be 32 characters or fewer" }, { status: 400 });
    }
    if (displayName.includes("#")) {
      return NextResponse.json({ error: "Display name cannot contain #" }, { status: 400 });
    }

    const [currentUser] = await db
      .select({ discriminator: users.discriminator })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!currentUser) return NextResponse.json({ error: "User not found" }, { status: 404 });

    let discriminator = currentUser.discriminator;

    if (!discriminator) {
      // First time — assign a discriminator for this display name.
      // Fetch only the discriminators already taken under this name (not all users).
      const takenRows = await db
        .select({ discriminator: users.discriminator })
        .from(users)
        .where(and(eq(users.displayName, displayName), ne(users.id, userId)));

      const taken = new Set(takenRows.map((r) => r.discriminator).filter(Boolean));

      // Try up to 20 random candidates first — avoids a full scan in the common case.
      let found: string | null = null;
      for (let i = 0; i < 20; i++) {
        const candidate = String(Math.floor(Math.random() * 10000)).padStart(4, "0");
        if (!taken.has(candidate)) { found = candidate; break; }
      }

      // Fallback: if random picks all collided, scan sequentially.
      if (!found) {
        if (taken.size >= 10000) {
          return NextResponse.json(
            { error: "This display name is fully taken. Please choose a different one." },
            { status: 409 }
          );
        }
        for (let n = 0; n < 10000; n++) {
          const candidate = String(n).padStart(4, "0");
          if (!taken.has(candidate)) { found = candidate; break; }
        }
      }

      discriminator = found!;
    } else {
      // Discriminator already assigned — just check the new name doesn't conflict
      // with a different user who already holds (newName, sameDiscriminator).
      const [conflict] = await db
        .select({ id: users.id })
        .from(users)
        .where(
          and(
            eq(users.displayName, displayName),
            eq(users.discriminator, discriminator),
            ne(users.id, userId)
          )
        )
        .limit(1);

      if (conflict) {
        return NextResponse.json(
          { error: "That name is taken for your tag number. Try a different display name." },
          { status: 409 }
        );
      }
    }

    await db
      .update(users)
      .set({ displayName, discriminator })
      .where(eq(users.id, userId));

    return NextResponse.json({ displayName, discriminator });
  } catch (e) {
    console.error("[PATCH /api/user/display-name]", e);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
