"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight, BookOpen, EyeOff, Eye } from "lucide-react";
import { Spine } from "@/components/DashboardClient";
import FriendJournalSkeleton from "@/components/friends/FriendJournalSkeleton";
import { useFriendBooks, useFriendEntries, type FriendBook, type FriendEntry } from "@/hooks/useFriendJournal";

// -- Layout constants (mirrors the dashboard spread) --
const HALF = 8;            // 2 cols x 4 rows per page half
const PER_SPREAD = HALF * 2;
const MOBILE_PER_PAGE = 6;
const BOTTOM_NAV_HEIGHT = 56;

const statusColor: Record<string, string> = {
  READING: "var(--accent)", READ: "var(--primary)",
  TBR: "var(--muted-foreground)", DNF: "var(--muted-foreground)",
};
const statusBg: Record<string, string> = {
  READING: "color-mix(in srgb,var(--accent) 15%,transparent)",
  READ: "color-mix(in srgb,var(--primary) 15%,transparent)",
  TBR: "color-mix(in srgb,var(--muted-foreground) 12%,transparent)",
  DNF: "color-mix(in srgb,var(--muted-foreground) 12%,transparent)",
};

function useIsMobile(bp = 768) {
  const [m, setM] = useState<boolean | null>(null);
  useEffect(() => {
    const chk = () => setM(window.innerWidth < bp);
    chk();
    window.addEventListener("resize", chk);
    return () => window.removeEventListener("resize", chk);
  }, [bp]);
  return m;
}

function formatProgress(book: FriendBook): string {
  if (book.status === "TBR" || !book.furthest_chapter) return "Not started";
  if (book.furthest_chapter === 9999) return "Whole book";
  return `Up to ch. ${book.furthest_chapter}`;
}

function formatDate(date: string): string {
  const d = new Date(date);
  const diffHrs = Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHrs / 24);
  if (diffHrs < 1) return "just now";
  if (diffHrs < 24) return `${diffHrs}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatChapterLabel(e: FriendEntry): string {
  if (e.scope === "WHOLE_BOOK" || e.chapter_end === 9999) return "Whole book";
  if (e.chapter_start === e.chapter_end) return `Ch. ${e.chapter_start}`;
  return `Ch. ${e.chapter_start}-${e.chapter_end}`;
}

// -- Read-only book card (mirrors the dashboard BookCard, no status editing) --

function ReadOnlyBookCard({ book, onOpen }: { book: FriendBook; onOpen: () => void }) {
  const [hov, setHov] = useState(false);
  const status = book.status ?? "TBR";
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Open ${book.title}`}
      onClick={onOpen}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); } }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        background: "var(--background)",
        border: `0.5px solid ${hov ? "var(--primary)" : "var(--border)"}`,
        borderRadius: "var(--radius)",
        padding: "0.75rem",
        transform: hov ? "translateY(-2px)" : "translateY(0)",
        transition: "border-color 0.2s,transform 0.2s",
        display: "flex", flexDirection: "column",
        cursor: "pointer", userSelect: "none",
      }}
    >
      <div style={{ width: "100%", height: "3px", borderRadius: "2px", background: statusColor[status], marginBottom: "8px", flexShrink: 0 }} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "4px", gap: "6px" }}>
        <p style={{ fontFamily: "var(--font-display)", fontSize: "15px", fontWeight: 700, color: "var(--foreground)", lineHeight: 1.2, flex: 1, margin: 0 }}>
          {book.title}
        </p>
        {/* Read-only status badge (not a button) */}
        <span style={{ fontSize: "9px", fontWeight: 600, letterSpacing: "0.07em", color: statusColor[status], background: statusBg[status], borderRadius: "4px", padding: "3px 6px", whiteSpace: "nowrap", flexShrink: 0 }}>
          {status}
        </span>
      </div>
      <p style={{ fontSize: "12px", color: "var(--muted-foreground)", margin: "0 0 4px", fontStyle: "italic" }}>
        {book.author}
      </p>
      <p style={{ fontSize: "12px", color: "var(--primary)", margin: 0, fontWeight: 500 }}>
        {formatProgress(book)} · {book.public_entry_count} {book.public_entry_count === 1 ? "entry" : "entries"}
      </p>
    </div>
  );
}

// -- Book grid (the dashboard-style spread / mobile grid) --

