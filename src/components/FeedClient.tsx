"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, Newspaper, Users, RefreshCw, ExternalLink, Eye, EyeOff, UserPlus, X, Search, Check } from "lucide-react";

type FriendEntry = {
  id: string;
  content: string | null;
  chapterStart: number;
  chapterEnd: number;
  scope: string;
  createdAt: string;
  isPublic: boolean;
  authorId: string;
  authorName: string | null;
  bookId: string;
  bookTitle: string;
  bookCoverUrl: string | null;
  spoilered: boolean;
  spoilerTags: string[];
};

type AuthorPost = {
  id: string;
  title: string;
  url: string;
  description: string | null;
  publishedAt: string;
  authorId: string;
  authorName: string;
};

type PendingRequest = {
  id: string;
  createdAt: string;
  sender: {
    id: string;
    name: string | null;
    displayName: string | null;
    discriminator: string | null;
    image: string | null;
  };
};

type SearchedUser = {
  id: string;
  name: string | null;
  displayName: string | null;
  discriminator: string | null;
  image: string | null;
};

type FeedData = {
  friends: FriendEntry[];
  authorNews: AuthorPost[];
  authorNewsPages: number;
  friendsCount: number;
  followedAuthorsCount: number;
};

type Tab = "friends" | "news";

// -- Helpers --

function formatDate(date: string): string {
  const d = new Date(date);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffHrs = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHrs / 24);

  if (diffHrs < 1) return "just now";
  if (diffHrs < 24) return `${diffHrs}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatChapterLabel(entry: FriendEntry): string {
  if (entry.scope === "WHOLE_BOOK" || entry.chapterEnd === 9999) return "Whole book";
  if (entry.chapterStart === entry.chapterEnd) return `Ch. ${entry.chapterStart}`;
  return `Ch. ${entry.chapterStart}-${entry.chapterEnd}`;
}

// -- Full entry modal --

function EntryModal({ entry, onClose }: { entry: FriendEntry; onClose: () => void }) {
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Journal entry for ${entry.bookTitle}`}
      style={{
        position: "fixed", inset: 0, zIndex: 200,
        background: "rgba(0,0,0,0.5)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "1.5rem",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: "var(--card)",
        border: "0.5px solid var(--border)",
        borderRadius: "var(--radius)",
        maxWidth: "580px", width: "100%",
        height: "75vh",
        display: "flex", flexDirection: "column",
        boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
        overflow: "hidden",
      }}>
        {/* Book context bar — mirrors the journal page header */}
        <div style={{
          padding: "0.75rem 1.25rem",
          borderBottom: "0.5px solid var(--border)",
          display: "flex", alignItems: "center", gap: "0.75rem",
          flexShrink: 0,
        }}>
          {entry.bookCoverUrl && (
            <img
              src={entry.bookCoverUrl} alt=""
              style={{ width: "28px", height: "40px", objectFit: "cover", borderRadius: "2px", flexShrink: 0 }}
            />
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontFamily: "var(--font-display)", fontSize: "14px", fontWeight: 600, color: "var(--foreground)", margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {entry.bookTitle}
            </p>
            <p style={{ fontSize: "11px", color: "var(--muted-foreground)", margin: 0 }}>
              {entry.authorName ?? "Reader"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "28px", height: "28px", border: "0.5px solid var(--border)", borderRadius: "var(--radius)", background: "var(--muted)", color: "var(--muted-foreground)", cursor: "pointer", flexShrink: 0 }}
          >
            <X size={12} aria-hidden="true" />
          </button>
        </div>

        {/* Section label + primary divider — mirrors the right panel heading row */}
        <div style={{ padding: "1rem 1.25rem 0.75rem", flexShrink: 0 }}>
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: "1rem", fontWeight: 600, color: "var(--primary)", margin: 0 }}>
            Entry
          </h2>
        </div>
        <div style={{ height: "1px", background: "var(--primary)", opacity: 0.4, flexShrink: 0 }} />

        {/* Chapter + date row — fixed, not scrollable */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "0.75rem 1.25rem 0", flexShrink: 0 }}>
          <span style={{ fontSize: "11px", fontWeight: 500, color: "var(--primary)", background: "color-mix(in srgb, var(--primary) 12%, transparent)", borderRadius: "4px", padding: "2px 6px" }}>
            {formatChapterLabel(entry)}
          </span>
          <span style={{ fontSize: "10px", color: "var(--muted-foreground)" }}>
            {formatDate(entry.createdAt)}
          </span>
        </div>

        {/* Scrollable content — mirrors renderEntryDetail exactly */}
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden", padding: "1rem 1.25rem", fontSize: "14px", lineHeight: 1.8, color: "var(--foreground)", fontFamily: "var(--font-serif)", whiteSpace: "pre-wrap", overflowWrap: "break-word", wordBreak: "break-word" }}>
          {entry.content}
        </div>
      </div>
    </div>
  );
}

