import { getSession } from "@/lib/get-session";
import { redirect, notFound } from "next/navigation";
import { isFriend } from "@/lib/db/friends";
import { getUserById } from "@/lib/db/users";
import FriendJournalClient from "@/components/friends/FriendJournalClient";

type FriendUser = {
  id: string;
  name: string | null;
  image: string | null;
  display_name: string | null;
  discriminator: string | null;
};

// /u/[userId] — a friend's public journal, spoiler-filtered to the viewer's own
// progress. The authorization gate lives here: a non-friend must never see
// another user's entries by guessing the URL.
export default async function FriendJournalPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;

  const session = await getSession();
  if (!session) redirect("/login");

  const user = (await getUserById(userId)) as FriendUser | null;
  if (!user) notFound();

  const viewerId = session.user.id;
  const isSelf = userId === viewerId;
  const friends = isSelf || (await isFriend(viewerId, userId));

  if (!friends) {
    return (
      <div style={{ maxWidth: "680px", margin: "0 auto", padding: "4rem 1.5rem", textAlign: "center" }}>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: "1.25rem", fontWeight: 700, color: "var(--foreground)", marginBottom: "0.5rem" }}>
          Not friends yet
        </h1>
        <p style={{ fontSize: "14px", color: "var(--muted-foreground)", margin: 0 }}>
          You can only read {user.name ?? "this reader"}&apos;s journal once you&apos;re friends. Send them a request from your Feed.
        </p>
      </div>
    );
  }

  return (
    <FriendJournalClient
      userId={userId}
      name={user.name}
      displayName={user.display_name}
      discriminator={user.discriminator}
      isSelf={isSelf}
    />
  );
}