function BookGrid({
  books, isMobile, title, onOpenBook,
}: {
  books: FriendBook[];
  isMobile: boolean;
  title: string;
  onOpenBook: (book: FriendBook) => void;
}) {
  const [page, setPage] = useState(0);

  const perPage = isMobile ? MOBILE_PER_PAGE : PER_SPREAD;
  const totalPages = Math.max(1, Math.ceil(books.length / perPage));
  // Derive a clamped page so a smaller page count (e.g. after a layout switch)
  // never leaves us past the end — no effect/setState needed.
  const safePage = Math.min(page, totalPages - 1);

  const slice = books.slice(safePage * perPage, safePage * perPage + perPage);
  const left = slice.slice(0, HALF);
  const right = slice.slice(HALF);

  const gridCell = (book: FriendBook) => (
    <ReadOnlyBookCard key={book.id} book={book} onOpen={() => onOpenBook(book)} />
  );

  const heading = (
    <h1 style={{ fontFamily: "var(--font-display)", fontSize: isMobile ? "1rem" : "clamp(1rem,2vw,1.5rem)", fontWeight: 700, color: "var(--primary)", margin: 0 }}>
      {title}
    </h1>
  );

  if (isMobile) {
    // Rows sized to fill the page (never fewer than 3) so cards stretch like the
    // dashboard instead of collapsing to their content height.
    const mobileRows = Math.max(3, Math.ceil(slice.length / 2));
    return (
      <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "var(--card)", overflow: "hidden" }}>
        <div style={{ padding: "0.75rem 1rem 0.5rem", flexShrink: 0, display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
          {heading}
          {totalPages > 1 && <span style={{ fontSize: "10px", color: "var(--muted-foreground)" }}>{safePage + 1} / {totalPages}</span>}
        </div>
        <div style={{ height: "1px", background: "var(--primary)", opacity: 0.4, flexShrink: 0 }} />
        <div style={{ flex: 1, minHeight: 0, overflow: "hidden", padding: "0.75rem 1rem", display: "grid", gridTemplateColumns: "1fr 1fr", gridTemplateRows: `repeat(${mobileRows}, minmax(0, 1fr))`, gap: "0.6rem", alignContent: "stretch" }}>
          {slice.map(gridCell)}
        </div>
        {totalPages > 1 && <Pager page={safePage} totalPages={totalPages} onPage={setPage} bordered />}
      </div>
    );
  }

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <div style={{ flex: 1, minHeight: 0, display: "flex", overflow: "hidden", position: "relative" }}>
        {/* Left page */}
        <div style={{ flex: 1, background: "var(--card)", display: "flex", flexDirection: "column", minWidth: 0 }}>
          <div style={{ padding: "1rem 2rem 0.75rem", flexShrink: 0 }}>{heading}</div>
          <div style={{ height: "1px", background: "var(--primary)", opacity: 0.4, flexShrink: 0 }} />
          <div style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
            <div style={{ height: "100%", padding: "1rem 2rem", boxSizing: "border-box", display: "grid", gridTemplateColumns: "1fr 1fr", gridTemplateRows: "repeat(4, 1fr)", gap: "0.6rem" }}>
              {left.map(gridCell)}
            </div>
          </div>
        </div>

        <Spine currentPage={safePage} totalPages={totalPages} />

        {/* Right page */}
        <div style={{ flex: 1, background: "var(--card)", display: "flex", flexDirection: "column", minWidth: 0 }}>
          <div style={{ padding: "1rem 2rem 0.75rem", visibility: "hidden", flexShrink: 0, fontSize: "clamp(1rem,2vw,1.5rem)", fontWeight: 700 }} aria-hidden="true">.</div>
          <div style={{ height: "1px", background: "var(--primary)", opacity: 0.4, flexShrink: 0 }} />
          <div style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
            <div style={{ height: "100%", padding: "1rem 2rem", boxSizing: "border-box", display: "grid", gridTemplateColumns: "1fr 1fr", gridTemplateRows: "repeat(4, 1fr)", gap: "0.6rem" }}>
              {right.map(gridCell)}
            </div>
          </div>
        </div>

        {totalPages > 1 && (
          <div style={{ position: "absolute", bottom: "1rem", left: 0, right: 0, display: "flex", justifyContent: "space-between", alignItems: "center", paddingInline: "1.5rem", pointerEvents: "none" }}>
            <PagerButton dir="prev" disabled={safePage === 0} onClick={() => setPage(Math.max(0, safePage - 1))} />
            <div style={{ display: "flex", gap: "6px" }}>
              {Array.from({ length: totalPages }).map((_, i) => (
                <div key={i} style={{ width: "6px", height: "6px", borderRadius: "50%", background: i === safePage ? "var(--primary)" : "var(--border)" }} />
              ))}
            </div>
            <PagerButton dir="next" disabled={safePage >= totalPages - 1} onClick={() => setPage(Math.min(totalPages - 1, safePage + 1))} />
          </div>
        )}
      </div>
    </div>
  );
}

