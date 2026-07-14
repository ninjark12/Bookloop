"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { X, Users, BookOpen, Trash2 } from "lucide-react";
import { useFriends, useRemoveFriend, type Friend } from "@/hooks/useFriends";

export default function ManageFriendsModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  // Modal only mounts when open, so fetching eagerly here is fine.
  const { data: friends = [], isLoading, isError, refetch } = useFriends();
  const removeFriend = useRemoveFriend();
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  function goToJournal(userId: string) {
    onClose();
    router.push(`/u/${userId}`);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Your friends"
      style={{
        position: "fixed", inset: 0, zIndex: 100,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "rgba(0,0,0,0.4)", padding: "1rem",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: "var(--card)",
        border: "0.5px solid var(--border)",
        borderRadius: "var(--radius)",
        padding: "1.5rem",
        width: "100%", maxWidth: "420px",
        maxHeight: "80vh",
        display: "flex", flexDirection: "column", gap: "1rem",
        boxShadow: "0 8px 32px rgba(0,0,0,0.16)",
      }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: "16px", fontWeight: 700, color: "var(--foreground)", margin: 0 }}>
            Friends{friends.length > 0 ? ` (${friends.length})` : ""}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted-foreground)", display: "flex", padding: "4px" }}
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        {/* Body */}
        <div style={{ overflowY: "auto", display: "flex", flexDirection: "column", gap: "8px" }}>
          {isLoading ? (
            [0, 1, 2].map((i) => (
              <div key={i} aria-hidden="true" style={{ height: "56px", background: "var(--muted)", borderRadius: "var(--radius)", opacity: 0.5, animation: "pulse 1.5s ease-in-out infinite" }} />
            ))
          ) : isError ? (
            <div style={{ textAlign: "center", padding: "1.5rem 0" }}>
              <p style={{ fontSize: "13px", color: "var(--destructive)", margin: "0 0 10px" }}>Couldn&apos;t load your friends.</p>
              <button
                type="button"
                onClick={() => refetch()}
                style={{ padding: "6px 14px", fontSize: "12px", border: "0.5px solid var(--border)", borderRadius: "var(--radius)", background: "var(--muted)", color: "var(--foreground)", cursor: "pointer", fontFamily: "inherit" }}
              >
                Retry
              </button>
            </div>
          ) : friends.length === 0 ? (
            <div style={{ textAlign: "center", padding: "2rem 1rem" }}>
              <Users size={32} aria-hidden="true" style={{ color: "var(--muted-foreground)", margin: "0 auto 0.75rem", display: "block" }} />
              <p style={{ fontSize: "13px", color: "var(--muted-foreground)", margin: 0 }}>
                No friends yet. Use “Add Friend” to send a request.
              </p>
            </div>
          ) : (
            friends.map((friend) => (
              <FriendRow
                key={friend.id}
                friend={friend}
                confirming={confirmingId === friend.id}
                onJournal={() => goToJournal(friend.id)}
                onAskRemove={() => setConfirmingId(friend.id)}
                onCancelRemove={() => setConfirmingId(null)}
                onConfirmRemove={() => {
                  setConfirmingId(null);
                  removeFriend.mutate(friend.id);
                }}
              />
            ))
          )}
        </div>
      </div>

      <style>{`@keyframes pulse { 0%, 100% { opacity: 0.5; } 50% { opacity: 0.8; } }`}</style>
    </div>
  );
}

function FriendRow({
  friend,
  confirming,
  onJournal,
  onAskRemove,
  onCancelRemove,
  onConfirmRemove,
}: {
  friend: Friend;
  confirming: boolean;
  onJournal: () => void;
  onAskRemove: () => void;
  onCancelRemove: () => void;
  onConfirmRemove: () => void;
}) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "0.75rem", gap: "0.75rem",
      background: "var(--background)", border: "0.5px solid var(--border)",
      borderRadius: "var(--radius)",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0 }}>
        <div style={{
          width: "32px", height: "32px", borderRadius: "50%", flexShrink: 0,
          background: "color-mix(in srgb, var(--primary) 15%, var(--card))",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: "12px", fontWeight: 700, color: "var(--primary)",
        }}>
          {(friend.name ?? "?")[0].toUpperCase()}
        </div>
        <div style={{ minWidth: 0 }}>
          <p style={{ fontSize: "14px", fontWeight: 600, color: "var(--foreground)", margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {friend.name ?? "Reader"}
          </p>
          {friend.display_name && friend.discriminator && (
            <p style={{ fontSize: "11px", color: "var(--muted-foreground)", margin: 0, fontFamily: "var(--font-display)" }}>
              {friend.display_name}#{friend.discriminator}
            </p>
          )}
        </div>
      </div>

      <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: "6px" }}>
        {confirming ? (
          <>
            <button
              type="button"
              onClick={onConfirmRemove}
              style={{ padding: "5px 10px", fontSize: "12px", border: "none", borderRadius: "var(--radius)", background: "var(--destructive)", color: "var(--primary-foreground)", cursor: "pointer", fontFamily: "inherit" }}
            >
              Remove
            </button>
            <button
              type="button"
              onClick={onCancelRemove}
              style={{ padding: "5px 10px", fontSize: "12px", border: "0.5px solid var(--border)", borderRadius: "var(--radius)", background: "transparent", color: "var(--muted-foreground)", cursor: "pointer", fontFamily: "inherit" }}
            >
              Cancel
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={onJournal}
              aria-label={`View ${friend.name ?? "reader"}'s journal`}
              title="View journal"
              style={{ display: "flex", alignItems: "center", gap: "4px", padding: "5px 10px", fontSize: "12px", border: "0.5px solid var(--border)", borderRadius: "var(--radius)", background: "var(--card)", color: "var(--foreground)", cursor: "pointer", fontFamily: "inherit" }}
            >
              <BookOpen size={13} aria-hidden="true" /> Journal
            </button>
            <button
              type="button"
              onClick={onAskRemove}
              aria-label={`Remove ${friend.name ?? "reader"}`}
              title="Remove friend"
              style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "28px", height: "28px", border: "0.5px solid var(--border)", borderRadius: "var(--radius)", background: "var(--card)", color: "var(--muted-foreground)", cursor: "pointer" }}
            >
              <Trash2 size={13} aria-hidden="true" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
