"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Search, BookOpen, Plus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

type BookResult = {
  id: string | null;
  olKey: string | null;
  title: string;
  author: string;
  coverUrl: string | null;
  publishedYear: number | null;
  source?: string;
};

type AddingState = "idle" | "loading" | "done";

export default function BookSearchPage() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<BookResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState<Record<string, AddingState>>({});

  // Holds the current in-flight request so we can cancel it when a new
  // query comes in before the previous one finishes.
  const abortRef = useRef<AbortController | null>(null);

  const search = useCallback(async (q: string, signal?: AbortSignal) => {
    if (!q.trim()) {
      setResults([]);
      return;
    }
    setLoading(true);
    setError("");

    try {
      const res = await fetch(`/api/books/search?q=${encodeURIComponent(q)}`, { signal });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Search failed");
      setResults(data.results ?? []);
    } catch (e: unknown) {
      // AbortError just means a newer query superseded this one -- not a real error
      if (e instanceof DOMException && e.name === "AbortError") return;
      setError(e instanceof Error ? e.message : "Search failed");
    } finally {
      setLoading(false);
    }
  }, []);

  // -- Debounce: fire 400ms after the user stops typing --
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setError("");
      return;
    }

    // Cancel any in-flight request before scheduling a new one
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const timer = setTimeout(() => {
      search(query, controller.signal);
    }, 400);

    return () => {
      clearTimeout(timer);
    };
  }, [query, search]);

  // Manual trigger (Enter key or Search button) -- fires immediately,
  // bypassing the 400ms wait
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
      router.push(`/journal/${data.book.id}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to add book");
      setAdding(prev => ({ ...prev, [key]: "idle" }));
    }
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
        Search by title or author. We'll check our library first, then Open Library.
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
            className="w-full border border-border rounded-md pl-9 pr-4 py-2.5
                       text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
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

      {/* Results */}
      {results.length > 0 && (
        <ul
          aria-label="Search results"
          style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "0.75rem" }}
        >
          {results.map((book) => {
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
                {/* Cover */}
                <div
                  aria-hidden="true"
                  style={{
                    width: "52px", height: "72px", borderRadius: "4px",
                    background: "var(--muted)", flexShrink: 0,
                    overflow: "hidden", display: "flex",
                    alignItems: "center", justifyContent: "center",
                  }}
                >
                  {book.coverUrl
                    ? <img
                      src={book.coverUrl}
                      alt=""
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                    : <BookOpen size={20} style={{ color: "var(--muted-foreground)" }} aria-hidden="true" />
                  }
                </div>

                {/* Info */}
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

                {/* Actions */}
                <div style={{ display: "flex", gap: "8px", flexShrink: 0, alignItems: "center" }}>
                  {state === "done" ? (
                    // FIX: var(--accent) instead of hardcoded #4A6741
                    <span style={{ fontSize: "12px", color: "var(--accent)" }}>
                      Added
                    </span>
                  ) : (
                    <>
                      {/* FIX: type="button", aria-label includes book title */}
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
          })}
        </ul>
      )}

      {/* Empty state */}
      {!loading && results.length === 0 && query && (
        <div style={{ textAlign: "center", padding: "3rem 0" }}>
          <BookOpen size={40} aria-hidden="true" style={{ color: "var(--muted-foreground)", margin: "0 auto 1rem" }} />
          <p style={{ color: "var(--muted-foreground)", fontSize: "14px" }}>
            No results for "{query}"
          </p>
          <p style={{ color: "var(--muted-foreground)", fontSize: "12px", marginTop: "4px" }}>
            Try a different title or author
          </p>
        </div>
      )}
    </div>
  );
}
