import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/get-session";
import { db } from "@/db";
import { users } from "@/db/schema";
import { and, eq, ne } from "drizzle-orm";
import { assignDiscriminator } from "@/lib/assign-discriminator";

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
      const found = await assignDiscriminator(displayName, userId);
      if (!found) {
        return NextResponse.json(
          { error: "This display name is fully taken. Please choose a different one." },
          { status: 409 }
        );
      }
      discriminator = found;
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