function PagerButton({ dir, disabled, onClick }: { dir: "prev" | "next"; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={dir === "prev" ? "Previous page" : "Next page"}
      style={{ pointerEvents: "all", display: "flex", alignItems: "center", gap: "4px", padding: "6px 12px", fontSize: "11px", border: "0.5px solid var(--border)", borderRadius: "var(--radius)", background: "var(--card)", fontFamily: "inherit", boxShadow: "0 2px 8px rgba(0,0,0,0.08)", color: disabled ? "var(--muted-foreground)" : "var(--primary)", cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.4 : 1 }}
    >
      {dir === "prev" ? <><ChevronLeft size={13} aria-hidden="true" /> Prev</> : <>Next <ChevronRight size={13} aria-hidden="true" /></>}
    </button>
  );
}

function Pager({ page, totalPages, onPage, bordered }: { page: number; totalPages: number; onPage: (p: number) => void; bordered?: boolean }) {
  return (
    <div style={{ padding: "0.5rem 1rem", flexShrink: 0, display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: bordered ? "0.5px solid var(--border)" : undefined }}>
      <PagerButton dir="prev" disabled={page === 0} onClick={() => onPage(Math.max(0, page - 1))} />
      <div style={{ display: "flex", gap: "6px" }}>
        {Array.from({ length: totalPages }).map((_, i) => (
          <div key={i} style={{ width: "6px", height: "6px", borderRadius: "50%", background: i === page ? "var(--primary)" : "var(--border)" }} />
        ))}
      </div>
      <PagerButton dir="next" disabled={page >= totalPages - 1} onClick={() => onPage(Math.min(totalPages - 1, page + 1))} />
    </div>
  );
}

// -- Read-only per-book journal (mirrors JournalPageClient, no editing) --

function ReadingPane({ entry, revealed, onReveal }: { entry: FriendEntry | null; revealed: boolean; onReveal: () => void }) {
  if (!entry) {
    return (
      <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", padding: "2rem", gap: "0.75rem" }}>
        <BookOpen size={32} aria-hidden="true" style={{ color: "var(--muted-foreground)" }} />
        <p style={{ fontSize: "13px", color: "var(--muted-foreground)", margin: 0 }}>Click on an entry to read it</p>
      </div>
    );
  }
  const tags = entry.spoiler_tags ?? [];
  if (entry.spoilered && !revealed) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "12px", padding: "0.5rem 0" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <EyeOff size={14} aria-hidden="true" style={{ color: "var(--muted-foreground)" }} />
          <span style={{ fontSize: "13px", color: "var(--muted-foreground)", fontStyle: "italic" }}>
            Possible spoiler -- you have not reached {formatChapterLabel(entry)} yet
          </span>
        </div>
        {tags.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
            {tags.map((t) => (
              <span key={t} style={{ fontSize: "11px", padding: "3px 8px", background: "color-mix(in srgb, var(--primary) 12%, transparent)", color: "var(--primary)", borderRadius: "4px", fontStyle: "italic" }}>{t}</span>
            ))}
          </div>
        )}
        <button
          type="button"
          onClick={onReveal}
          style={{ alignSelf: "flex-start", display: "flex", alignItems: "center", gap: "4px", padding: "6px 12px", fontSize: "12px", border: "none", borderRadius: "var(--radius)", background: "var(--primary)", color: "var(--primary-foreground)", cursor: "pointer", fontFamily: "inherit" }}
        >
          <Eye size={13} aria-hidden="true" /> Read anyway
        </button>
      </div>
    );
  }
  return (
    <p style={{ fontSize: "14px", color: "var(--foreground)", lineHeight: 1.8, margin: 0, fontFamily: "var(--font-serif)", whiteSpace: "pre-wrap", overflowWrap: "break-word", wordBreak: "break-word" }}>
      {entry.content}
    </p>
  );
}