// -- Friend entry card --

function FriendEntryCard({
  entry,
  onBookClick,
}: {
  entry: FriendEntry;
  onBookClick: (bookId: string) => void;
}) {
  const [revealed, setRevealed] = useState<false | "tags" | "full">(false);
  const [showFullEntry, setShowFullEntry] = useState(false);

  return (
    <article style={{
      background: "var(--card)",
      border: "0.5px solid var(--border)",
      borderRadius: "var(--radius)",
      padding: "1rem",
      display: "flex",
      flexDirection: "column",
      gap: "0.75rem",
    }}>
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "0.75rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", minWidth: 0 }}>
          <div style={{
            width: "30px", height: "30px", borderRadius: "50%", flexShrink: 0,
            background: "color-mix(in srgb, var(--primary) 15%, var(--card))",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: "12px", fontWeight: 700, color: "var(--primary)",
          }}>
            {(entry.authorName ?? "?")[0].toUpperCase()}
          </div>
          <div style={{ minWidth: 0 }}>
            <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--foreground)" }}>
              {entry.authorName ?? "Reader"}
            </span>
            <span style={{ fontSize: "12px", color: "var(--muted-foreground)", marginLeft: "6px" }}>
              wrote about
            </span>
            <button
              type="button"
              onClick={() => onBookClick(entry.bookId)}
              style={{
                background: "none", border: "none", cursor: "pointer", padding: 0,
                fontSize: "12px", fontWeight: 600, color: "var(--primary)",
                marginLeft: "6px", fontFamily: "var(--font-display)",
                textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap",
              }}
            >
              {entry.bookTitle}
            </button>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "6px", flexShrink: 0 }}>
          <span style={{
            fontSize: "10px", fontWeight: 500, letterSpacing: "0.06em",
            color: "var(--primary)",
            background: "color-mix(in srgb, var(--primary) 12%, transparent)",
            borderRadius: "4px", padding: "2px 6px",
          }}>
            {formatChapterLabel(entry)}
          </span>
          <span style={{ fontSize: "10px", color: "var(--muted-foreground)" }}>
            {formatDate(entry.createdAt)}
          </span>
        </div>
      </div>

      {/* Book cover + content row */}
      <div style={{ display: "flex", gap: "0.75rem" }}>
        {entry.bookCoverUrl && (
          <img
            src={entry.bookCoverUrl}
            alt=""
            style={{ width: "36px", height: "52px", objectFit: "cover", borderRadius: "3px", flexShrink: 0 }}
          />
        )}

        <div style={{ flex: 1, minWidth: 0 }}>
          {entry.spoilered && revealed === false && (
            <div style={{
              background: "var(--muted)", borderRadius: "var(--radius)",
              padding: "0.75rem", display: "flex", flexDirection: "column", gap: "10px",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <EyeOff size={13} aria-hidden="true" style={{ color: "var(--muted-foreground)" }} />
                <span style={{ fontSize: "12px", color: "var(--muted-foreground)", fontStyle: "italic" }}>
                  Possible spoiler -- you have not reached {formatChapterLabel(entry)} yet
                </span>
              </div>
              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                {entry.spoilerTags.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setRevealed("tags")}
                    style={{
                      padding: "4px 10px", fontSize: "11px",
                      border: "0.5px solid var(--border)", borderRadius: "var(--radius)",
                      background: "var(--card)", color: "var(--foreground)",
                      cursor: "pointer", fontFamily: "inherit",
                      display: "flex", alignItems: "center", gap: "4px",
                    }}
                  >
                    <Eye size={11} aria-hidden="true" /> Peek at themes
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setRevealed("full")}
                  style={{
                    padding: "4px 10px", fontSize: "11px",
                    border: "none", borderRadius: "var(--radius)",
                    background: "var(--primary)", color: "var(--primary-foreground)",
                    cursor: "pointer", fontFamily: "inherit",
                    display: "flex", alignItems: "center", gap: "4px",
                  }}
                >
                  Read entry
                </button>
              </div>
            </div>
          )}

          {entry.spoilered && revealed === "tags" && (
            <div style={{
              background: "var(--muted)", borderRadius: "var(--radius)",
              padding: "0.75rem", display: "flex", flexDirection: "column", gap: "10px",
            }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                {entry.spoilerTags.map((tag) => (
                  <span key={tag} style={{
                    fontSize: "11px", padding: "3px 8px",
                    background: "color-mix(in srgb, var(--primary) 12%, transparent)",
                    color: "var(--primary)", borderRadius: "4px",
                    fontStyle: "italic",
                  }}>
                    {tag}
                  </span>
                ))}
              </div>
              <div style={{ display: "flex", gap: "6px" }}>
                <button
                  type="button"
                  onClick={() => setRevealed("full")}
                  style={{
                    padding: "4px 10px", fontSize: "11px",
                    border: "none", borderRadius: "var(--radius)",
                    background: "var(--primary)", color: "var(--primary-foreground)",
                    cursor: "pointer", fontFamily: "inherit",
                  }}
                >
                  Read entry
                </button>
                <button
                  type="button"
                  onClick={() => setRevealed(false)}
                  style={{
                    padding: "4px 10px", fontSize: "11px",
                    border: "0.5px solid var(--border)", borderRadius: "var(--radius)",
                    background: "transparent", color: "var(--muted-foreground)",
                    cursor: "pointer", fontFamily: "inherit",
                  }}
                >
                  Hide
                </button>
              </div>
            </div>
          )}

          {(!entry.spoilered || revealed === "full") && (
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <p style={{
                fontSize: "13px", color: "var(--foreground)",
                lineHeight: 1.65, margin: 0,
                display: "-webkit-box",
                WebkitLineClamp: 4,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
                fontFamily: "var(--font-serif)",
                wordBreak: "break-word",
                overflowWrap: "break-word",
              }}>
                {entry.content}
              </p>
              {(entry.content?.length ?? 0) > 150 && (
                <button
                  type="button"
                  onClick={() => setShowFullEntry(true)}
                  style={{
                    background: "none", border: "none", cursor: "pointer", padding: 0,
                    fontSize: "11px", color: "var(--primary)", textDecoration: "underline",
                    textAlign: "left", fontFamily: "inherit", alignSelf: "flex-start",
                  }}
                >
                  Read more
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {showFullEntry && (
        <EntryModal entry={entry} onClose={() => setShowFullEntry(false)} />
      )}
    </article>
  );
}

// -- Author news card --

function AuthorNewsCard({ post }: { post: AuthorPost }) {
  return (
    <article style={{
      background: "var(--card)",
      border: "0.5px solid var(--border)",
      borderRadius: "var(--radius)",
      padding: "1rem",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.75rem", marginBottom: "6px" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{
            fontSize: "10px", fontWeight: 600, letterSpacing: "0.08em",
            textTransform: "uppercase", color: "var(--accent)",
            margin: "0 0 4px",
          }}>
            {post.authorName}
          </p>
          <a
            href={post.url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontSize: "14px", fontWeight: 600,
              color: "var(--foreground)", textDecoration: "none",
              fontFamily: "var(--font-display)", lineHeight: 1.3,
              display: "block",
            }}
          >
            {post.title}
          </a>
        </div>
        <a
          href={post.url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Open article: ${post.title}`}
          style={{
            color: "var(--muted-foreground)", flexShrink: 0,
            display: "flex", alignItems: "center",
          }}
        >
          <ExternalLink size={14} aria-hidden="true" />
        </a>
      </div>

      {post.description && (
        <p style={{
          fontSize: "12px", color: "var(--muted-foreground)",
          lineHeight: 1.6, margin: "0 0 8px",
          display: "-webkit-box",
          WebkitLineClamp: 3,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }}>
          {post.description}
        </p>
      )}

      <p style={{ fontSize: "10px", color: "var(--muted-foreground)", margin: 0 }}>
        {formatDate(post.publishedAt)}
      </p>
    </article>
  );
}

// -- Empty states --

function EmptyFriends() {
  return (
    <div style={{ textAlign: "center", padding: "4rem 2rem" }}>
      <Users size={40} aria-hidden="true" style={{ color: "var(--muted-foreground)", margin: "0 auto 1rem", display: "block" }} />
      <p style={{ fontFamily: "var(--font-display)", fontSize: "15px", fontWeight: 600, color: "var(--foreground)", marginBottom: "6px" }}>
        No friends yet
      </p>
      <p style={{ fontSize: "13px", color: "var(--muted-foreground)", margin: 0 }}>
        When you follow other readers, their public journal entries will appear here -- spoiler-filtered to your progress.
      </p>
    </div>
  );
}

function EmptyNews() {
  return (
    <div style={{ textAlign: "center", padding: "4rem 2rem" }}>
      <Newspaper size={40} aria-hidden="true" style={{ color: "var(--muted-foreground)", margin: "0 auto 1rem", display: "block" }} />
      <p style={{ fontFamily: "var(--font-display)", fontSize: "15px", fontWeight: 600, color: "var(--foreground)", marginBottom: "6px" }}>
        No author news
      </p>
      <p style={{ fontSize: "13px", color: "var(--muted-foreground)", margin: 0 }}>
        Follow authors to see their latest news and book releases here. Updates are pulled from their Goodreads feeds.
      </p>
    </div>
  );
}

// -- Main --

export default function FeedClient() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("friends");
  const [data, setData] = useState<FeedData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(0);

  // Pending friend requests — fetched separately so they can refresh independently
  const [pendingRequests, setPendingRequests] = useState<PendingRequest[]>([]);
  const [requestActionId, setRequestActionId] = useState<string | null>(null);

  // Add Friend modal state
  const [showModal, setShowModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResult, setSearchResult] = useState<SearchedUser | null | "not-found">(null);
  const [searching, setSearching] = useState(false);
  const [sendStatus, setSendStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [sendError, setSendError] = useState("");

  const fetchFeed = useCallback(async (p = 0) => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/feed?page=${p}`);
      if (!res.ok) throw new Error("Failed to load feed");
      const json: FeedData = await res.json();
      setData(json);
      setPage(p);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchPendingRequests = useCallback(async () => {
    try {
      const res = await fetch("/api/friends/requests");
      if (!res.ok) return;
      const json = await res.json();
      setPendingRequests(json.requests ?? []);
    } catch {
      // Non-critical — silently ignore
    }
  }, []);

  useEffect(() => {
    fetchFeed(0);
    fetchPendingRequests();
  }, [fetchFeed, fetchPendingRequests]);

  async function handleRequestAction(requestId: string, action: "accept" | "decline") {
    setRequestActionId(requestId);
    try {
      const res = await fetch(`/api/friends/request/${requestId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) return;
      // Remove from pending list immediately (optimistic)
      setPendingRequests((prev) => prev.filter((r) => r.id !== requestId));
      // If accepted, re-fetch feed so their entries now appear
      if (action === "accept") fetchFeed(0);
    } finally {
      setRequestActionId(null);
    }
  }

  async function handleSearch() {
    setSearchResult(null);
    setSendStatus("idle");
    setSendError("");
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const res = await fetch(`/api/users/search?q=${encodeURIComponent(searchQuery.trim())}`);
      if (!res.ok) { setSearchResult("not-found"); return; }
      const json = await res.json();
      setSearchResult(json.user ?? "not-found");
    } catch {
      setSearchResult("not-found");
    } finally {
      setSearching(false);
    }
  }

  async function handleSendRequest(receiverId: string) {
    setSendStatus("sending");
    setSendError("");
    try {
      const res = await fetch("/api/friends/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ receiverId }),
      });
      const json = await res.json();
      if (!res.ok) { setSendStatus("error"); setSendError(json.error ?? "Failed"); return; }
      setSendStatus("sent");
    } catch {
      setSendStatus("error");
      setSendError("Something went wrong. Please try again.");
    }
  }

  function closeModal() {
    setShowModal(false);
    setSearchQuery("");
    setSearchResult(null);
    setSendStatus("idle");
    setSendError("");
  }

  return (
    <div style={{ maxWidth: "680px", margin: "0 auto", padding: "2rem 1.5rem" }}>

      {/* Page heading */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem" }}>
        <h1 style={{
          fontFamily: "var(--font-display)", fontSize: "1.75rem",
          fontWeight: 700, color: "var(--primary)", margin: 0,
        }}>
          Feed
        </h1>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <button
            type="button"
            onClick={() => setShowModal(true)}
            style={{
              display: "flex", alignItems: "center", gap: "6px",
              padding: "6px 12px", fontSize: "13px",
              border: "0.5px solid var(--border)", borderRadius: "var(--radius)",
              background: "var(--card)", color: "var(--foreground)",
              cursor: "pointer", fontFamily: "inherit",
            }}
          >
            <UserPlus size={13} aria-hidden="true" />
            Add Friend
          </button>
          <button
            type="button"
            aria-label="Refresh feed"
            onClick={() => fetchFeed(page)}
            disabled={loading}
            style={{
              background: "none", border: "0.5px solid var(--border)",
              borderRadius: "var(--radius)", padding: "6px 8px",
              cursor: loading ? "not-allowed" : "pointer",
              color: "var(--muted-foreground)",
              display: "flex", alignItems: "center",
              opacity: loading ? 0.5 : 1,
              transition: "opacity 0.15s",
            }}
          >
            <RefreshCw
              size={14}
              aria-hidden="true"
              style={{ animation: loading ? "spin 1s linear infinite" : "none" }}
            />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div
        role="tablist"
        aria-label="Feed sections"
        style={{
          display: "flex", gap: "4px",
          background: "var(--muted)", borderRadius: "var(--radius)",
          padding: "3px", marginBottom: "1.5rem",
        }}
      >
        {([
          { id: "friends" as Tab, label: "Friends", icon: Users },
          { id: "news" as Tab, label: "Author News", icon: Newspaper },
        ] as const).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            style={{
              flex: 1, padding: "8px 12px",
              border: "none", borderRadius: "calc(var(--radius) - 2px)",
              background: tab === id ? "var(--card)" : "transparent",
              color: tab === id ? "var(--primary)" : "var(--muted-foreground)",
              fontWeight: tab === id ? 600 : 400,
              cursor: "pointer", fontSize: "13px",
              fontFamily: "inherit",
              display: "flex", alignItems: "center", justifyContent: "center", gap: "6px",
              transition: "background 0.15s, color 0.15s",
              boxShadow: tab === id ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
            }}
          >
            <Icon size={13} aria-hidden="true" />
            {label}
            {id === "friends" && data && data.friendsCount > 0 && (
              <span style={{
                fontSize: "10px", background: "color-mix(in srgb, var(--primary) 15%, transparent)",
                color: "var(--primary)", borderRadius: "10px", padding: "1px 6px",
              }}>
                {data.friendsCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <p role="alert" style={{ fontSize: "13px", color: "var(--destructive)", marginBottom: "1rem" }}>
          {error}
        </p>
      )}

      {/* Loading skeleton */}
      {loading && !data && (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {[1, 2, 3].map((i) => (
            <div key={i} style={{
              height: "120px",
              background: "var(--muted)",
              borderRadius: "var(--radius)",
              opacity: 0.5,
              animation: "pulse 1.5s ease-in-out infinite",
            }} />
          ))}
        </div>
      )}

      {/* Pending friend requests panel — shown on friends tab whenever there are pending requests */}
      {tab === "friends" && pendingRequests.length > 0 && (
        <div style={{
          background: "color-mix(in srgb, var(--primary) 6%, var(--card))",
          border: "0.5px solid color-mix(in srgb, var(--primary) 25%, var(--border))",
          borderRadius: "var(--radius)",
          padding: "1rem",
          marginBottom: "1rem",
          display: "flex",
          flexDirection: "column",
          gap: "0.75rem",
        }}>
          <p style={{ fontSize: "12px", fontWeight: 600, color: "var(--primary)", margin: 0, textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Friend requests ({pendingRequests.length})
          </p>
          {pendingRequests.map((req) => (
            <div key={req.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.75rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0 }}>
                <div style={{
                  width: "28px", height: "28px", borderRadius: "50%", flexShrink: 0,
                  background: "color-mix(in srgb, var(--primary) 15%, var(--card))",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: "11px", fontWeight: 700, color: "var(--primary)",
                }}>
                  {(req.sender.name ?? "?")[0].toUpperCase()}
                </div>
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontSize: "13px", fontWeight: 600, color: "var(--foreground)", margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {req.sender.name ?? "Reader"}
                  </p>
                  {req.sender.displayName && req.sender.discriminator && (
                    <p style={{ fontSize: "11px", color: "var(--muted-foreground)", margin: 0, fontFamily: "var(--font-display)" }}>
                      {req.sender.displayName}#{req.sender.discriminator}
                    </p>
                  )}
                </div>
              </div>
              <div style={{ display: "flex", gap: "6px", flexShrink: 0 }}>
                <button
                  type="button"
                  disabled={requestActionId === req.id}
                  onClick={() => handleRequestAction(req.id, "accept")}
                  aria-label={`Accept request from ${req.sender.name}`}
                  style={{
                    padding: "5px 10px", fontSize: "12px",
                    border: "none", borderRadius: "var(--radius)",
                    background: "var(--primary)", color: "var(--primary-foreground)",
                    cursor: requestActionId === req.id ? "wait" : "pointer",
                    opacity: requestActionId === req.id ? 0.6 : 1,
                    fontFamily: "inherit", display: "flex", alignItems: "center", gap: "4px",
                  }}
                >
                  <Check size={11} aria-hidden="true" /> Accept
                </button>
                <button
                  type="button"
                  disabled={requestActionId === req.id}
                  onClick={() => handleRequestAction(req.id, "decline")}
                  aria-label={`Decline request from ${req.sender.name}`}
                  style={{
                    padding: "5px 10px", fontSize: "12px",
                    border: "0.5px solid var(--border)", borderRadius: "var(--radius)",
                    background: "transparent", color: "var(--muted-foreground)",
                    cursor: requestActionId === req.id ? "wait" : "pointer",
                    opacity: requestActionId === req.id ? 0.6 : 1,
                    fontFamily: "inherit",
                  }}
                >
                  Decline
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Friends tab */}
      {!loading && data && tab === "friends" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {data.friends.length === 0 ? (
            <EmptyFriends />
          ) : (
            data.friends.map((entry) => (
              <FriendEntryCard
                key={entry.id}
                entry={entry}
                onBookClick={(bookId) => router.push(`/journal/${bookId}`)}
              />
            ))
          )}
        </div>
      )}

      {/* Author news tab */}
      {!loading && data && tab === "news" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {data.authorNews.length === 0 ? (
            <EmptyNews />
          ) : (
            <>
              {data.authorNews.map((post) => (
                <AuthorNewsCard key={post.id} post={post} />
              ))}

              {/* Pagination */}
              {data.authorNewsPages > 1 && (
                <div style={{ display: "flex", justifyContent: "center", gap: "8px", marginTop: "1rem" }}>
                  <button type="button" disabled={page === 0}
                    onClick={() => fetchFeed(page - 1)}
                    style={{
                      padding: "6px 14px", fontSize: "12px",
                      border: "0.5px solid var(--border)", borderRadius: "var(--radius)",
                      background: "var(--muted)", color: "var(--muted-foreground)",
                      cursor: page === 0 ? "not-allowed" : "pointer",
                      opacity: page === 0 ? 0.4 : 1, fontFamily: "inherit",
                    }}>
                    Prev
                  </button>
                  <span style={{ fontSize: "12px", color: "var(--muted-foreground)", alignSelf: "center" }}>
                    {page + 1} / {data.authorNewsPages}
                  </span>
                  <button type="button" disabled={page >= data.authorNewsPages - 1}
                    onClick={() => fetchFeed(page + 1)}
                    style={{
                      padding: "6px 14px", fontSize: "12px",
                      border: "0.5px solid var(--border)", borderRadius: "var(--radius)",
                      background: "var(--muted)", color: "var(--muted-foreground)",
                      cursor: page >= data.authorNewsPages - 1 ? "not-allowed" : "pointer",
                      opacity: page >= data.authorNewsPages - 1 ? 0.4 : 1, fontFamily: "inherit",
                    }}>
                    Next
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Add Friend modal */}
      {showModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Add a friend"
          style={{
            position: "fixed", inset: 0, zIndex: 100,
            display: "flex", alignItems: "center", justifyContent: "center",
            background: "rgba(0,0,0,0.4)",
            padding: "1rem",
          }}
          onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}
        >
          <div style={{
            background: "var(--card)",
            border: "0.5px solid var(--border)",
            borderRadius: "var(--radius)",
            padding: "1.5rem",
            width: "100%", maxWidth: "420px",
            display: "flex", flexDirection: "column", gap: "1rem",
            boxShadow: "0 8px 32px rgba(0,0,0,0.16)",
          }}>
            {/* Modal header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <h2 style={{ fontFamily: "var(--font-display)", fontSize: "16px", fontWeight: 700, color: "var(--foreground)", margin: 0 }}>
                Add a Friend
              </h2>
              <button
                type="button"
                onClick={closeModal}
                aria-label="Close"
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted-foreground)", display: "flex", padding: "4px" }}
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>

            <p style={{ fontSize: "13px", color: "var(--muted-foreground)", margin: 0 }}>
              Search by their display name and tag, e.g.{" "}
              <span style={{ fontFamily: "var(--font-display)", color: "var(--foreground)" }}>Alex#4821</span>
            </p>

            {/* Search input */}
            <div style={{ display: "flex", gap: "8px" }}>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setSearchResult(null);
                  setSendStatus("idle");
                  setSendError("");
                }}
                onKeyDown={(e) => { if (e.key === "Enter") handleSearch(); }}
                placeholder="Name#1234"
                style={{
                  flex: 1, padding: "8px 12px", fontSize: "14px",
                  border: "0.5px solid var(--border)", borderRadius: "var(--radius)",
                  background: "var(--background)", color: "var(--foreground)",
                  fontFamily: "var(--font-display)", outline: "none",
                }}
              />
              <button
                type="button"
                onClick={handleSearch}
                disabled={searching || !searchQuery.trim()}
                style={{
                  padding: "8px 12px", fontSize: "13px",
                  border: "none", borderRadius: "var(--radius)",
                  background: "var(--primary)", color: "var(--primary-foreground)",
                  cursor: searching ? "wait" : "pointer",
                  opacity: searching || !searchQuery.trim() ? 0.6 : 1,
                  display: "flex", alignItems: "center", gap: "4px",
                  fontFamily: "inherit",
                }}
              >
                <Search size={13} aria-hidden="true" />
                {searching ? "..." : "Search"}
              </button>
            </div>

            {/* Search result */}
            {searchResult === "not-found" && (
              <p style={{ fontSize: "13px", color: "var(--muted-foreground)", margin: 0 }}>
                No user found with that tag.
              </p>
            )}

            {searchResult && searchResult !== "not-found" && (
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
                    {(searchResult.name ?? "?")[0].toUpperCase()}
                  </div>
                  <div>
                    <p style={{ fontSize: "14px", fontWeight: 600, color: "var(--foreground)", margin: 0 }}>
                      {searchResult.name ?? "Reader"}
                    </p>
                    {searchResult.displayName && searchResult.discriminator && (
                      <p style={{ fontSize: "11px", color: "var(--muted-foreground)", margin: 0, fontFamily: "var(--font-display)" }}>
                        {searchResult.displayName}#{searchResult.discriminator}
                      </p>
                    )}
                  </div>
                </div>

                {sendStatus === "sent" ? (
                  <span style={{ fontSize: "12px", color: "var(--primary)", display: "flex", alignItems: "center", gap: "4px" }}>
                    <Check size={13} aria-hidden="true" /> Sent
                  </span>
                ) : (
                  <button
                    type="button"
                    disabled={sendStatus === "sending"}
                    onClick={() => handleSendRequest(searchResult.id)}
                    style={{
                      padding: "6px 14px", fontSize: "13px",
                      border: "none", borderRadius: "var(--radius)",
                      background: "var(--primary)", color: "var(--primary-foreground)",
                      cursor: sendStatus === "sending" ? "wait" : "pointer",
                      opacity: sendStatus === "sending" ? 0.6 : 1,
                      fontFamily: "inherit", whiteSpace: "nowrap",
                    }}
                  >
                    {sendStatus === "sending" ? "Sending..." : "Send Request"}
                  </button>
                )}
              </div>
            )}

            {sendStatus === "error" && (
              <p role="alert" style={{ fontSize: "12px", color: "var(--destructive)", margin: 0 }}>
                {sendError}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Keyframe for loading spinner and skeleton */}
      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes pulse { 0%, 100% { opacity: 0.5; } 50% { opacity: 0.8; } }
      `}</style>
    </div>
  );
}
