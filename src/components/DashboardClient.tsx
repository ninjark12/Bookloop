"use client";

import { useEffect, useRef, useState } from "react";
import { gsap } from "gsap";
import { useRouter } from "next/navigation";
import { Plus, X, ChevronLeft, ChevronRight } from "lucide-react";

// -- Layout ------------------------------------------------------------------
// Each page half is a 2-col x 3-row grid (HALF = 6 slots).
// The grid always fills the full page height via gridTemplateRows: repeat(3,1fr).
// Page 0 gives its top-left slot to AddBookCard, holding 11 books.
// Pages 1+ hold 12 books each (6 per half).

const COLS = 2;
const ROWS = 4;
const HALF = COLS * ROWS;       // 6 per page half
const PER_SPREAD = HALF * 2;          // 12 per spread
const PAGE_0_BOOKS = PER_SPREAD - 1;    // 11 (slot 0 = AddBookCard)

const SPINE_WIDTH = 32;

// -- Types -------------------------------------------------------------------

type Status = "READING" | "READ" | "TBR" | "DNF";

type Book = {
  id: string;
  title: string;
  author: string;
  coverUrl: string | null;
  status: Status;
  furthestChapter: number | null;
  // Timestamp from reading_progress.created_at - used to sort newest-first
  // so newly added books land directly beside the AddBookCard at slot 1.
  addedAt?: string | null;
};

type Props = { books: Book[]; streak: number; userName?: string | null };

type PageItem = { type: "book"; book: Book } | { type: "add" };

const STATUS_LABELS: Record<Status, string> = {
  READING: "Reading", READ: "Read", TBR: "To be read", DNF: "Did not finish",
};

const statusColor: Record<Status, string> = {
  READING: "var(--accent)", READ: "var(--primary)",
  TBR: "var(--muted-foreground)", DNF: "var(--muted-foreground)",
};

const statusBg: Record<Status, string> = {
  READING: "color-mix(in srgb,var(--accent) 15%,transparent)",
  READ: "color-mix(in srgb,var(--primary) 15%,transparent)",
  TBR: "color-mix(in srgb,var(--muted-foreground) 12%,transparent)",
  DNF: "color-mix(in srgb,var(--muted-foreground) 12%,transparent)",
};

// -- Revisit -----------------------------------------------------------------

const REVISIT_MS = 24 * 60 * 60 * 1000;
const VISIT_KEY = "bookloop_last_visit";
const REVISIT_KEY = "bookloop_session_active";
const TALLY_LIMIT = 15;

function shouldShowNotebook() {
  if (typeof window === "undefined") return false;
  const raw = localStorage.getItem(VISIT_KEY);
  const rawRevisit = sessionStorage.getItem(REVISIT_KEY);
  if (!rawRevisit) return true;
  if (!raw) return true;
  return Date.now() - parseInt(raw, 10) > REVISIT_MS;
}
function recordVisit() {
  sessionStorage.setItem("bookloop_session_active", "1");
  localStorage.setItem(VISIT_KEY, Date.now().toString());
}

// -- Helpers -----------------------------------------------------------------

function formatProgress(book: Book): string {
  if (book.status === "TBR" || !book.furthestChapter) return "Not started";
  if (book.furthestChapter === 9999) return "Whole book";
  return `Up to ch. ${book.furthestChapter}`;
}

function useIsMobile(bp = 768) {
  const [m, setM] = useState(false);
  useEffect(() => {
    const chk = () => setM(window.innerWidth < bp);
    chk();
    window.addEventListener("resize", chk);
    return () => window.removeEventListener("resize", chk);
  }, [bp]);
  return m;
}

function tallyDuration(i: number) { return Math.max(0.06, 0.4 * Math.pow(0.72, i)); }

function tallyGroups(n: number) {
  const g: number[] = [];
  let r = Math.min(n, TALLY_LIMIT);
  while (r > 0) { g.push(Math.min(r, 5)); r -= 5; }
  return g;
}

