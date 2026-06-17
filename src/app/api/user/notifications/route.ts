import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/get-session";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let emailNotifications: boolean;
  try {
    const body = await req.json();
    if (typeof body.emailNotifications !== "boolean") {
      throw new Error("invalid");
    }
    emailNotifications = body.emailNotifications;
  } catch {
    return NextResponse.json(
      { error: "emailNotifications must be a boolean" },
      { status: 400 }
    );
  }

  await db
    .update(users)
    .set({ emailNotifications })
    .where(eq(users.id, session.user.id));

  return NextResponse.json({ emailNotifications });
}
