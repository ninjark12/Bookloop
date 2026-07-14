"use client";

import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Search, BookOpen, Plus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BookInfoModal, type BookDetail } from "@/components/BookInfoModal";

type BookResult = {
  id: string | null;
  olKey: string | null;
  title: string;
  author: string;
  coverUrl: string | null;
  publishedYear: number | null;
  readingStatus?: "READING" | "READ" | "TBR" | "DNF" | null;
  source?: string;
};

type AddingState = "idle" | "loading" | "done";

const statusLabels = {
  READING: "Reading",
  READ: "Read",
  TBR: "TBR",
  DNF: "DNF",
} as const;

export default function BookSearchPage() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [localResults, setLocalResults] = useState<BookResult[]>([]);
  const [openLibraryResults, setOpenLibraryResults] = useState<BookResult[]>([]);
  const [searchedQuery, setSearchedQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState<Record<string, AddingState>>({});
  const [bookModal, setBookModal] = useState<{ bookId: string; preloaded?: BookDetail } | null>(null);

  // Holds the current in-flight request so we can cancel it when a new
  // query comes in before the previous one finishes.
  const abortRef = useRef<AbortController | null>(null);

  const search = useCallback(async (q: string, signal?: AbortSignal) => {
    const trimmed = q.trim();
    if (!trimmed) {
      setLocalResults([]);
      setOpenLibraryResults([]);
      setSearchedQuery("");
      return;
    }
    setLoading(true);
    setLoadingMore(false);
    setError("");
    setLocalResults([]);
    setOpenLibraryResults([]);
    setSearchedQuery(trimmed);

    try {
      const res = await fetch(`/api/books/search?q=${encodeURIComponent(trimmed)}&source=local`, { signal });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Search failed");
      const local = data.localResults ?? data.results ?? [];
      setLocalResults(local);
      setLoading(false);

      if (!data.shouldQueryOpenLibrary) return;

      setLoadingMore(true);
      const moreParams = new URLSearchParams({ q: trimmed, source: "openlibrary" });
      for (const book of local) {
        if (book.olKey) moreParams.append("excludeOlKey", book.olKey);
      }
      const moreRes = await fetch(`/api/books/search?${moreParams.toString()}`, { signal });
      const moreData = await moreRes.json();
      if (!moreRes.ok) throw new Error(moreData.error ?? "Search failed");

      const localOlKeys = new Set(local.map((book: BookResult) => book.olKey).filter(Boolean));
      setOpenLibraryResults(
        (moreData.openLibraryResults ?? moreData.results ?? []).filter((book: BookResult) => {
          return !book.olKey || !localOlKeys.has(book.olKey);
        }),
      );
    } catch (e: unknown) {
      // AbortError just means a newer query superseded this one -- not a real error
      if (e instanceof DOMException && e.name === "AbortError") return;
      setError(e instanceof Error ? e.message : "Search failed");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  function triggerSearchNow() {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    search(query, controller.signal);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") triggerSearchNow();
  }

  async function addBook(book: BookResult, status: "READING" | "TBR") {
    const key = book.olKey ?? book.id ?? book.title;
    setAdding(prev => ({ ...prev, [key]: "loading" }));

    try {
      const res = await fetch("/api/books/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookId: book.id ?? undefined,
          olKey: book.olKey ?? undefined,
          title: book.title,
          author: book.author,
          coverUrl: book.coverUrl ?? undefined,
          publishedYear: book.publishedYear ?? undefined,
          status,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to add book");

      setAdding(prev => ({ ...prev, [key]: "done" }));
      if (status === "READING") {
        router.push(`/journal/${data.book.id}`);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to add book");
      setAdding(prev => ({ ...prev, [key]: "idle" }));
    }
  }

  function renderBookResult(book: BookResult) {
    const key = book.olKey ?? book.id ?? book.title;
    const state = adding[key] ?? "idle";

    return (
      <li
        key={key}
        style={{
          background: "var(--card)",
          border: "0.5px solid var(--border)",
          borderRadius: "var(--radius)",
          padding: "1rem",
          display: "flex",
          gap: "1rem",
          alignItems: "flex-start",
        }}
      >
        <button
          type="button"
          aria-label={`View details for ${book.title}`}
          onClick={() => {
            if (book.id) {
              setBookModal({ bookId: book.id });
            } else {
              setBookModal({
                bookId: "",
                preloaded: {
                  id: "", title: book.title, author: book.author,
                  coverUrl: book.coverUrl, publishedYear: book.publishedYear,
                  description: null, edition: null, pageCount: null,
                  olKey: book.olKey,
                },
              });
            }
          }}
          style={{
            width: "52px", height: "72px", borderRadius: "4px",
            background: "var(--muted)", flexShrink: 0,
            overflow: "hidden", display: "flex",
            alignItems: "center", justifyContent: "center",
            border: "none", padding: 0, cursor: "pointer",
          }}
        >
          {book.coverUrl
            ? <Image
              src={book.coverUrl}
              alt=""
              width={52}
              height={72}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
            : <BookOpen size={20} style={{ color: "var(--muted-foreground)" }} aria-hidden="true" />
          }
        </button>

        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{
            fontFamily: "var(--font-display)", fontSize: "15px",
            fontWeight: 600, color: "var(--foreground)",
            marginBottom: "2px", whiteSpace: "nowrap",
            overflow: "hidden", textOverflow: "ellipsis",
          }}>
            {book.title}
          </p>
          <p style={{ fontSize: "12px", color: "var(--muted-foreground)", marginBottom: "2px" }}>
            {book.author}
          </p>
          {book.publishedYear && (
            <p style={{ fontSize: "11px", color: "var(--muted-foreground)" }}>
              {book.publishedYear}
            </p>
          )}
        </div>

        <div style={{ display: "flex", gap: "8px", flexShrink: 0, alignItems: "center" }}>
          {book.readingStatus && book.id ? (
            <button
              type="button"
              aria-label={`Open journal for "${book.title}"`}
              onClick={() => router.push(`/journal/${book.id}`)}
              style={{
                fontSize: "11px", fontWeight: 500,
                color: "var(--primary-foreground)",
                background: "var(--primary)",
                border: "none", borderRadius: "var(--radius)",
                padding: "6px 12px",
                cursor: "pointer",
              }}
            >
              {statusLabels[book.readingStatus]}
            </button>
          ) : state === "done" ? (
            <span style={{ fontSize: "12px", color: "var(--accent)" }}>
              Added
            </span>
          ) : (
            <>
              <button
                type="button"
                aria-label={`Add "${book.title}" to currently reading`}
                onClick={() => addBook(book, "READING")}
                disabled={state === "loading"}
                aria-disabled={state === "loading"}
                style={{
                  fontSize: "11px", fontWeight: 500,
                  color: "var(--primary-foreground)",
                  background: "var(--primary)",
                  border: "none", borderRadius: "var(--radius)",
                  padding: "6px 12px",
                  cursor: state === "loading" ? "not-allowed" : "pointer",
                  opacity: state === "loading" ? 0.6 : 1,
                  display: "flex", alignItems: "center", gap: "4px",
                }}
              >
                <Plus size={12} aria-hidden="true" /> Reading
              </button>
              <button
                type="button"
                aria-label={`Add "${book.title}" to to-be-read list`}
                onClick={() => addBook(book, "TBR")}
                disabled={state === "loading"}
                aria-disabled={state === "loading"}
                style={{
                  fontSize: "11px", fontWeight: 500,
                  color: "var(--muted-foreground)",
                  background: "var(--muted)",
                  border: "0.5px solid var(--border)",
                  borderRadius: "var(--radius)",
                  padding: "6px 12px",
                  cursor: state === "loading" ? "not-allowed" : "pointer",
                  opacity: state === "loading" ? 0.6 : 1,
                }}
              >
                TBR
              </button>
            </>
          )}
        </div>
      </li>
    );
  }

  function renderResultsList(label: string, books: BookResult[]) {
    if (books.length === 0) return null;

    return (
      <section style={{ marginBottom: "1.5rem" }}>
        <h2 style={{ fontSize: "13px", fontWeight: 600, color: "var(--muted-foreground)", marginBottom: "0.75rem" }}>
          {label}
        </h2>
        <ul
          aria-label={label}
          style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "0.75rem" }}
        >
          {books.map(renderBookResult)}
        </ul>
      </section>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-12">
      <h1
        className="text-3xl font-bold text-primary mb-2"
        style={{ fontFamily: "var(--font-display)" }}
      >
        Find a book
      </h1>
      <p className="text-muted-foreground mb-8">
        Search by title or author. We will check our library first, then Open Library.
      </p>

      {/* Search bar */}
      <div className="flex gap-3 mb-8">
        <div className="relative flex-1">
          {/* FIX: aria-hidden on decorative icon */}
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground"
            aria-hidden="true"
          />
          {/* FIX: id pairs with htmlFor on the label above (implicit via wrapping
              is not reliable cross-screen-reader, so we use explicit id) */}
          <label htmlFor="book-search" className="sr-only">
            Search by title or author
          </label>
          <input
            id="book-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search by title or author..."
            autoComplete="off"
            className="w-full border border-border rounded-md pl-9 pr-4 py-2.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        {/* FIX: aria-label on search button */}
        <Button
          aria-label="Search books"
          onClick={triggerSearchNow}
          disabled={loading || !query.trim()}
        >
          {loading
            ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
            : <Search className="w-4 h-4" aria-hidden="true" />
          }
          <span className="ml-2">{loading ? "Searching..." : "Search"}</span>
        </Button>
      </div>

      {/* FIX: role="alert" so screen readers announce errors immediately */}
      {error && (
        <p role="alert" className="text-sm text-destructive mb-4">{error}</p>
      )}

      {renderResultsList("From Bookloop", localResults)}

      {(loadingMore || openLibraryResults.length > 0) && (
        <section style={{ marginBottom: "1.5rem" }}>
          {localResults.length > 0 && (
            <h2 style={{ fontSize: "13px", fontWeight: 600, color: "var(--muted-foreground)", marginBottom: "0.75rem" }}>
              More books
            </h2>
          )}
          {loadingMore ? (
            <div
              aria-live="polite"
              style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--muted-foreground)", fontSize: "13px" }}
            >
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
              Loading more books...
            </div>
          ) : (
            <ul
              aria-label="More books"
              style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "0.75rem" }}
            >
              {openLibraryResults.map(renderBookResult)}
            </ul>
          )}
        </section>
      )}

      {/* Empty state */}
      {!loading && !loadingMore && localResults.length === 0 && openLibraryResults.length === 0 && searchedQuery && (
        <div style={{ textAlign: "center", padding: "3rem 0" }}>
          <BookOpen size={40} aria-hidden="true" style={{ color: "var(--muted-foreground)", margin: "0 auto 1rem" }} />
          <p style={{ color: "var(--muted-foreground)", fontSize: "14px" }}>
            No results for &quot;{searchedQuery}&quot;
          </p>
          <p style={{ color: "var(--muted-foreground)", fontSize: "12px", marginTop: "4px" }}>
            Try a different title or author
          </p>
        </div>
      )}

      {bookModal && (
        <BookInfoModal
          bookId={bookModal.bookId}
          preloaded={bookModal.preloaded}
          onClose={() => setBookModal(null)}
        />
      )}
    </div>
  );
}
