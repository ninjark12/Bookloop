import FriendJournalSkeleton from "@/components/friends/FriendJournalSkeleton";

// Shown while the server component resolves the friend lookup + auth check.
// Layout-aware (desktop spread vs mobile grid) via CSS media queries.
export default function Loading() {
  return <FriendJournalSkeleton />;
}
