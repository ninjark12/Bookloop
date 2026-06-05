"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { User, Bell, Trash2, LogOut, Users } from "lucide-react";

type Props = {
  user: {
    id: string;
    name: string | null;
    email: string | null;
    streakCount: number | null;
    emailNotifications: boolean;
    createdAt: Date | string | null;
    displayName: string | null;
    discriminator: string | null;
  };
};

export default function ProfileClient({ user }: Props) {
  const router = useRouter();
  const [emailNotifications, setEmailNotifications] = useState(user.emailNotifications);
  const [notifSaving, setNotifSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  // Display name state — track both what's saved (from DB) and what's in the input
  const [savedDisplayName, setSavedDisplayName] = useState(user.displayName ?? "");
  const [savedDiscriminator, setSavedDiscriminator] = useState(user.discriminator ?? "");
  const [displayName, setDisplayName] = useState(user.displayName ?? "");
  const [displayNameSaving, setDisplayNameSaving] = useState(false);
  const [displayNameError, setDisplayNameError] = useState("");
  const [displayNameSuccess, setDisplayNameSuccess] = useState(false);

  // Only show Save when the input differs from what's already stored
  const isDisplayNameDirty = displayName.trim() !== savedDisplayName;

  async function handleNotifToggle() {
    const next = !emailNotifications;
    setEmailNotifications(next); // optimistic
    setNotifSaving(true);
    try {
      const res = await fetch("/api/user/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emailNotifications: next }),
      });
      if (!res.ok) throw new Error("Failed");
    } catch {
      setEmailNotifications(!next); // revert
    } finally {
      setNotifSaving(false);
    }
  }

  async function handleSaveDisplayName() {
    setDisplayNameSaving(true);
    setDisplayNameError("");
    setDisplayNameSuccess(false);
    try {
      const res = await fetch("/api/user/display-name", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: displayName.trim() }),
      });
      const json = await res.json();
      if (!res.ok) {
        setDisplayNameError(json.error ?? "Failed to save");
        return;
      }
      // Update "saved" values so isDirty resets and the tag display refreshes
      setSavedDisplayName(json.displayName);
      setSavedDiscriminator(json.discriminator);
      setDisplayName(json.displayName);
      setDisplayNameSuccess(true);
      setTimeout(() => setDisplayNameSuccess(false), 3000);
    } catch {
      setDisplayNameError("Something went wrong. Please try again.");
    } finally {
      setDisplayNameSaving(false);
    }
  }

  async function handleSignOut() {
    await authClient.signOut();
    router.push("/");
    router.refresh();
  }

  async function handleDeleteAccount() {
    setDeleting(true);
    setDeleteError("");
    try {
      const res = await fetch("/api/user", { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete account");
      // Signed out server-side; redirect home
      router.push("/");
      router.refresh();
    } catch (e: unknown) {
      setDeleteError(e instanceof Error ? e.message : "Something went wrong");
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  const joinedYear = user.createdAt
    ? new Date(user.createdAt).getFullYear()
    : null;

  return (
    <div style={{ maxWidth: "560px", margin: "0 auto", padding: "3rem 1.5rem" }}>

      {/* Page heading */}
      <h1 style={{
        fontFamily: "var(--font-display)", fontSize: "1.75rem",
        fontWeight: 700, color: "var(--primary)", marginBottom: "2rem",
      }}>
        Profile
      </h1>

      {/* User info card */}
      <section
        aria-label="Account information"
        style={{
          background: "var(--card)",
          border: "0.5px solid var(--border)",
          borderRadius: "var(--radius)",
          padding: "1.5rem",
          marginBottom: "1rem",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "1.25rem" }}>
          <div style={{
            width: "48px", height: "48px", borderRadius: "50%",
            background: "color-mix(in srgb, var(--primary) 12%, var(--card))",
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}>
            <User size={22} aria-hidden="true" style={{ color: "var(--primary)" }} />
          </div>
          <div>
            <p style={{ fontFamily: "var(--font-display)", fontSize: "16px", fontWeight: 600, color: "var(--foreground)", margin: 0 }}>
              {user.name ?? "Reader"}
            </p>
            <p style={{ fontSize: "13px", color: "var(--muted-foreground)", margin: "2px 0 0" }}>
              {user.email}
            </p>
          </div>
        </div>

        <div style={{ display: "flex", gap: "1rem" }}>
          <div style={{
            flex: 1, padding: "12px",
            background: "var(--background)",
            border: "0.5px solid var(--border)",
            borderRadius: "var(--radius)",
            textAlign: "center",
          }}>
            <p style={{ fontSize: "22px", fontWeight: 700, color: "var(--primary)", margin: 0, fontFamily: "var(--font-display)" }}>
              {user.streakCount ?? 0}
            </p>
            <p style={{ fontSize: "11px", color: "var(--muted-foreground)", margin: "2px 0 0", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Day streak
            </p>
          </div>
          {joinedYear && (
            <div style={{
              flex: 1, padding: "12px",
              background: "var(--background)",
              border: "0.5px solid var(--border)",
              borderRadius: "var(--radius)",
              textAlign: "center",
            }}>
              <p style={{ fontSize: "22px", fontWeight: 700, color: "var(--primary)", margin: 0, fontFamily: "var(--font-display)" }}>
                {joinedYear}
              </p>
              <p style={{ fontSize: "11px", color: "var(--muted-foreground)", margin: "2px 0 0", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Member since
              </p>
            </div>
          )}
        </div>
      </section>

      {/* Notifications */}
      <section
        aria-label="Notification preferences"
        style={{
          background: "var(--card)",
          border: "0.5px solid var(--border)",
          borderRadius: "var(--radius)",
          padding: "1.5rem",
          marginBottom: "1rem",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "1rem" }}>
          <Bell size={16} aria-hidden="true" style={{ color: "var(--primary)" }} />
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: "15px", fontWeight: 600, color: "var(--foreground)", margin: 0 }}>
            Notifications
          </h2>
        </div>

        <label
          htmlFor="email-notif"
          style={{
            display: "flex", alignItems: "flex-start",
            justifyContent: "space-between", gap: "1rem",
            cursor: notifSaving ? "wait" : "pointer",
          }}
        >
          <div>
            <p style={{ fontSize: "14px", color: "var(--foreground)", margin: "0 0 2px" }}>
              Streak reminder emails
            </p>
            <p style={{ fontSize: "12px", color: "var(--muted-foreground)", margin: 0 }}>
              Get an email when your reading streak enters the 24-hour grace period
            </p>
          </div>
          {/* Custom toggle */}
          <button
            id="email-notif"
            type="button"
            role="switch"
            aria-checked={emailNotifications}
            aria-label="Toggle streak reminder emails"
            disabled={notifSaving}
            onClick={handleNotifToggle}
            style={{
              flexShrink: 0,
              width: "44px", height: "24px",
              borderRadius: "12px",
              border: "none",
              background: emailNotifications ? "var(--primary)" : "var(--muted)",
              position: "relative",
              cursor: notifSaving ? "wait" : "pointer",
              transition: "background 0.2s",
              opacity: notifSaving ? 0.6 : 1,
            }}
          >
            <span style={{
              position: "absolute",
              top: "3px",
              left: emailNotifications ? "23px" : "3px",
              width: "18px", height: "18px",
              borderRadius: "50%",
              background: "#fff",
              transition: "left 0.2s",
              display: "block",
            }} />
          </button>
        </label>
      </section>

      {/* Friends display name */}
      <section
        aria-label="Friends display name"
        style={{
          background: "var(--card)",
          border: "0.5px solid var(--border)",
          borderRadius: "var(--radius)",
          padding: "1.5rem",
          marginBottom: "1rem",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "1rem" }}>
          <Users size={16} aria-hidden="true" style={{ color: "var(--primary)" }} />
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: "15px", fontWeight: 600, color: "var(--foreground)", margin: 0 }}>
            Friends
          </h2>
        </div>

        <p style={{ fontSize: "13px", color: "var(--muted-foreground)", marginBottom: "1rem" }}>
          Set a display name so friends can find you. You will get a unique tag like{" "}
          <span style={{ fontFamily: "var(--font-display)", color: "var(--foreground)" }}>
            Name#1234
          </span>
          {" "}assigned automatically.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <input
              type="text"
              value={displayName}
              onChange={(e) => {
                setDisplayName(e.target.value);
                setDisplayNameError("");
                setDisplayNameSuccess(false);
              }}
              placeholder="Your display name"
              maxLength={32}
              style={{
                flex: 1, padding: "8px 12px", fontSize: "14px",
                border: "0.5px solid var(--border)", borderRadius: "var(--radius)",
                background: "var(--background)", color: "var(--foreground)",
                fontFamily: "inherit", outline: "none",
              }}
            />
            {/* Only render Save when there's something new to save */}
            {isDisplayNameDirty && (
              <button
                type="button"
                onClick={handleSaveDisplayName}
                disabled={displayNameSaving || !displayName.trim()}
                style={{
                  padding: "8px 16px", fontSize: "13px",
                  border: "none", borderRadius: "var(--radius)",
                  background: "var(--primary)", color: "var(--primary-foreground)",
                  cursor: displayNameSaving ? "wait" : "pointer",
                  opacity: displayNameSaving ? 0.6 : 1,
                  fontFamily: "inherit", whiteSpace: "nowrap",
                }}
              >
                {displayNameSaving ? "Saving..." : "Save"}
              </button>
            )}
          </div>

          {/* Discriminator — shown once assigned */}
          {savedDiscriminator && (
            <p style={{ fontSize: "13px", color: "var(--muted-foreground)", margin: 0 }}>
              Your tag:{" "}
              <span style={{ fontFamily: "var(--font-display)", fontWeight: 600, color: "var(--foreground)" }}>
                {savedDisplayName}#{savedDiscriminator}
              </span>
              {" "}— share this with friends so they can add you.
            </p>
          )}

          {displayNameError && (
            <p role="alert" style={{ fontSize: "12px", color: "var(--destructive)", margin: 0 }}>
              {displayNameError}
            </p>
          )}
          {displayNameSuccess && (
            <p role="status" style={{ fontSize: "12px", color: "var(--primary)", margin: 0 }}>
              Display name saved.
            </p>
          )}
        </div>
      </section>

      {/* Sign out */}
      <section
        aria-label="Sign out"
        style={{
          background: "var(--card)",
          border: "0.5px solid var(--border)",
          borderRadius: "var(--radius)",
          padding: "1.5rem",
          marginBottom: "1rem",
        }}
      >
        <button
          type="button"
          onClick={handleSignOut}
          style={{
            display: "flex", alignItems: "center", gap: "8px",
            background: "none", border: "none", cursor: "pointer",
            fontSize: "14px", color: "var(--muted-foreground)",
            fontFamily: "inherit", padding: 0,
          }}
        >
          <LogOut size={15} aria-hidden="true" />
          Sign out
        </button>
      </section>

      {/* Danger zone */}
      <section
        aria-label="Danger zone"
        style={{
          background: "var(--card)",
          border: "0.5px solid var(--destructive)",
          borderRadius: "var(--radius)",
          padding: "1.5rem",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "0.75rem" }}>
          <Trash2 size={16} aria-hidden="true" style={{ color: "var(--destructive)" }} />
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: "15px", fontWeight: 600, color: "var(--foreground)", margin: 0 }}>
            Delete account
          </h2>
        </div>

        <p style={{ fontSize: "13px", color: "var(--muted-foreground)", marginBottom: "1rem" }}>
          Permanently deletes your account, all books, and all journal entries. This cannot be undone.
        </p>

        {!confirmDelete ? (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            style={{
              padding: "8px 16px", fontSize: "13px",
              border: "0.5px solid var(--destructive)",
              borderRadius: "var(--radius)",
              background: "transparent",
              color: "var(--destructive)",
              cursor: "pointer", fontFamily: "inherit",
            }}
          >
            Delete my account
          </button>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <p style={{ fontSize: "13px", fontWeight: 600, color: "var(--destructive)", margin: 0 }}>
              Are you absolutely sure? All your data will be gone forever.
            </p>
            {deleteError && (
              <p role="alert" style={{ fontSize: "12px", color: "var(--destructive)", margin: 0 }}>
                {deleteError}
              </p>
            )}
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                style={{
                  padding: "8px 16px", fontSize: "13px",
                  border: "0.5px solid var(--border)",
                  borderRadius: "var(--radius)",
                  background: "var(--muted)", color: "var(--muted-foreground)",
                  cursor: "pointer", fontFamily: "inherit",
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteAccount}
                disabled={deleting}
                aria-disabled={deleting}
                style={{
                  padding: "8px 16px", fontSize: "13px",
                  border: "none", borderRadius: "var(--radius)",
                  background: "var(--destructive)", color: "#fff",
                  cursor: deleting ? "not-allowed" : "pointer",
                  opacity: deleting ? 0.6 : 1,
                  fontFamily: "inherit",
                }}
              >
                {deleting ? "Deleting..." : "Yes, delete everything"}
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
