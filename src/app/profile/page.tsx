import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import ProfileClient from "@/components/ProfileClient";

export default async function ProfilePage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  const [user] = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      streakCount: users.streakCount,
      emailNotifications: users.emailNotifications,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);

  if (!user) redirect("/login");

  return <ProfileClient user={user} />;
}
