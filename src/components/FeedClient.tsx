"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { BookOpen, Newspaper, Users, RefreshCw, ExternalLink, Eye, EyeOff, UserPlus, X, Search, Check } from "lucide-react";
import { BookInfoModal } from "@/components/BookInfoModal";
import { useFriendRequests } from "@/components/friends/FriendRequestsProvider";

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
  type: "UpcomingRelease" | "News" | "Adaptation" | "Event";
  source: "GoogleBooks" | "GNews";
  publishedAt: string | null;
  createdAt: string;
  isbn: string | null;
  coverImageUrl: string | null;
  releaseDate: string | null;
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
  nextFriendsCursor: string | null;
  nextGatorCursor: string | null;
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

function EntryModal({ entry, onClose, onBookClick }: { entry: FriendEntry; onClose: () => void; onBookClick: (bookId: string) => void }) {
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
            <button
              type="button"
              onClick={() => onBookClick(entry.bookId)}
              aria-label={`View details for ${entry.bookTitle}`}
              style={{ padding: 0, border: "none", background: "none", cursor: "pointer", flexShrink: 0 }}
            >
              <Image
                src={entry.bookCoverUrl} alt=""
                width={28} height={40}
                style={{ objectFit: "cover", borderRadius: "2px", display: "block" }}
              />
            </button>
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
          <button
            type="button"
            onClick={() => onBookClick(entry.bookId)}
            aria-label={`View details for ${entry.bookTitle}`}
            style={{ padding: 0, border: "none", background: "none", cursor: "pointer", flexShrink: 0 }}
          >
            <Image
              src={entry.bookCoverUrl}
              alt=""
              width={36} height={52}
              style={{ objectFit: "cover", borderRadius: "3px", display: "block" }}
            />
          </button>
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
                    <Eye size={11} aria-hidden="true" /> Show spoiler tags
                  </button>
                )}
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
        <EntryModal entry={entry} onClose={() => setShowFullEntry(false)} onBookClick={onBookClick} />
      )}
    </article>
  );
}

// -- Author news card --

const POST_TYPE_LABEL: Record<string, string> = {
  UpcomingRelease: "Upcoming Release",
  News: "News",
  Adaptation: "Adaptation",
  Event: "Event",
};

