"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, Newspaper, Users, RefreshCw, ExternalLink, Eye, EyeOff } from "lucide-react";

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

type FeedData = {
  friends: FriendEntry[];
  authorNews: AuthorPost[];
  authorNewsPages: number;
  followingCount: number;
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

// -- Friend entry card --

function FriendEntryCard({
  entry,
  onBookClick,
}: {
  entry: FriendEntry;
  onBookClick: (bookId: string) => void;
}) {
  const [revealed, setRevealed] = useState(false);

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
          {/* Avatar placeholder */}
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
          {entry.spoilered && !revealed ? (
            <div style={{
              background: "var(--muted)",
              borderRadius: "var(--radius)",
              padding: "0.75rem",
              display: "flex",
              flexDirection: "column",
              gap: "6px",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <EyeOff size={13} aria-hidden="true" style={{ color: "var(--muted-foreground)" }} />
                <span style={{ fontSize: "12px", color: "var(--muted-foreground)", fontStyle: "italic" }}>
                  Possible spoiler -- you have not reached {formatChapterLabel(entry)} yet
                </span>
              </div>
              <button
                type="button"
                onClick={() => setRevealed(true)}
                style={{
                  background: "none", border: "none", cursor: "pointer", padding: 0,
                  fontSize: "11px", color: "var(--primary)", textDecoration: "underline",
                  textAlign: "left", fontFamily: "inherit",
                  display: "flex", alignItems: "center", gap: "4px",
                }}
              >
                <Eye size={11} aria-hidden="true" /> Reveal anyway
              </button>
            </div>
          ) : (
            <p style={{
              fontSize: "13px", color: "var(--foreground)",
              lineHeight: 1.65, margin: 0,
              display: "-webkit-box",
              WebkitLineClamp: 4,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
              fontFamily: "var(--font-serif)",
            }}>
              {entry.content}
            </p>
          )}
        </div>
      </div>
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

  useEffect(() => { fetchFeed(0); }, [fetchFeed]);

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
            {id === "friends" && data && data.followingCount > 0 && (
              <span style={{
                fontSize: "10px", background: "color-mix(in srgb, var(--primary) 15%, transparent)",
                color: "var(--primary)", borderRadius: "10px", padding: "1px 6px",
              }}>
                {data.followingCount}
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

      {/* Keyframe for loading spinner and skeleton */}
      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes pulse { 0%, 100% { opacity: 0.5; } 50% { opacity: 0.8; } }
      `}</style>
    </div>
  );
}
