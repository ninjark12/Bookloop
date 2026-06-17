import { getSession } from "@/lib/get-session";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import ProfileClient from "@/components/ProfileClient";
import { getStreakCount } from "@/lib/streak";

export default async function ProfilePage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const [[user], streakCount] = await Promise.all([
    db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        streakCount: users.streakCount,
        emailNotifications: users.emailNotifications,
        createdAt: users.createdAt,
        displayName: users.displayName,
        discriminator: users.discriminator,
      })
      .from(users)
      .where(eq(users.id, session.user.id))
      .limit(1),
    getStreakCount(session.user.id),
  ]);

  if (!user) redirect("/login");

  return <ProfileClient user={{ ...user, streakCount }} />;
}