function AuthorNewsCard({ post }: { post: AuthorPost }) {
  return (
    <article style={{
      background: "var(--card)",
      border: "0.5px solid var(--border)",
      borderRadius: "var(--radius)",
      padding: "1rem",
      display: "flex",
      gap: "0.75rem",
    }}>
      {post.coverImageUrl && (
        <a
          href={post.url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={post.title}
          style={{ flexShrink: 0 }}
        >
          <Image
            src={post.coverImageUrl}
            alt=""
            width={40}
            height={58}
            style={{ objectFit: "cover", borderRadius: "3px", display: "block" }}
          />
        </a>
      )}

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.75rem", marginBottom: "6px" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{
              fontSize: "10px", fontWeight: 600, letterSpacing: "0.08em",
              textTransform: "uppercase", color: "var(--accent)",
              margin: "0 0 4px",
            }}>
              {POST_TYPE_LABEL[post.type] ?? post.type}
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

        {post.publishedAt && (
          <p style={{ fontSize: "10px", color: "var(--muted-foreground)", margin: 0 }}>
            {formatDate(post.publishedAt)}
          </p>
        )}
      </div>
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
  const [friends, setFriends] = useState<FriendEntry[]>([]);
  const [authorNews, setAuthorNews] = useState<AuthorPost[]>([]);
  const [nextFriendsCursor, setNextFriendsCursor] = useState<string | null>(null);
  const [nextGatorCursor, setNextGatorCursor] = useState<string | null>(null);
  const [friendsCount, setFriendsCount] = useState(0);
  const [followedAuthorsCount, setFollowedAuthorsCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");

  const {
    requests: pendingRequests,
    invalidateFriendRequests,
    removeFriendRequest,
  } = useFriendRequests();
  const [requestActionId, setRequestActionId] = useState<string | null>(null);

  // Book info modal state
  const [bookModalId, setBookModalId] = useState<string | null>(null);

  // Add Friend modal state
  const [showModal, setShowModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchedUser[]>([]);
  const [searchError, setSearchError] = useState("");
  const [searching, setSearching] = useState(false);
  const [sendStatus, setSendStatus] = useState<Record<string, "idle" | "sending" | "sent" | "error">>({});
  const [sendError, setSendError] = useState<Record<string, string>>({});

  const friendsSentinelRef = useRef<HTMLDivElement | null>(null);
  const newsSentinelRef = useRef<HTMLDivElement | null>(null);

  const fetchFeed = useCallback(async (opts: {
    friendsCursor?: string;
    gatorCursor?: string;
    append?: boolean;
  } = {}) => {
    const { friendsCursor, gatorCursor, append = false } = opts;
    if (append) setLoadingMore(true);
    else setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (friendsCursor) params.set("friendsCursor", friendsCursor);
      if (gatorCursor) params.set("gatorCursor", gatorCursor);
      const res = await fetch(`/api/feed?${params}`);
      if (!res.ok) throw new Error("Failed to load feed");
      const json: FeedData = await res.json();
      if (append && friendsCursor) {
        setFriends((prev) => [...prev, ...json.friends]);
      } else if (append && gatorCursor) {
        setAuthorNews((prev) => [...prev, ...json.authorNews]);
      } else {
        setFriends(json.friends);
        setAuthorNews(json.authorNews);
        setFriendsCount(json.friendsCount);
        setFollowedAuthorsCount(json.followedAuthorsCount);
      }
      setNextFriendsCursor(json.nextFriendsCursor);
      setNextGatorCursor(json.nextGatorCursor);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    if (!nextFriendsCursor || loadingMore) return;
    const el = friendsSentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) fetchFeed({ friendsCursor: nextFriendsCursor, append: true }); },
      { threshold: 0.1 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [nextFriendsCursor, loadingMore, fetchFeed]);

  useEffect(() => {
    if (!nextGatorCursor || loadingMore) return;
    const el = newsSentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) fetchFeed({ gatorCursor: nextGatorCursor, append: true }); },
      { threshold: 0.1 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [nextGatorCursor, loadingMore, fetchFeed]);

  useEffect(() => {
    fetchFeed({});
  }, [fetchFeed]);

  async function handleRequestAction(requestId: string, action: "accept" | "decline") {
    setRequestActionId(requestId);
    try {
      const res = await fetch(`/api/friends/request/${requestId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) return;
      removeFriendRequest(requestId);
      void invalidateFriendRequests();
      // If accepted, re-fetch feed so their entries now appear
      if (action === "accept") { setFriends([]); setAuthorNews([]); fetchFeed({}); }
    } finally {
      setRequestActionId(null);
    }
  }

  async function handleSearch() {
    setSearchResults([]);
    setSearchError("");
    setSendStatus({});
    setSendError({});
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const res = await fetch(`/api/users/search?q=${encodeURIComponent(searchQuery.trim())}`);
      const json = await res.json();
      if (!res.ok) { setSearchError(json.error ?? "No users found"); return; }
      setSearchResults(json.users ?? []);
      if ((json.users ?? []).length === 0) setSearchError("No users found with that name or tag.");
    } catch {
      setSearchError("Something went wrong. Please try again.");
    } finally {
      setSearching(false);
    }
  }

  async function handleSendRequest(receiverId: string) {
    setSendStatus((prev) => ({ ...prev, [receiverId]: "sending" }));
    setSendError((prev) => ({ ...prev, [receiverId]: "" }));
    try {
      const res = await fetch("/api/friends/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ receiverId }),
      });
      const json = await res.json();
      if (!res.ok) {
        setSendStatus((prev) => ({ ...prev, [receiverId]: "error" }));
        setSendError((prev) => ({ ...prev, [receiverId]: json.error ?? "Failed" }));
        return;
      }
      setSendStatus((prev) => ({ ...prev, [receiverId]: "sent" }));
      void invalidateFriendRequests();
      if (json.status === "accepted") {
        setFriends([]);
        setAuthorNews([]);
        fetchFeed({});
      }
    } catch {
      setSendStatus((prev) => ({ ...prev, [receiverId]: "error" }));
      setSendError((prev) => ({ ...prev, [receiverId]: "Something went wrong. Please try again." }));
    }
  }

  function closeModal() {
    setShowModal(false);
    setSearchQuery("");
    setSearchResults([]);
    setSearchError("");
    setSendStatus({});
    setSendError({});
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
            onClick={() => { setFriends([]); setAuthorNews([]); fetchFeed({}); }}
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
            {id === "friends" && friendsCount > 0 && (
              <span style={{
                fontSize: "10px", background: "color-mix(in srgb, var(--primary) 15%, transparent)",
                color: "var(--primary)", borderRadius: "10px", padding: "1px 6px",
              }}>
                {friendsCount}
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
      {loading && friends.length === 0 && (
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
      {!loading && tab === "friends" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {friends.length === 0 ? (
            <EmptyFriends />
          ) : (
            <>
              {friends.map((entry) => (
                <FriendEntryCard
                  key={entry.id}
                  entry={entry}
                  onBookClick={(bookId) => setBookModalId(bookId)}
                />
              ))}
              {nextFriendsCursor && (
                <div ref={friendsSentinelRef} style={{ height: "32px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {loadingMore && <span style={{ fontSize: "12px", color: "var(--muted-foreground)" }}>Loading…</span>}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Author news tab */}
      {!loading && tab === "news" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {authorNews.length === 0 ? (
            <EmptyNews />
          ) : (
            <>
              {authorNews.map((post) => (
                <AuthorNewsCard key={post.id} post={post} />
              ))}
              {nextGatorCursor && (
                <div ref={newsSentinelRef} style={{ height: "32px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {loadingMore && <span style={{ fontSize: "12px", color: "var(--muted-foreground)" }}>Loading…</span>}
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
              Search by name (e.g. <span style={{ fontFamily: "var(--font-display)", color: "var(--foreground)" }}>Alex</span>)
              or by exact tag (e.g. <span style={{ fontFamily: "var(--font-display)", color: "var(--foreground)" }}>Alex#4821</span>).
            </p>
            <p style={{ fontSize: "12px", color: "var(--muted-foreground)", margin: 0 }}>
              Your own tag is on your{" "}
              <a href="/profile" style={{ color: "var(--primary)", textDecoration: "underline" }}>
                Profile page
              </a>
              {" "}under "Friends" — share it so others can find you.
            </p>

            {/* Search input */}
            <div style={{ display: "flex", gap: "8px" }}>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setSearchResults([]);
                  setSearchError("");
                  setSendStatus({});
                  setSendError({});
                }}
                onKeyDown={(e) => { if (e.key === "Enter") handleSearch(); }}
                placeholder="Name or Name#1234"
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

            {/* Search error */}
            {searchError && (
              <p style={{ fontSize: "13px", color: "var(--muted-foreground)", margin: 0 }}>
                {searchError}
              </p>
            )}

            {/* Search results */}
            {searchResults.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {searchResults.map((user) => {
                  const status = sendStatus[user.id] ?? "idle";
                  return (
                    <div key={user.id} style={{
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
                          {(user.name ?? "?")[0].toUpperCase()}
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <p style={{ fontSize: "14px", fontWeight: 600, color: "var(--foreground)", margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {user.name ?? "Reader"}
                          </p>
                          {user.displayName && user.discriminator && (
                            <p style={{ fontSize: "11px", color: "var(--muted-foreground)", margin: 0, fontFamily: "var(--font-display)" }}>
                              {user.displayName}#{user.discriminator}
                            </p>
                          )}
                        </div>
                      </div>

                      <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "4px" }}>
                        {status === "sent" ? (
                          <span style={{ fontSize: "12px", color: "var(--primary)", display: "flex", alignItems: "center", gap: "4px" }}>
                            <Check size={13} aria-hidden="true" /> Sent
                          </span>
                        ) : (
                          <button
                            type="button"
                            disabled={status === "sending"}
                            onClick={() => handleSendRequest(user.id)}
                            style={{
                              padding: "6px 14px", fontSize: "13px",
                              border: "none", borderRadius: "var(--radius)",
                              background: "var(--primary)", color: "var(--primary-foreground)",
                              cursor: status === "sending" ? "wait" : "pointer",
                              opacity: status === "sending" ? 0.6 : 1,
                              fontFamily: "inherit", whiteSpace: "nowrap",
                            }}
                          >
                            {status === "sending" ? "Sending..." : "Add"}
                          </button>
                        )}
                        {status === "error" && sendError[user.id] && (
                          <p role="alert" style={{ fontSize: "11px", color: "var(--destructive)", margin: 0 }}>
                            {sendError[user.id]}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Book info modal */}
      {bookModalId && (
        <BookInfoModal bookId={bookModalId} onClose={() => setBookModalId(null)} />
      )}

      {/* Keyframe for loading spinner and skeleton */}
      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes pulse { 0%, 100% { opacity: 0.5; } 50% { opacity: 0.8; } }
      `}</style>
    </div>
  );
}
