"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { X } from "lucide-react";

export type BookDetail = {
  id: string;
  title: string;
  author: string;
  coverUrl: string | null;
  publishedYear: number | null;
  description: string | null;
  edition: string | null;
  pageCount: number | null;
  olKey: string | null;
};

type Props = {
  bookId: string;
  preloaded?: BookDetail;
  onClose: () => void;
};

function largeCover(url: string | null): string | null {
  if (!url) return null;
  return url.replace(/-(S|M)\.jpg$/, "-L.jpg");
}

export function BookInfoModal({ bookId, preloaded, onClose }: Props) {
  const [book, setBook] = useState<BookDetail | null>(preloaded ?? null);
  const [loading, setLoading] = useState(!preloaded);
  const [error, setError] = useState("");
  // undefined = not yet checked, null = confirmed none, string = has value.
  // Initialise to the actual description if preloaded already has one;
  // otherwise undefined so Phase 2 will go fetch it.
  const [description, setDescription] = useState<string | null | undefined>(
    preloaded?.description ? preloaded.description : undefined,
  );
  const [descLoading, setDescLoading] = useState(false);

  // Phase 1: fetch book metadata (skipped when preloaded)
  useEffect(() => {
    if (preloaded) return;
    let cancelled = false;
    setLoading(true);
    fetch(`/api/books/${bookId}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data.book) {
          setBook(data.book);
          // Only fast-path if DB already has a description — otherwise leave
          // description as undefined so Phase 2 fetches it from OL.
          if (data.book.description) setDescription(data.book.description);
        } else {
          setError("Could not load book details.");
        }
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) { setError("Could not load book details."); setLoading(false); }
      });
    return () => { cancelled = true; };
  }, [bookId, preloaded]);

  // Phase 2: lazily fetch description from OL once we have book metadata
  useEffect(() => {
    if (!book) return;
    if (description !== undefined) return; // already resolved

    let cancelled = false;
    setDescLoading(true);

    const url = book.id
      ? `/api/books/${book.id}/description`
      : book.olKey
        ? `/api/books/ol-description?olKey=${encodeURIComponent(book.olKey)}`
        : null;

    if (!url) {
      setDescription(null);
      setDescLoading(false);
      return;
    }

    fetch(url)
      .then((r) => r.json())
      .then((data) => { if (!cancelled) setDescription(data.description ?? null); })
      .catch(() => { if (!cancelled) setDescription(null); })
      .finally(() => { if (!cancelled) setDescLoading(false); });
    return () => { cancelled = true; };
  }, [book, description]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const cover = largeCover(book?.coverUrl ?? null);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={book ? `Details for ${book.title}` : "Book details"}
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
        maxWidth: "460px", width: "100%",
        maxHeight: "85vh",
        display: "flex", flexDirection: "column",
        boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
        overflow: "hidden",
      }}>
        {/* Header */}
        <div style={{
          padding: "1rem 1.25rem",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          flexShrink: 0,
        }}>
          <h2 style={{
            fontFamily: "var(--font-display)", fontSize: "16px",
            fontWeight: 700, color: "var(--foreground)", margin: 0,
          }}>
            Book Details
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              width: "28px", height: "28px",
              border: "0.5px solid var(--border)", borderRadius: "var(--radius)",
              background: "var(--muted)", color: "var(--muted-foreground)",
              cursor: "pointer", flexShrink: 0,
            }}
          >
            <X size={12} aria-hidden="true" />
          </button>
        </div>
        <div style={{ height: "1px", background: "var(--primary)", opacity: 0.4, flexShrink: 0 }} />

        {/* Body */}
        <div style={{
          flex: 1, minHeight: 0, overflowY: "auto",
          padding: "1.5rem 1.25rem",
          display: "flex", flexDirection: "column",
          gap: "1rem", alignItems: "center",
        }}>
          {loading && (
            <p style={{ fontSize: "13px", color: "var(--muted-foreground)", marginTop: "2rem" }}>
              Loading...
            </p>
          )}
          {error && (
            <p style={{ fontSize: "13px", color: "var(--muted-foreground)", marginTop: "2rem" }}>
              {error}
            </p>
          )}
          {book && (
            <>
              {cover && (
                <Image
                  src={cover}
                  alt={`Cover of ${book.title}`}
                  width={120}
                  height={180}
                  style={{
                    objectFit: "cover", borderRadius: "4px",
                    boxShadow: "0 4px 16px rgba(0,0,0,0.2)",
                  }}
                />
              )}

              <div style={{ width: "100%", textAlign: "center" }}>
                <p style={{
                  fontFamily: "var(--font-display)", fontSize: "18px",
                  fontWeight: 700, color: "var(--foreground)", margin: "0 0 4px",
                }}>
                  {book.title}
                </p>
                <p style={{ fontSize: "14px", color: "var(--muted-foreground)", margin: 0 }}>
                  {book.author}
                </p>
              </div>

              {(book.publishedYear || book.edition || book.pageCount) && (
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", justifyContent: "center" }}>
                  {book.publishedYear && (
                    <span style={{
                      fontSize: "11px", color: "var(--muted-foreground)",
                      background: "var(--muted)", borderRadius: "4px", padding: "3px 8px",
                    }}>
                      {book.publishedYear}
                    </span>
                  )}
                  {book.edition && (
                    <span style={{
                      fontSize: "11px", color: "var(--muted-foreground)",
                      background: "var(--muted)", borderRadius: "4px", padding: "3px 8px",
                    }}>
                      {book.edition}
                    </span>
                  )}
                  {book.pageCount && (
                    <span style={{
                      fontSize: "11px", color: "var(--muted-foreground)",
                      background: "var(--muted)", borderRadius: "4px", padding: "3px 8px",
                    }}>
                      {book.pageCount} pages
                    </span>
                  )}
                </div>
              )}

              <div style={{ width: "100%", height: "0.5px", background: "var(--border)" }} />

              {descLoading ? (
                <p style={{ fontSize: "13px", color: "var(--muted-foreground)", margin: 0 }}>
                  Loading synopsis...
                </p>
              ) : description ? (
                <p style={{
                  fontSize: "13px", color: "var(--foreground)",
                  lineHeight: 1.7, margin: 0, width: "100%",
                }}>
                  {description}
                </p>
              ) : (
                <p style={{ fontSize: "13px", color: "var(--muted-foreground)", margin: 0 }}>
                  No synopsis available.
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