// -- Pagination --------------------------------------------------------------
//
// Page 0 :  [AddBook, B0..B4]  [B5..B10]   <- 11 books, left fills first
// Page 1+:  [B11..B16]         [B17..B22]  <- 12 books per spread

function getPage(
  books: Book[],
  page: number
): { left: PageItem[]; right: PageItem[]; totalPages: number } {
  const n = books.length;
  const overflow = Math.max(0, n - PAGE_0_BOOKS);
  const totalPages = 1 + Math.ceil(overflow / PER_SPREAD);

  if (page === 0) {
    const left: PageItem[] = [
      { type: "add" },
      ...books.slice(0, HALF - 1).map((b): PageItem => ({ type: "book", book: b })),
    ];
    const right: PageItem[] = books
      .slice(HALF - 1, PAGE_0_BOOKS)
      .map((b): PageItem => ({ type: "book", book: b }));
    return { left, right, totalPages };
  }

  const start = PAGE_0_BOOKS + (page - 1) * PER_SPREAD;
  const slice = books.slice(start, start + PER_SPREAD);
  const left = slice.slice(0, HALF).map((b): PageItem => ({ type: "book", book: b }));
  const right = slice.slice(HALF).map((b): PageItem => ({ type: "book", book: b }));
  return { left, right, totalPages };
}

// -- Status modal ------------------------------------------------------------