function EntryRow({ entry, selected, onSelect }: { entry: FriendEntry; selected: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      style={{ width: "100%", textAlign: "left", background: selected ? "var(--muted)" : "var(--background)", border: `0.5px solid ${selected ? "var(--primary)" : "var(--border)"}`, borderRadius: "var(--radius)", padding: "1rem", cursor: "pointer", fontFamily: "inherit", transition: "border-color 0.15s, background 0.15s" }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "6px" }}>
        <span style={{ fontSize: "11px", fontWeight: 500, color: "var(--primary)", background: "color-mix(in srgb, var(--primary) 12%, transparent)", borderRadius: "4px", padding: "2px 6px" }}>
          {formatChapterLabel(entry)}
        </span>
        <span style={{ fontSize: "10px", color: "var(--muted-foreground)" }}>{formatDate(entry.created_at)}</span>
      </div>
      {entry.spoilered ? (
        <p style={{ fontSize: "12px", color: "var(--muted-foreground)", margin: 0, fontStyle: "italic", display: "flex", alignItems: "center", gap: "5px" }}>
          <EyeOff size={12} aria-hidden="true" /> Hidden until you reach {formatChapterLabel(entry)}
        </p>
      ) : (
        <p style={{ fontSize: "13px", color: "var(--foreground)", lineHeight: 1.6, margin: 0, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
          {entry.content}
        </p>
      )}
    </button>
  );
}

function BookJournal({
  userId, book, isMobile, onBack,
}: {
  userId: string;
  book: FriendBook;
  isMobile: boolean;
  onBack: () => void;
}) {
  const { data: entries = [], isLoading } = useFriendEntries(userId, book.id);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const selected = entries.find((e) => e.id === selectedId) ?? null;

  function reveal(id: string) { setRevealed((s) => new Set(s).add(id)); }

  const header = (
    <div style={{ background: "var(--card)", borderBottom: "0.5px solid var(--border)", padding: "0.75rem 1.25rem", display: "flex", alignItems: "center", gap: "0.75rem", flexShrink: 0 }}>
      <button type="button" onClick={onBack} aria-label="Back to books" style={{ display: "flex", alignItems: "center", gap: "4px", color: "var(--muted-foreground)", fontSize: "12px", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
        <ChevronLeft size={14} aria-hidden="true" /> Books
      </button>
      <div style={{ width: "0.5px", height: "16px", background: "var(--border)" }} aria-hidden="true" />
      {book.cover_url && (
        <Image src={book.cover_url} alt="" width={28} height={40} style={{ objectFit: "cover", borderRadius: "2px", flexShrink: 0 }} />
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontFamily: "var(--font-display)", fontSize: "14px", fontWeight: 600, color: "var(--foreground)", margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{book.title}</p>
        <p style={{ fontSize: "11px", color: "var(--muted-foreground)", margin: 0 }}>{book.author}</p>
      </div>
    </div>
  );

  const entriesList = (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
      {isLoading ? (
        [0, 1, 2].map((i) => <div key={i} style={{ height: "80px", background: "var(--muted)", borderRadius: "var(--radius)", opacity: 0.5, animation: "pulse 1.5s ease-in-out infinite" }} />)
      ) : entries.length === 0 ? (
        <p style={{ fontSize: "13px", color: "var(--muted-foreground)" }}>No public entries for this book.</p>
      ) : (
        entries.map((entry) => (
          <EntryRow key={entry.id} entry={entry} selected={selectedId === entry.id} onSelect={() => setSelectedId(entry.id)} />
        ))
      )}
    </div>
  );

  return (
    <div style={{ position: "fixed", top: "64px", left: 0, right: 0, bottom: isMobile ? `${BOTTOM_NAV_HEIGHT}px` : 0, display: "flex", flexDirection: "column" }}>
      {header}

      {isMobile ? (
        <>
          <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", background: "var(--card)", overflow: "hidden" }}>
            <div style={{ padding: "1rem 1.25rem 0.75rem", flexShrink: 0 }}>
              <h2 style={{ fontFamily: "var(--font-display)", fontSize: "1rem", fontWeight: 600, color: "var(--primary)", margin: 0 }}>Entries</h2>
            </div>
            <div style={{ height: "1px", background: "var(--primary)", opacity: 0.4, flexShrink: 0 }} />
            <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "1rem 1.25rem", paddingBottom: `${BOTTOM_NAV_HEIGHT + 16}px` }}>
              {entriesList}
            </div>
          </div>

          {selected && (
            <div role="dialog" aria-modal="true" aria-label="Journal entry" style={{ position: "fixed", inset: 0, top: "64px", zIndex: 50, display: "flex", flexDirection: "column", background: "var(--card)", height: `calc(100dvh - 64px - ${BOTTOM_NAV_HEIGHT}px)` }}>
              <div style={{ padding: "1rem 1.25rem", borderBottom: "0.5px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
                <h2 style={{ fontFamily: "var(--font-display)", fontSize: "1rem", fontWeight: 600, color: "var(--primary)", margin: 0 }}>{formatChapterLabel(selected)}</h2>
                <button type="button" aria-label="Close entry" onClick={() => setSelectedId(null)} style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "32px", height: "32px", border: "0.5px solid var(--border)", borderRadius: "var(--radius)", background: "var(--muted)", color: "var(--muted-foreground)", cursor: "pointer" }}>
                  <ChevronLeft size={16} aria-hidden="true" />
                </button>
              </div>
              <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "1.25rem", paddingBottom: `${BOTTOM_NAV_HEIGHT + 16}px` }}>
                <ReadingPane entry={selected} revealed={revealed.has(selected.id)} onReveal={() => reveal(selected.id)} />
              </div>
            </div>
          )}
        </>
      ) : (
        <div style={{ flex: 1, minHeight: 0, display: "flex", overflow: "hidden" }}>
          <div style={{ flex: 1, background: "var(--card)", display: "flex", flexDirection: "column", overflow: "hidden", maxWidth: "calc(50% - 16px)" }}>
            <div style={{ padding: "1rem 2rem 0.75rem", flexShrink: 0 }}>
              <h2 style={{ fontFamily: "var(--font-display)", fontSize: "1rem", fontWeight: 600, color: "var(--primary)", margin: 0 }}>Entries</h2>
            </div>
            <div style={{ height: "1px", background: "var(--primary)", opacity: 0.4, flexShrink: 0 }} />
            <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "1rem 2rem" }}>{entriesList}</div>
          </div>

          <Spine currentPage={0} totalPages={0} />

          <div style={{ flex: 1, background: "var(--card)", display: "flex", flexDirection: "column", overflow: "hidden", maxWidth: "calc(50% - 16px)" }}>
            <div style={{ padding: "1rem 2rem 0.75rem", flexShrink: 0 }}>
              <h2 style={{ fontFamily: "var(--font-display)", fontSize: "1rem", fontWeight: 600, color: "var(--primary)", margin: 0 }}>
                {selected ? formatChapterLabel(selected) : "Read"}
              </h2>
            </div>
            <div style={{ height: "1px", background: "var(--primary)", opacity: 0.4, flexShrink: 0 }} />
            <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "1rem 2rem" }}>
              <ReadingPane entry={selected} revealed={selected ? revealed.has(selected.id) : false} onReveal={() => selected && reveal(selected.id)} />
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes pulse { 0%, 100% { opacity: 0.5; } 50% { opacity: 0.8; } }`}</style>
    </div>
  );
}

// -- Main --

export default function FriendJournalClient({
  userId, name, isSelf,
}: {
  userId: string;
  name: string | null;
  displayName: string | null;
  discriminator: string | null;
  isSelf: boolean;
}) {
  const isMobile = useIsMobile();
  const { data: books = [], isLoading, isError } = useFriendBooks(userId);
  const [selectedBook, setSelectedBook] = useState<FriendBook | null>(null);

  const title = isSelf ? "Your public journal" : `${name ?? "Reader"}'s public journal`;

  // Gate on layout resolution to avoid painting the wrong layout first frame.
  if (isMobile === null) return null;

  if (selectedBook) {
    return <BookJournal userId={userId} book={selectedBook} isMobile={isMobile} onBack={() => setSelectedBook(null)} />;
  }

  if (isLoading) {
    return <FriendJournalSkeleton title={title} />;
  }

  if (isError) {
    return (
      <div style={{ maxWidth: "680px", margin: "0 auto", padding: "4rem 1.5rem", textAlign: "center" }}>
        <p style={{ fontSize: "14px", color: "var(--destructive)", margin: 0 }}>Couldn&apos;t load this journal.</p>
      </div>
    );
  }

  if (books.length === 0) {
    return (
      <div style={{ maxWidth: "680px", margin: "0 auto", padding: "2rem 1.5rem" }}>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: "1.5rem", fontWeight: 700, color: "var(--primary)", margin: "0 0 1.5rem" }}>{title}</h1>
        <div style={{ textAlign: "center", padding: "3rem 1rem" }}>
          <BookOpen size={36} aria-hidden="true" style={{ color: "var(--muted-foreground)", margin: "0 auto 0.75rem", display: "block" }} />
          <p style={{ fontSize: "14px", color: "var(--muted-foreground)", margin: 0 }}>
            {isSelf ? "You have no public entries yet." : `${name ?? "This reader"} has no public entries yet.`}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: "fixed", top: "64px", left: 0, right: 0, bottom: isMobile ? `${BOTTOM_NAV_HEIGHT}px` : 0, overflow: "hidden" }}>
      <BookGrid books={books} isMobile={isMobile} title={title} onOpenBook={setSelectedBook} />
    </div>
  );
}
