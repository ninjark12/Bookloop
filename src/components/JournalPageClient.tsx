"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, Plus, X, ChevronLeft, Pencil, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Book, JournalEntry, ReadingProgress } from "@/db/schema";

type Props = {
  book: Book;
  initialEntries: JournalEntry[];
  progress: ReadingProgress | null;
  userId: string;
};

type Status = "READING" | "READ" | "TBR" | "DNF";

const STATUS_LABELS: Record<Status, string> = {
  READING: "Reading",
  READ: "Read",
  TBR: "To be read",
  DNF: "Did not finish",
};

const SPINE_WIDTH = 32;

export default function JournalPageClient({
  book,
  initialEntries,
  progress,
  userId,
}: Props) {
  const router = useRouter();
  const [entries, setEntries] = useState<JournalEntry[]>(initialEntries);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const editTextareaRef = useRef<HTMLTextAreaElement>(null);

  // Status
  const [bookStatus, setBookStatus] = useState<Status>(
    (progress?.status as Status) ?? "TBR"
  );
  const [statusSaving, setStatusSaving] = useState(false);

  // Entry expand / edit
  const [selectedEntry, setSelectedEntry] = useState<JournalEntry | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState("");

  // New-entry form
  const [chapterStart, setChapterStart] = useState(progress?.furthestChapter ?? 1);
  const [chapterEnd, setChapterEnd] = useState(progress?.furthestChapter ?? 1);
  const [scope, setScope] = useState<"CHAPTER" | "RANGE" | "WHOLE_BOOK">("CHAPTER");
  const [content, setContent] = useState("");
  const [isPublic, setIsPublic] = useState(false);

  // -- Keyboard shortcuts --
  //   Escape      -> close form / exit edit / deselect entry
  //   Shift+Enter -> save new entry (form open) or save edit (edit mode)
  //   Shift+N     -> open new entry form
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (showForm) { setShowForm(false); setError(""); return; }
        if (editMode) { setEditMode(false); setEditError(""); return; }
        if (selectedEntry) { setSelectedEntry(null); return; }
      }
      if (e.shiftKey && e.key === "Enter") {
        e.preventDefault();
        if (showForm) handleSubmit();
        else if (editMode) handleEditSave();
        return;
      }
      if (e.shiftKey && e.key === "N") {
        e.preventDefault();
        setSelectedEntry(null);
        setEditMode(false);
        setShowForm(true);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showForm, editMode, selectedEntry, content, editContent, chapterStart, chapterEnd, scope]);

  // Focus textarea when form opens
  useEffect(() => { if (showForm) textareaRef.current?.focus(); }, [showForm]);
  useEffect(() => { if (editMode) editTextareaRef.current?.focus(); }, [editMode]);

  // -- Status change --
  async function handleStatusChange(next: Status) {
    const prev = bookStatus;
    setBookStatus(next); // optimistic
    setStatusSaving(true);
    try {
      const res = await fetch("/api/books/status", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookId: book.id, status: next }),
      });
      if (!res.ok) throw new Error("Failed");
    } catch {
      setBookStatus(prev); // revert
    } finally {
      setStatusSaving(false);
    }
  }

  // -- Scope toggle --
  function handleScopeChange(s: "CHAPTER" | "RANGE" | "WHOLE_BOOK") {
    setScope(s);
    if (s === "CHAPTER") setChapterEnd(chapterStart);
    if (s === "WHOLE_BOOK") { setChapterStart(1); setChapterEnd(1); }
  }

  // -- Save new entry --
  async function handleSubmit() {
    if (!content.trim()) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/journal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookId: book.id,
          chapterStart: scope === "WHOLE_BOOK" ? 9999 : chapterStart,
          chapterEnd:
            scope === "WHOLE_BOOK" ? 9999
              : scope === "CHAPTER" ? chapterStart
                : chapterEnd,
          scope,
          content: content.trim(),
          isPublic,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save entry");
      setEntries(prev => [data.entry, ...prev]);
      setContent("");
      setShowForm(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  // -- Save edited entry --
  async function handleEditSave() {
    if (!selectedEntry || !editContent.trim()) return;
    setEditSubmitting(true);
    setEditError("");
    try {
      const res = await fetch("/api/journal", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entryId: selectedEntry.id, content: editContent.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to update entry");
      const updated = { ...selectedEntry, content: editContent.trim() };
      setEntries(prev => prev.map(e => e.id === selectedEntry.id ? updated : e));
      setSelectedEntry(updated);
      setEditMode(false);
    } catch (e: unknown) {
      setEditError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setEditSubmitting(false);
    }
  }

  // -- Helpers --
  function formatDate(date: Date | string) {
    return new Date(date).toLocaleDateString("en-US", {
      month: "short", day: "numeric", year: "numeric",
    });
  }

  function formatChapter(entry: JournalEntry) {
    if (entry.scope === "WHOLE_BOOK") return "Whole book";
    if (entry.chapterStart === entry.chapterEnd) return `Chapter ${entry.chapterStart}`;
    return `Chapters ${entry.chapterStart}-${entry.chapterEnd}`;
  }

  // -- Right page --
  function renderRightPage() {

    // New entry form
    if (showForm) {
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem", height: "100%" }}>

          {/* Scope + chapter inputs */}
          <div style={{ display: "flex", gap: "8px", alignItems: "flex-end", flexWrap: "wrap" }}>

            {scope !== "WHOLE_BOOK" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <label
                  htmlFor="chapter-start"
                  style={{ fontSize: "10px", color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "0.06em" }}
                >
                  {scope === "CHAPTER" ? "Chapter" : "From chapter"}
                </label>
                <input
                  id="chapter-start"
                  type="number"
                  min={1}
                  value={chapterStart}
                  onChange={(e) => {
                    const v = parseInt(e.target.value) || 1;
                    setChapterStart(v);
                    if (scope === "CHAPTER") setChapterEnd(v);
                    else if (v > chapterEnd) setChapterEnd(v);
                  }}
                  style={{
                    width: "72px", padding: "6px 8px",
                    border: "0.5px solid var(--border)", borderRadius: "var(--radius)",
                    background: "var(--background)", color: "var(--foreground)", fontSize: "13px",
                  }}
                />
              </div>
            )}

            {scope === "RANGE" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <label
                  htmlFor="chapter-end"
                  style={{ fontSize: "10px", color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "0.06em" }}
                >
                  To chapter
                </label>
                <input
                  id="chapter-end"
                  type="number"
                  min={chapterStart}
                  value={chapterEnd}
                  onChange={(e) => setChapterEnd(parseInt(e.target.value) || chapterStart)}
                  style={{
                    width: "72px", padding: "6px 8px",
                    border: "0.5px solid var(--border)", borderRadius: "var(--radius)",
                    background: "var(--background)", color: "var(--foreground)", fontSize: "13px",
                  }}
                />
              </div>
            )}

            {scope === "WHOLE_BOOK" && (
              <span style={{ fontSize: "12px", color: "var(--muted-foreground)", alignSelf: "flex-end", paddingBottom: "6px" }}>
                Covers entire book
              </span>
            )}

            <div role="group" aria-label="Entry scope" style={{ display: "flex", gap: "4px", marginLeft: "auto" }}>
              {(["CHAPTER", "RANGE", "WHOLE_BOOK"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => handleScopeChange(s)}
                  aria-pressed={scope === s}
                  style={{
                    fontSize: "10px", padding: "4px 8px", borderRadius: "4px",
                    border: "0.5px solid var(--border)",
                    background: scope === s ? "var(--primary)" : "var(--muted)",
                    color: scope === s ? "var(--primary-foreground)" : "var(--muted-foreground)",
                    cursor: "pointer", whiteSpace: "nowrap",
                  }}
                >
                  {s === "WHOLE_BOOK" ? "Whole book" : s.charAt(0) + s.slice(1).toLowerCase()}
                </button>
              ))}
            </div>
          </div>

          <textarea
            ref={textareaRef}
            id="entry-content"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Write your reflection..."
            aria-label="Journal entry content"
            style={{
              flex: 1, width: "100%", minHeight: "200px", padding: "12px",
              border: "0.5px solid var(--border)", borderRadius: "var(--radius)",
              background: "var(--background)", color: "var(--foreground)",
              fontSize: "14px", lineHeight: 1.7, resize: "none", outline: "none",
              fontFamily: "var(--font-serif)",
            }}
          />

          {error && (
            <p role="alert" style={{ fontSize: "12px", color: "var(--destructive)", margin: 0 }}>
              {error}
            </p>
          )}

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
            <label htmlFor="entry-public" style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer" }}>
              <input
                id="entry-public"
                type="checkbox"
                checked={isPublic}
                onChange={(e) => setIsPublic(e.target.checked)}
              />
              <span style={{ fontSize: "12px", color: "var(--muted-foreground)" }}>Public</span>
            </label>

            <div style={{ display: "flex", gap: "8px" }}>
              <button
                type="button"
                aria-label="Cancel new entry"
                onClick={() => { setShowForm(false); setError(""); }}
                style={{
                  padding: "6px 14px", fontSize: "12px",
                  border: "0.5px solid var(--border)", borderRadius: "var(--radius)",
                  background: "var(--muted)", color: "var(--muted-foreground)",
                  cursor: "pointer", display: "flex", alignItems: "center", gap: "4px",
                }}
              >
                <X size={12} aria-hidden="true" /> Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting || !content.trim()}
                aria-disabled={submitting || !content.trim()}
                style={{
                  padding: "6px 14px", fontSize: "12px",
                  border: "none", borderRadius: "var(--radius)",
                  background: "var(--primary)", color: "var(--primary-foreground)",
                  cursor: submitting || !content.trim() ? "not-allowed" : "pointer",
                  opacity: submitting || !content.trim() ? 0.6 : 1,
                }}
              >
                {submitting ? "Saving..." : "Save (Shift+Enter)"}
              </button>
            </div>
          </div>
        </div>
      );
    }

    // Selected entry detail / edit
    if (selectedEntry) {
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem", height: "100%" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              <span style={{
                fontSize: "11px", fontWeight: 500, color: "var(--primary)",
                background: "color-mix(in srgb, var(--primary) 12%, transparent)",
                borderRadius: "4px", padding: "2px 6px",
              }}>
                {formatChapter(selectedEntry)}
              </span>
              <span style={{ fontSize: "10px", color: "var(--muted-foreground)" }}>
                {formatDate(selectedEntry.createdAt)}
              </span>
            </div>

            <div style={{ display: "flex", gap: "6px" }}>
              <button
                type="button"
                aria-label="Close entry"
                onClick={() => { setSelectedEntry(null); setEditMode(false); setEditError(""); }}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center",
                  width: "28px", height: "28px",
                  border: "0.5px solid var(--border)", borderRadius: "var(--radius)",
                  background: "var(--muted)", color: "var(--muted-foreground)", cursor: "pointer",
                }}
              >
                <X size={12} aria-hidden="true" />
              </button>
              {!editMode && (
                <button
                  type="button"
                  aria-label="Edit this entry"
                  onClick={() => { setEditContent(selectedEntry.content ?? ""); setEditMode(true); }}
                  style={{
                    display: "flex", alignItems: "center", gap: "4px",
                    padding: "4px 10px", fontSize: "11px",
                    border: "0.5px solid var(--border)", borderRadius: "var(--radius)",
                    background: "var(--muted)", color: "var(--muted-foreground)", cursor: "pointer",
                  }}
                >
                  <Pencil size={11} aria-hidden="true" /> Edit
                </button>
              )}
            </div>
          </div>

          {!editMode && (
            <div style={{
              flex: 1, overflowY: "auto",
              fontSize: "14px", lineHeight: 1.8,
              color: "var(--foreground)", fontFamily: "var(--font-serif)",
              whiteSpace: "pre-wrap",
            }}>
              {selectedEntry.content}
            </div>
          )}

          {editMode && (
            <>
              <textarea
                ref={editTextareaRef}
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                aria-label="Edit entry content"
                style={{
                  flex: 1, width: "100%", minHeight: "200px", padding: "12px",
                  border: "0.5px solid var(--border)", borderRadius: "var(--radius)",
                  background: "var(--background)", color: "var(--foreground)",
                  fontSize: "14px", lineHeight: 1.7, resize: "none", outline: "none",
                  fontFamily: "var(--font-serif)",
                }}
              />
              {editError && (
                <p role="alert" style={{ fontSize: "12px", color: "var(--destructive)", margin: 0 }}>
                  {editError}
                </p>
              )}
              <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end", flexShrink: 0 }}>
                <button
                  type="button"
                  aria-label="Cancel edit"
                  onClick={() => { setEditMode(false); setEditError(""); }}
                  style={{
                    padding: "6px 14px", fontSize: "12px",
                    border: "0.5px solid var(--border)", borderRadius: "var(--radius)",
                    background: "var(--muted)", color: "var(--muted-foreground)",
                    cursor: "pointer", display: "flex", alignItems: "center", gap: "4px",
                  }}
                >
                  <X size={12} aria-hidden="true" /> Cancel
                </button>
                <button
                  type="button"
                  onClick={handleEditSave}
                  disabled={editSubmitting || !editContent.trim()}
                  aria-disabled={editSubmitting || !editContent.trim()}
                  style={{
                    padding: "6px 14px", fontSize: "12px",
                    border: "none", borderRadius: "var(--radius)",
                    background: "var(--primary)", color: "var(--primary-foreground)",
                    cursor: editSubmitting || !editContent.trim() ? "not-allowed" : "pointer",
                    opacity: editSubmitting || !editContent.trim() ? 0.6 : 1,
                    display: "flex", alignItems: "center", gap: "4px",
                  }}
                >
                  <Check size={12} aria-hidden="true" />
                  {editSubmitting ? "Saving..." : "Save (Shift+Enter)"}
                </button>
              </div>
            </>
          )}
        </div>
      );
    }

    // Idle prompt
    return (
      <button
        type="button"
        aria-label="Write a new journal entry"
        onClick={() => setShowForm(true)}
        style={{
          height: "100%", width: "100%",
          display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
          gap: "12px", background: "none", border: "none",
          cursor: "pointer", color: "var(--muted-foreground)",
        }}
      >
        <div style={{
          width: "48px", height: "48px", borderRadius: "50%",
          background: "var(--muted)", display: "flex",
          alignItems: "center", justifyContent: "center",
        }}>
          <Plus size={20} aria-hidden="true" style={{ color: "var(--muted-foreground)" }} />
        </div>
        <p style={{ fontSize: "13px", margin: 0 }}>Click to write a new entry</p>
        <p style={{ fontSize: "11px", margin: 0, opacity: 0.7 }}>or press Shift+N anywhere</p>
      </button>
    );
  }

  // -- Render --
  return (
    <div style={{
      position: "fixed", inset: 0, top: "64px",
      display: "flex", flexDirection: "column",
      // FIX: explicit height so flex children can fill properly
      height: "calc(100vh - 64px)",
    }}>

      {/* Book header band */}
      <div style={{
        background: "var(--card)",
        borderBottom: "0.5px solid var(--border)",
        padding: "0.75rem 2rem",
        display: "flex", alignItems: "center", gap: "1rem",
        flexShrink: 0,
      }}>
        <button
          type="button"
          onClick={() => router.push("/dashboard")}
          aria-label="Back to Dashboard"
          style={{
            display: "flex", alignItems: "center", gap: "4px",
            color: "var(--muted-foreground)", fontSize: "12px",
            background: "none", border: "none", cursor: "pointer", padding: 0,
          }}
        >
          <ChevronLeft size={14} aria-hidden="true" /> Dashboard
        </button>

        <div style={{ width: "0.5px", height: "16px", background: "var(--border)" }} aria-hidden="true" />

        {book.coverUrl && (
          <img
            src={book.coverUrl}
            alt={`Cover of ${book.title}`}
            style={{ width: "28px", height: "40px", objectFit: "cover", borderRadius: "2px" }}
          />
        )}

        <div>
          <p style={{
            fontFamily: "var(--font-display)", fontSize: "15px",
            fontWeight: 600, color: "var(--foreground)", margin: 0,
          }}>
            {book.title}
          </p>
          <p style={{ fontSize: "11px", color: "var(--muted-foreground)", margin: 0 }}>
            {book.author}
            {progress?.furthestChapter ? ` - Up to chapter ${progress.furthestChapter}` : ""}
          </p>
        </div>

        {/* Status dropdown */}
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <label
            htmlFor="book-status"
            style={{ fontSize: "10px", color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "0.06em" }}
          >
            Status
          </label>
          <select
            id="book-status"
            value={bookStatus}
            disabled={statusSaving}
            onChange={(e) => handleStatusChange(e.target.value as Status)}
            style={{
              fontSize: "11px", fontWeight: 500,
              color: "var(--primary)",
              background: "color-mix(in srgb, var(--primary) 10%, var(--card))",
              border: "0.5px solid var(--border)",
              borderRadius: "4px", padding: "3px 8px",
              cursor: "pointer", outline: "none",
              opacity: statusSaving ? 0.6 : 1,
            }}
          >
            {(Object.keys(STATUS_LABELS) as Status[]).map((s) => (
              <option key={s} value={s}>{STATUS_LABELS[s]}</option>
            ))}
          </select>
        </div>

        <div style={{ marginLeft: "auto" }}>
          <Button
            size="sm"
            onClick={() => { setSelectedEntry(null); setEditMode(false); setShowForm(true); }}
          >
            <Plus size={14} aria-hidden="true" style={{ marginRight: "4px" }} />
            New entry
          </Button>
        </div>
      </div>

      {/* Book spread */}
      {/* FIX: minHeight: 0 allows flex: 1 children to shrink correctly */}
      <div style={{ flex: 1, minHeight: 0, display: "flex", overflow: "hidden" }}>

        {/* Left page */}
        <div style={{
          flex: 1, background: "var(--card)",
          display: "flex", flexDirection: "column",
          overflow: "hidden",
          maxWidth: `calc(50% - ${SPINE_WIDTH / 2}px)`,
        }}>
          <div style={{ padding: "1rem 2rem 0.75rem", flexShrink: 0 }}>
            <h2 style={{
              fontFamily: "var(--font-display)", fontSize: "1rem",
              fontWeight: 600, color: "var(--primary)", margin: 0,
            }}>
              Entries
            </h2>
          </div>
          <div style={{ height: "1px", background: "var(--primary)", opacity: 0.4, flexShrink: 0 }} />
          <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "1rem 2rem" }}>
            {entries.length === 0 ? (
              <div style={{ textAlign: "center", padding: "3rem 0" }}>
                <BookOpen size={32} aria-hidden="true" style={{ color: "var(--muted-foreground)", margin: "0 auto 0.75rem" }} />
                <p style={{ color: "var(--muted-foreground)", fontSize: "13px" }}>
                  No entries yet -- write your first reflection
                </p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                {entries.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    aria-label={`${formatChapter(entry)}, ${formatDate(entry.createdAt)} -- click to expand`}
                    aria-pressed={selectedEntry?.id === entry.id}
                    onClick={() => {
                      setShowForm(false);
                      setEditMode(false);
                      setEditError("");
                      setSelectedEntry(entry);
                    }}
                    style={{
                      width: "100%", textAlign: "left",
                      background: selectedEntry?.id === entry.id ? "var(--muted)" : "var(--background)",
                      border: `0.5px solid ${selectedEntry?.id === entry.id ? "var(--primary)" : "var(--border)"}`,
                      borderRadius: "var(--radius)",
                      padding: "1rem", cursor: "pointer",
                      fontFamily: "inherit",
                      transition: "border-color 0.15s, background 0.15s",
                    }}
                  >
                    <div style={{
                      display: "flex", justifyContent: "space-between",
                      alignItems: "baseline", marginBottom: "6px",
                    }}>
                      <span style={{
                        fontSize: "11px", fontWeight: 500, color: "var(--primary)",
                        background: "color-mix(in srgb, var(--primary) 12%, transparent)",
                        borderRadius: "4px", padding: "2px 6px",
                      }}>
                        {formatChapter(entry)}
                      </span>
                      <span style={{ fontSize: "10px", color: "var(--muted-foreground)" }}>
                        {formatDate(entry.createdAt)}
                      </span>
                    </div>
                    <p style={{
                      fontSize: "13px", color: "var(--foreground)",
                      lineHeight: 1.6, margin: 0,
                      display: "-webkit-box",
                      WebkitLineClamp: 4,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                    }}>
                      {entry.content}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Spine -- FIX: alignSelf stretch + explicit height 100% */}
        <div
          aria-hidden="true"
          style={{
            width: `${SPINE_WIDTH}px`,
            flexShrink: 0,
            alignSelf: "stretch",
            background: "var(--primary)",
            opacity: 0.15,
            position: "relative",
          }}
        >
          <div style={{
            position: "absolute", top: 0, bottom: 0, left: "3px",
            width: "1px", background: "var(--primary)", opacity: 0.4,
          }} />
          <div style={{
            position: "absolute", top: 0, bottom: 0, right: "3px",
            width: "1px", background: "var(--primary)", opacity: 0.4,
          }} />
        </div>

        {/* Right page */}
        <div style={{
          flex: 1, background: "var(--card)",
          display: "flex", flexDirection: "column",
          overflow: "hidden",
          maxWidth: `calc(50% - ${SPINE_WIDTH / 2}px)`,
        }}>
          <div style={{ padding: "1rem 2rem 0.75rem", flexShrink: 0 }}>
            <h2 style={{
              fontFamily: "var(--font-display)", fontSize: "1rem",
              fontWeight: 600, color: "var(--primary)", margin: 0,
            }}>
              {showForm ? "New entry" : selectedEntry ? "Entry" : "Write"}
            </h2>
          </div>
          <div style={{ height: "1px", background: "var(--primary)", opacity: 0.4, flexShrink: 0 }} />
          <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "1rem 2rem" }}>
            {renderRightPage()}
          </div>
        </div>
      </div>
    </div>
  );
}
