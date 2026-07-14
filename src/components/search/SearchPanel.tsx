"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { X, Search } from "lucide-react";
import { useSearch, type SearchScope, type SearchResult } from "@/hooks/useSearch";
import TagChip from "./TagChip";

const EXAMPLE_QUERIES = ["theme:betrayal", "quotes about power", "type:prediction -tone:comedic"];

function formatChapter(start: number, end: number): string {
  if (end === 9999) return "Whole book";
  if (start === end) return `Ch. ${end}`;
  return `Ch. ${start}–${end}`;
}

export default function SearchPanel({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<SearchScope>("mine");
  const inputRef = useRef<HTMLInputElement>(null);

  const { data, isFetching, isError, refetch, submit } = useSearch(query, scope);

  // Autofocus on open
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Escape closes; lock body scroll while open
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  function resultHref(r: SearchResult): string {
    return scope === "friends"
      ? `/users/${r.user_id}/books/${r.book_id}`
      : `/journal/${r.book_id}?entry=${r.id}`;
  }

  function navigateToResult(r: SearchResult) {
    onClose();
    router.push(resultHref(r));
  }

  const results = data?.results ?? [];
  const expansionTags = data?.expansion?.tags ?? [];
  const showResults = query.trim().length >= 2;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Search journal"
      style={{ position: "fixed", inset: 0, zIndex: 200 }}
    >
      {/* Overlay */}
      <div
        onClick={onClose}
        style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)" }}
      />

      {/* Panel */}
      <div
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          height: "100%",
          width: "min(480px, 100%)",
          background: "var(--card)",
          borderLeft: "0.5px solid var(--border)",
          boxShadow: "-8px 0 32px rgba(0,0,0,0.2)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Header */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          style={{
            padding: "1rem 1.25rem",
            display: "flex",
            alignItems: "center",
            gap: "8px",
            borderBottom: "0.5px solid var(--border)",
            flexShrink: 0,
          }}
        >
          <button
            type="button"
            aria-label="Close search"
            onClick={onClose}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "28px",
              height: "28px",
              border: "0.5px solid var(--border)",
              borderRadius: "var(--radius)",
              background: "var(--muted)",
              color: "var(--muted-foreground)",
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            <X size={12} aria-hidden="true" />
          </button>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search your journal…"
            aria-label="Search query"
            style={{
              flex: 1,
              padding: "6px 4px",
              fontSize: "14px",
              border: "none",
              background: "transparent",
              color: "var(--foreground)",
              outline: "none",
              fontFamily: "inherit",
            }}
          />
          <button
            type="submit"
            aria-label="Search"
            title="Search"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: "none",
              background: "transparent",
              padding: 0,
              color: "var(--muted-foreground)",
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            <Search size={16} aria-hidden="true" />
          </button>
        </form>

        {/* Scope toggle */}
        <div
          role="group"
          aria-label="Search scope"
          style={{ display: "flex", gap: "4px", padding: "10px 1.25rem 0" }}
        >
          {(
            [
              { value: "mine", label: "My journal" },
              { value: "friends", label: "Friends" },
            ] as const
          ).map(({ value, label }) => (
            <button
              key={value}
              type="button"
              aria-pressed={scope === value}
              onClick={() => setScope(value)}
              style={{
                padding: "4px 12px",
                fontSize: "12px",
                border: "0.5px solid var(--border)",
                borderRadius: "999px",
                background: scope === value ? "var(--primary)" : "var(--muted)",
                color: scope === value ? "var(--primary-foreground)" : "var(--muted-foreground)",
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Syntax hint */}
        <p
          style={{
            padding: "8px 1.25rem 0",
            margin: 0,
            fontSize: "11px",
            color: "var(--muted-foreground)",
            lineHeight: 1.5,
          }}
        >
          Try{" "}
          <code style={{ color: "var(--foreground)" }}>theme:betrayal -type:summary</code>, or just
          describe what you remember.
        </p>

        {/* Expansion chips */}
        {showResults && expansionTags.length > 0 && (
          <div style={{ padding: "10px 1.25rem 0", display: "flex", flexWrap: "wrap", gap: "5px", alignItems: "center" }}>
            <span style={{ fontSize: "11px", color: "var(--muted-foreground)" }}>Searching:</span>
            {expansionTags.map((t) => (
              <TagChip
                key={t}
                tag={t}
                onClick={() => setQuery((q) => `${q} -${t}`.trim())}
              />
            ))}
          </div>
        )}

        {/* Results / states */}
        <div style={{ flex: 1, overflowY: "auto", padding: "1rem 1.25rem" }}>
          {!showResults ? (
            <IdleState onPick={(q) => setQuery(q)} />
          ) : isError ? (
            <div style={{ textAlign: "center", padding: "2rem 0" }}>
              <p style={{ fontSize: "13px", color: "var(--destructive)", margin: "0 0 10px" }}>
                Something went wrong.
              </p>
              <button
                type="button"
                onClick={() => refetch()}
                style={{
                  padding: "6px 14px",
                  fontSize: "12px",
                  border: "0.5px solid var(--border)",
                  borderRadius: "var(--radius)",
                  background: "var(--muted)",
                  color: "var(--foreground)",
                  cursor: "pointer",
                }}
              >
                Retry
              </button>
            </div>
          ) : isFetching && results.length === 0 ? (
            <SkeletonList />
          ) : results.length === 0 ? (
            <div style={{ textAlign: "center", padding: "2rem 0" }}>
              <p style={{ fontSize: "13px", color: "var(--muted-foreground)", margin: 0 }}>
                No entries found.
              </p>
              <p style={{ fontSize: "12px", color: "var(--muted-foreground)", margin: "6px 0 0" }}>
                Try different words or fewer tags.
              </p>
            </div>
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "8px" }}>
              {results.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => navigateToResult(r)}
                    onMouseEnter={() => router.prefetch(resultHref(r))}
                    style={{
                      width: "100%",
                      textAlign: "left",
                      display: "flex",
                      gap: "10px",
                      padding: "10px",
                      border: "0.5px solid var(--border)",
                      borderRadius: "var(--radius)",
                      background: "var(--background)",
                      cursor: "pointer",
                      fontFamily: "inherit",
                    }}
                  >
                    {r.book_cover_url ? (
                      <Image
                        src={r.book_cover_url}
                        alt=""
                        width={36}
                        height={54}
                        style={{ width: "36px", height: "54px", objectFit: "cover", borderRadius: "3px", flexShrink: 0 }}
                      />
                    ) : (
                      <div style={{ width: "36px", height: "54px", borderRadius: "3px", background: "var(--muted)", flexShrink: 0 }} />
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                        <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--foreground)" }}>
                          {r.book_title}
                        </span>
                        <span
                          style={{
                            fontSize: "10px",
                            padding: "1px 6px",
                            borderRadius: "999px",
                            background: "var(--muted)",
                            color: "var(--muted-foreground)",
                          }}
                        >
                          {formatChapter(r.chapter_start, r.chapter_end)}
                        </span>
                      </div>
                      {scope === "friends" && (
                        <div style={{ fontSize: "11px", color: "var(--muted-foreground)", marginTop: "1px" }}>
                          {r.author_display_name ?? r.author_name}
                        </div>
                      )}
                      <p
                        style={{
                          fontSize: "12px",
                          color: "var(--muted-foreground)",
                          margin: "4px 0 0",
                          lineHeight: 1.5,
                          display: "-webkit-box",
                          WebkitLineClamp: 3,
                          WebkitBoxOrient: "vertical",
                          overflow: "hidden",
                        }}
                      >
                        {r.content}
                      </p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function IdleState({ onPick }: { onPick: (q: string) => void }) {
  return (
    <div style={{ paddingTop: "1rem" }}>
      <p style={{ fontSize: "12px", color: "var(--muted-foreground)", margin: "0 0 10px", lineHeight: 1.6 }}>
        Search by tag, by meaning, or both. Some examples:
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
        {EXAMPLE_QUERIES.map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => onPick(q)}
            style={{
              padding: "4px 10px",
              fontSize: "12px",
              border: "0.5px solid var(--border)",
              borderRadius: "999px",
              background: "var(--muted)",
              color: "var(--foreground)",
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            {q}
          </button>
        ))}
      </div>
    </div>
  );
}

function SkeletonList() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          aria-hidden="true"
          style={{
            display: "flex",
            gap: "10px",
            padding: "10px",
            border: "0.5px solid var(--border)",
            borderRadius: "var(--radius)",
          }}
        >
          <div style={{ width: "36px", height: "54px", borderRadius: "3px", background: "var(--muted)" }} />
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "6px" }}>
            <div style={{ width: "60%", height: "12px", borderRadius: "4px", background: "var(--muted)" }} />
            <div style={{ width: "100%", height: "10px", borderRadius: "4px", background: "var(--muted)" }} />
            <div style={{ width: "80%", height: "10px", borderRadius: "4px", background: "var(--muted)" }} />
          </div>
        </div>
      ))}
    </div>
  );
}