function StatusModal({ book, onClose, onSelect, onDelete }: {
  book: Book;
  onClose: () => void;
  onSelect: (id: string, s: Status) => void;
  onDelete: (id: string) => void;
}) {
  const [del, setDel] = useState(false);
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  return (
    <div role="dialog" aria-modal="true" aria-label={`Manage ${book.title}`}
      style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.4)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: "var(--card)", border: "0.5px solid var(--border)", borderRadius: "var(--radius)", padding: "1.5rem", minWidth: "260px", boxShadow: "0 8px 32px rgba(0,0,0,0.18)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1rem" }}>
          <div>
            <p style={{ fontFamily: "var(--font-display)", fontSize: "14px", fontWeight: 600, color: "var(--foreground)", margin: 0 }}>{book.title}</p>
            <p style={{ fontSize: "11px", color: "var(--muted-foreground)", margin: "2px 0 0" }}>Change reading status</p>
          </div>
          <button type="button" aria-label="Close" onClick={onClose}
            style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "26px", height: "26px", border: "0.5px solid var(--border)", borderRadius: "var(--radius)", background: "var(--muted)", color: "var(--muted-foreground)", cursor: "pointer" }}>
            <X size={12} aria-hidden="true" />
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginBottom: "1rem" }}>
          {(Object.keys(STATUS_LABELS) as Status[]).map((s) => {
            const active = book.status === s;
            return (
              <button key={s} type="button" aria-pressed={active}
                onClick={() => { onSelect(book.id, s); onClose(); }}
                style={{ width: "100%", textAlign: "left", padding: "8px 12px", border: `0.5px solid ${active ? "var(--primary)" : "var(--border)"}`, borderRadius: "var(--radius)", background: active ? "color-mix(in srgb,var(--primary) 10%,var(--card))" : "var(--background)", color: active ? "var(--primary)" : "var(--foreground)", cursor: "pointer", fontSize: "13px", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span>{STATUS_LABELS[s]}</span>
                {active && <span style={{ fontSize: "9px", fontWeight: 600, letterSpacing: "0.06em", color: "var(--primary)", background: "color-mix(in srgb,var(--primary) 12%,transparent)", borderRadius: "3px", padding: "1px 5px" }}>current</span>}
              </button>
            );
          })}
        </div>

        <div style={{ height: "0.5px", background: "var(--border)", marginBottom: "1rem" }} />

        {!del ? (
          <button type="button" onClick={() => setDel(true)}
            style={{ width: "100%", textAlign: "left", padding: "8px 12px", border: "0.5px solid var(--border)", borderRadius: "var(--radius)", background: "var(--background)", color: "var(--destructive)", cursor: "pointer", fontSize: "13px", fontFamily: "inherit" }}>
            Remove from list
          </button>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <p style={{ fontSize: "12px", color: "var(--muted-foreground)", margin: 0 }}>This will also delete all journal entries. Are you sure?</p>
            <div style={{ display: "flex", gap: "6px" }}>
              <button type="button" onClick={() => setDel(false)}
                style={{ flex: 1, padding: "7px", fontSize: "12px", border: "0.5px solid var(--border)", borderRadius: "var(--radius)", background: "var(--muted)", color: "var(--muted-foreground)", cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
              <button type="button" onClick={() => { onDelete(book.id); onClose(); }}
                style={{ flex: 1, padding: "7px", fontSize: "12px", border: "none", borderRadius: "var(--radius)", background: "var(--destructive)", color: "#fff", cursor: "pointer", fontFamily: "inherit" }}>Yes, remove</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// -- Cards -------------------------------------------------------------------

function BookCard({ book, onNavigate, onStatusClick }: {
  book: Book;
  onNavigate: () => void;
  onStatusClick: (e: React.MouseEvent) => void;
}) {
  const [hov, setHov] = useState(false);
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Open journal for ${book.title}`}
      onClick={onNavigate}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onNavigate(); } }}
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
        cursor: "pointer",
        userSelect: "none",
      }}
    >
      <div style={{ width: "100%", height: "3px", borderRadius: "2px", background: statusColor[book.status], marginBottom: "8px", flexShrink: 0 }} />

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "4px", gap: "6px" }}>
        <p style={{ fontFamily: "var(--font-display)", fontSize: "15px", fontWeight: 700, color: "var(--foreground)", lineHeight: 1.25, flex: 1, margin: 0 }}>
          {book.title}
        </p>
        {/* stopPropagation prevents the card click from firing when changing status */}
        <button
          type="button"
          aria-label={`Status: ${STATUS_LABELS[book.status]}. Click to change.`}
          onClick={(e) => { e.stopPropagation(); onStatusClick(e); }}
          style={{
            fontSize: "9px", fontWeight: 600, letterSpacing: "0.07em",
            color: statusColor[book.status], background: statusBg[book.status],
            borderRadius: "4px", padding: "3px 6px", border: "none",
            cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0,
          }}
        >
          {book.status}
        </button>
      </div>

      <p style={{ fontSize: "12px", color: "var(--muted-foreground)", margin: "0 0 4px", fontStyle: "italic" }}>
        {book.author}
      </p>
      <p style={{ fontSize: "12px", color: "var(--primary)", margin: 0, fontWeight: 500 }}>
        {formatProgress(book)}
      </p>
    </div>
  );
}

function AddCard({ onClick }: { onClick: () => void }) {
  const [hov, setHov] = useState(false);
  return (
    <button type="button" onClick={onClick} aria-label="Add a book"
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ width: "100%", height: "100%", fontFamily: "inherit", background: "var(--background)", border: `0.5px dashed ${hov ? "var(--primary)" : "var(--border)"}`, borderRadius: "var(--radius)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "8px", transform: hov ? "translateY(-2px)" : "translateY(0)", transition: "border-color 0.2s,transform 0.2s", cursor: "pointer" }}>
      <div style={{ width: "28px", height: "28px", borderRadius: "50%", background: "var(--muted)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <Plus size={14} aria-hidden="true" style={{ color: "var(--muted-foreground)" }} />
      </div>
      <p style={{ fontSize: "11px", color: "var(--muted-foreground)", margin: 0 }}>Add a book</p>
    </button>
  );
}

// -- Tally band --------------------------------------------------------------

function TallyBand({ streak, refs }: {
  streak: number;
  refs: React.MutableRefObject<SVGLineElement[]>;
}) {
  const groups = tallyGroups(streak);
  let idx = 0;
  return (
    <div style={{ background: "var(--tally-paper)", borderBottom: "0.5px solid var(--border)", padding: "10px 1.5rem", display: "flex", alignItems: "center", gap: "4px", flexShrink: 0 }}
      aria-label={`Reading streak: ${streak} day${streak !== 1 ? "s" : ""}`}>
      <span aria-hidden="true" style={{ fontSize: "9px", letterSpacing: "0.14em", color: "var(--muted-foreground)", textTransform: "uppercase", marginRight: "12px", whiteSpace: "nowrap" }}>Reading streak</span>
      <div style={{ display: "flex", alignItems: "center", gap: "10px" }} aria-hidden="true">
        {groups.map((count, gi) => {
          const tals: number[] = [];
          for (let i = 0; i < count; i++) tals.push(idx++);
          return (
            <svg key={gi} viewBox="0 0 52 52" style={{ width: `${count === 5 ? 52 : count * 12}px`, height: "32px" }}>
              {tals.map((ti, i) =>
                i === 4
                  ? <line key={i} ref={(el) => { if (el) refs.current[ti] = el; }} x1="4" y1="48" x2="48" y2="4" stroke="var(--tally-stroke)" strokeWidth="2.5" strokeLinecap="round" />
                  : <line key={i} ref={(el) => { if (el) refs.current[ti] = el; }} x1={8 + i * 11} y1="4" x2={8 + i * 11} y2="48" stroke="var(--tally-stroke)" strokeWidth="2.5" strokeLinecap="round" />
              )}
            </svg>
          );
        })}
        {streak > TALLY_LIMIT && (
          <span style={{ fontSize: "15px", fontWeight: 500, color: "var(--tally-stroke)", fontFamily: "var(--font-display)" }}>x{streak}</span>
        )}
      </div>
    </div>
  );
}

// -- Page grid ---------------------------------------------------------------
// Two-div approach:
//   outer  -- flex child, clips overflow, provides the bounded height
//   inner  -- grid with height:100% so gridTemplateRows:repeat(3,1fr)
//             correctly divides the BOUNDED height rather than intrinsic height.
// This prevents the grid from overflowing and dragging the spine with it.

function PageGrid({ items, booksVisible, padding = "1rem 2rem", onNavigate, onStatusClick, onAddBook }: {
  items: PageItem[];
  booksVisible: boolean;
  padding?: string;
  onNavigate: (id: string) => void;
  onStatusClick: (book: Book, e: React.MouseEvent) => void;
  onAddBook: () => void;
}) {
  return (
    <div style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
      <div style={{
        height: "100%",
        padding,
        boxSizing: "border-box",
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gridTemplateRows: `repeat(${ROWS}, 1fr)`,
        gap: "0.6rem",
        opacity: booksVisible ? 1 : 0,
        transition: "opacity 0.4s ease",
      }}>
        {items.map((item) =>
          item.type === "add"
            ? <AddCard key="add" onClick={onAddBook} />
            : <BookCard key={item.book.id} book={item.book}
              onNavigate={() => onNavigate(item.book.id)}
              onStatusClick={(e) => onStatusClick(item.book, e)} />
        )}
      </div>
    </div>
  );
}

// -- Notebook ----------------------------------------------------------------

function Notebook({ isMobile, notebookRef, bookSpreadRef, onClick, userName }: {
  isMobile: boolean;
  notebookRef: React.RefObject<HTMLButtonElement | null>;
  bookSpreadRef: React.RefObject<HTMLDivElement | null>;
  onClick: () => void;
  userName?: string | null;
}) {
  const w = isMobile ? "min(300px,88vw)" : "min(520px,75vw)";
  const h = isMobile ? "min(440px,72vh)" : "min(760px,78vh)";
  return (
    <>
      <div ref={bookSpreadRef} style={{ position: "fixed", top: "64px", bottom: isMobile ? "56px" : 0, left: 0, right: 0, zIndex: 1, opacity: 0, background: "var(--card)" }} />
      <div style={{ position: "fixed", inset: 0, zIndex: 10, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--background)" }}>
        <div style={{ position: "relative", width: w, height: h }}>
          <button type="button" ref={notebookRef} onClick={onClick} aria-label="Open your reading journal"
            style={{ position: "absolute", inset: 0, background: "var(--card)", border: "0.5px solid var(--border)", borderRadius: "6px 20px 20px 6px", transform: "rotate(-3deg)", display: "flex", flexDirection: "column", overflow: "hidden", transition: "box-shadow 0.2s", width: "100%", fontFamily: "inherit" }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 16px 56px rgba(107,76,42,0.2)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.boxShadow = "none"; }}>
            <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: "clamp(20px,4vw,44px)", background: "var(--primary)", borderRadius: "6px 0 0 6px", display: "flex", flexDirection: "column", justifyContent: "space-around", alignItems: "center", padding: "clamp(12px,3vh,40px) 0" }}>
              {[0, 1, 2, 3, 4, 5, 6, 7].map(i => <div key={i} style={{ width: "clamp(3px,0.7vw,7px)", height: "clamp(3px,0.7vw,7px)", borderRadius: "50%", background: "var(--primary-foreground)", opacity: 0.5 }} />)}
            </div>
            {/* Spine clearance matches spine width exactly so lines go edge-to-edge
                and centered text is centered over the visible page, not behind the spine */}
            <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "clamp(1.25rem,3vh,3rem) clamp(1rem,2.5vw,2.5rem) 1rem clamp(20px,4vw,44px)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "clamp(4px,1.5vh,14px)" }}>
                <span style={{ fontSize: "clamp(15px,2.5vw,26px)", fontWeight: 700, color: "var(--primary)", fontFamily: "var(--font-display)" }}>
                  {userName ? `${userName.split(" ")[0]}'s` : "Bookloop"}
                </span>
              </div>
              <p style={{ fontSize: "clamp(9px,1.5vw,14px)", color: "var(--muted-foreground)", marginBottom: "clamp(14px,4vh,52px)", textAlign: "center" }}>Reading journal</p>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "clamp(8px,2.5vh,26px)" }}>
                {Array.from({ length: isMobile ? 8 : 11 }).map((_, i) => <div key={i} style={{ height: "0.5px", background: "var(--border)" }} />)}
              </div>
            </div>
            <p style={{ textAlign: "center", fontSize: "clamp(8px,1.2vw,12px)", color: "var(--muted-foreground)", paddingBottom: "clamp(10px,2vh,22px)", paddingLeft: "clamp(20px,4vw,44px)", letterSpacing: "0.04em" }}>
              tap to open
            </p>
          </button>
        </div>
      </div>
    </>
  );
}

// -- Spine -------------------------------------------------------------------

export function Spine({ currentPage, totalPages }: { currentPage: number; totalPages: number }) {
  return (
    <div aria-hidden="true" style={{ width: `${SPINE_WIDTH}px`, flexShrink: 0, alignSelf: "stretch", background: "var(--primary)", opacity: 0.15, position: "relative" }}>
      <div style={{ position: "absolute", top: 0, bottom: 0, left: "3px", width: "1px", background: "var(--primary)", opacity: 0.4 }} />
      <div style={{ position: "absolute", top: 0, bottom: 0, right: "3px", width: "1px", background: "var(--primary)", opacity: 0.4 }} />
      {totalPages > 1 && (
        <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%) rotate(90deg)", fontSize: "8px", color: "var(--primary)", whiteSpace: "nowrap", opacity: 0.8, fontFamily: "var(--font-display)" }}>
          {currentPage + 1} / {totalPages}
        </div>
      )}
    </div>
  );
}

// -- Page navigation ---------------------------------------------------------

function PageNav({ currentPage, totalPages, onPrev, onNext, booksVisible }: {
  currentPage: number;
  totalPages: number;
  onPrev: () => void;
  onNext: () => void;
  booksVisible: boolean;
}) {
  if (totalPages <= 1) return null;
  const btn: React.CSSProperties = {
    pointerEvents: "all", display: "flex", alignItems: "center", gap: "4px",
    padding: "6px 12px", fontSize: "11px", border: "0.5px solid var(--border)",
    borderRadius: "var(--radius)", background: "var(--card)", fontFamily: "inherit",
    boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
  };
  const prevDisabled = currentPage === 0;
  const nextDisabled = currentPage >= totalPages - 1;
  return (
    <div style={{ position: "absolute", bottom: "1rem", left: 0, right: 0, display: "flex", justifyContent: "space-between", alignItems: "center", paddingInline: "1.5rem", pointerEvents: "none", opacity: booksVisible ? 1 : 0, transition: "opacity 0.4s" }}>
      <button type="button" aria-label="Previous page" onClick={onPrev} disabled={prevDisabled}
        style={{ ...btn, color: prevDisabled ? "var(--muted-foreground)" : "var(--primary)", cursor: prevDisabled ? "not-allowed" : "pointer", opacity: prevDisabled ? 0.4 : 1 }}>
        <ChevronLeft size={13} aria-hidden="true" /> Prev
      </button>
      <div style={{ display: "flex", gap: "6px" }}>
        {Array.from({ length: totalPages }).map((_, i) => (
          <div key={i} style={{ width: "6px", height: "6px", borderRadius: "50%", background: i === currentPage ? "var(--primary)" : "var(--border)", transition: "background 0.2s" }} />
        ))}
      </div>
      <button type="button" aria-label="Next page" onClick={onNext} disabled={nextDisabled}
        style={{ ...btn, color: nextDisabled ? "var(--muted-foreground)" : "var(--primary)", cursor: nextDisabled ? "not-allowed" : "pointer", opacity: nextDisabled ? 0.4 : 1 }}>
        Next <ChevronRight size={13} aria-hidden="true" />
      </button>
    </div>
  );
}

// -- Main --------------------------------------------------------------------

export default function DashboardClient({ books: initialBooks, streak, userName }: Props) {
  const router = useRouter();
  const isMobile = useIsMobile();

  // Sort newest-first so newly added books land at slot 1 (right beside AddBookCard).
  // Falls back to the prop order if addedAt is not supplied.
  const sorted = [...initialBooks].sort((a, b) => {
    if (!a.addedAt || !b.addedAt) return 0;
    return new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime();
  });
  const [books, setBooks] = useState<Book[]>(sorted);
  const [statusModal, setStatusModal] = useState<Book | null>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [booksVisible, setBooksVisible] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  const notebookRef = useRef<HTMLButtonElement | null>(null);
  const bookSpreadRef = useRef<HTMLDivElement | null>(null);
  const tallyRefs = useRef<SVGLineElement[]>([]);

  // Lock body scroll while dashboard is open so the fixed layout is the only scroll context
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = ""; };
    }
  }, [isOpen]);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion:reduce)");
    setReducedMotion(mq.matches);
    if (!shouldShowNotebook()) { setIsOpen(true); setBooksVisible(true); }
  }, []);

  useEffect(() => {
    if (!isOpen || reducedMotion) return;
    const tallies = tallyRefs.current.filter(Boolean);
    const tl = gsap.timeline();
    tallies.forEach((line, i) => {
      gsap.set(line, { strokeDasharray: 52, strokeDashoffset: 52 });
      tl.to(line, { strokeDashoffset: 0, duration: tallyDuration(i), ease: "power1.inOut" }, i === 0 ? 0 : ">-0.05");
    });
  }, [isOpen, reducedMotion]);

  // Clamp page when books change
  useEffect(() => {
    const { totalPages } = getPage(books, 0);
    if (currentPage >= totalPages) setCurrentPage(Math.max(0, totalPages - 1));
  }, [books.length, currentPage]);

  function handleNotebookClick() {
    if (isOpen) return;
    recordVisit();
    if (reducedMotion || !notebookRef.current || !bookSpreadRef.current) {
      setIsOpen(true); setBooksVisible(true); return;
    }
    const tl = gsap.timeline({ onComplete: () => { setIsOpen(true); setBooksVisible(true); } });
    tl.to(notebookRef.current, { scale: 1.04, rotation: 0, duration: 0.2, ease: "power1.out" });
    tl.to(notebookRef.current, { scale: 10, opacity: 0, duration: 0.55, ease: "power3.in" });
    tl.to(bookSpreadRef.current, { opacity: 1, duration: 0.35, ease: "power2.out" }, "-=0.15");
  }

  async function handleStatusSelect(bookId: string, status: Status) {
    const prev = books;
    setBooks(b => b.map(bk => bk.id === bookId ? { ...bk, status } : bk));
    setStatusModal(m => m?.id === bookId ? { ...m, status } : m);
    try {
      const res = await fetch("/api/books/status", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bookId, status }) });
      if (!res.ok) throw new Error();
    } catch { setBooks(prev); }
  }

  async function handleDeleteBook(bookId: string) {
    const prev = books;
    setBooks(b => b.filter(bk => bk.id !== bookId));
    try {
      const res = await fetch("/api/books/remove", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bookId }) });
      if (!res.ok) throw new Error();
    } catch { setBooks(prev); }
  }

  const handleNavigate = (id: string) => router.push(`/journal/${id}`);
  const handleStatus = (book: Book, e: React.MouseEvent) => { e.stopPropagation(); setStatusModal(book); };
  const handleAddBook = () => router.push("/books/search");
  const prevPage = () => setCurrentPage(p => Math.max(0, p - 1));
  const nextPage = () => setCurrentPage(p => Math.min(getPage(books, 0).totalPages - 1, p + 1));

  const { left, right, totalPages } = getPage(books, currentPage);
  const mobileItems = [...left, ...right];

  return (
    <div style={{ position: "relative", width: "100%", minHeight: "100vh" }}>
      {statusModal && (
        <StatusModal book={statusModal} onClose={() => setStatusModal(null)} onSelect={handleStatusSelect} onDelete={handleDeleteBook} />
      )}

      {!isOpen && (
        <Notebook isMobile={isMobile} notebookRef={notebookRef} bookSpreadRef={bookSpreadRef} onClick={handleNotebookClick} userName={userName} />
      )}

      {isOpen && (isMobile ? (

        // -- Mobile ----------------------------------------------------------
        <div style={{ position: "fixed", top: "64px", bottom: "56px", left: 0, right: 0, display: "flex", flexDirection: "column", background: "var(--card)" }}>
          <TallyBand streak={streak} refs={tallyRefs} />
          <div style={{ padding: "0.75rem 1.25rem 0.5rem", flexShrink: 0, display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
            <h1 style={{ fontFamily: "var(--font-display)", fontSize: "1.25rem", fontWeight: 700, color: "var(--primary)", margin: 0 }}>My reading list</h1>
            {totalPages > 1 && <span style={{ fontSize: "11px", color: "var(--muted-foreground)" }}>{currentPage + 1} / {totalPages}</span>}
          </div>
          <div style={{ height: "1px", background: "var(--primary)", opacity: 0.4, flexShrink: 0 }} />
          <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "0.75rem 1.25rem", display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(140px,1fr))", gap: "0.6rem", alignContent: "start" }}>
            {mobileItems.map((item) =>
              item.type === "add"
                ? <AddCard key="add" onClick={handleAddBook} />
                : <BookCard key={item.book.id} book={item.book} onNavigate={() => handleNavigate(item.book.id)} onStatusClick={(e) => handleStatus(item.book, e)} />
            )}
          </div>
          {totalPages > 1 && (
            <div style={{ padding: "0.75rem 1.25rem", flexShrink: 0, display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "0.5px solid var(--border)" }}>
              <button type="button" onClick={prevPage} disabled={currentPage === 0}
                style={{ display: "flex", alignItems: "center", gap: "4px", padding: "6px 12px", fontSize: "12px", border: "0.5px solid var(--border)", borderRadius: "var(--radius)", background: "var(--muted)", color: currentPage === 0 ? "var(--muted-foreground)" : "var(--primary)", cursor: currentPage === 0 ? "not-allowed" : "pointer", opacity: currentPage === 0 ? 0.4 : 1, fontFamily: "inherit" }}>
                <ChevronLeft size={13} aria-hidden="true" /> Prev
              </button>
              <div style={{ display: "flex", gap: "6px" }}>
                {Array.from({ length: totalPages }).map((_, i) => <div key={i} style={{ width: "6px", height: "6px", borderRadius: "50%", background: i === currentPage ? "var(--primary)" : "var(--border)" }} />)}
              </div>
              <button type="button" onClick={nextPage} disabled={currentPage >= totalPages - 1}
                style={{ display: "flex", alignItems: "center", gap: "4px", padding: "6px 12px", fontSize: "12px", border: "0.5px solid var(--border)", borderRadius: "var(--radius)", background: "var(--muted)", color: currentPage >= totalPages - 1 ? "var(--muted-foreground)" : "var(--primary)", cursor: currentPage >= totalPages - 1 ? "not-allowed" : "pointer", opacity: currentPage >= totalPages - 1 ? 0.4 : 1, fontFamily: "inherit" }}>
                Next <ChevronRight size={13} aria-hidden="true" />
              </button>
            </div>
          )}
        </div>

      ) : (

        // -- Desktop ---------------------------------------------------------
        <div style={{ position: "fixed", inset: 0, top: "64px", display: "flex", flexDirection: "column", zIndex: 5 }}>
          <TallyBand streak={streak} refs={tallyRefs} />

          {/* Main spread: left | spine | right, overflow hidden to bound the spine */}
          <div style={{ flex: 1, minHeight: 0, display: "flex", overflow: "hidden", position: "relative" }}>

            {/* Left page */}
            <div style={{ flex: 1, background: "var(--card)", display: "flex", flexDirection: "column", minWidth: 0 }}>
              <div style={{ padding: "1rem 2rem 0.75rem", display: "flex", alignItems: "baseline", justifyContent: "space-between", flexShrink: 0 }}>
                <h1 style={{ fontFamily: "var(--font-display)", fontSize: "clamp(1rem,2vw,1.5rem)", fontWeight: 700, color: "var(--primary)", margin: 0 }}>My reading list</h1>
                <span style={{ fontSize: "11px", color: "var(--muted-foreground)" }}>{streak} day streak</span>
              </div>
              <div style={{ height: "1px", background: "var(--primary)", opacity: 0.4, flexShrink: 0 }} />
              <PageGrid items={left} booksVisible={booksVisible} onNavigate={handleNavigate} onStatusClick={handleStatus} onAddBook={handleAddBook} />
            </div>

            {/* Spine */}
            <Spine currentPage={currentPage} totalPages={totalPages} />

            {/* Right page */}
            <div style={{ flex: 1, background: "var(--card)", display: "flex", flexDirection: "column", minWidth: 0 }}>
              <div style={{ padding: "1rem 2rem 0.75rem", visibility: "hidden", flexShrink: 0, fontSize: "clamp(1rem,2vw,1.5rem)", fontWeight: 700 }} aria-hidden="true">.</div>
              <div style={{ height: "1px", background: "var(--primary)", opacity: 0.4, flexShrink: 0 }} />
              <PageGrid items={right} booksVisible={booksVisible} onNavigate={handleNavigate} onStatusClick={handleStatus} onAddBook={handleAddBook} />
            </div>

            <PageNav currentPage={currentPage} totalPages={totalPages} onPrev={prevPage} onNext={nextPage} booksVisible={booksVisible} />
          </div>
        </div>

      ))}
    </div>
  );
}
