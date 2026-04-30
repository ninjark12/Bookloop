"use client";

import { useEffect, useRef, useState } from "react";
import { gsap } from "gsap";
import { useRouter } from "next/navigation";
import { Plus, BookOpen, X } from "lucide-react";

const TALLY_THRESHOLD = 15;
const ANIMATION_KEY = "bookloop_tally_seen";
const LEFT_PAGE_MAX = 4;

type Status = "READING" | "READ" | "TBR" | "DNF";

type Book = {
  id: string;
  title: string;
  author: string;
  coverUrl: string | null;
  status: Status;
  furthestChapter: number | null;
};

type Props = {
  books: Book[];
  streak: number;
};

const STATUS_LABELS: Record<Status, string> = {
  READING: "Reading",
  READ: "Read",
  TBR: "To be read",
  DNF: "Did not finish",
};

const statusColor: Record<Status, string> = {
  READING: "var(--accent)",
  READ: "var(--primary)",
  TBR: "var(--muted-foreground)",
  DNF: "var(--muted-foreground)",
};

// Semi-transparent tint derived from CSS vars -- no hardcoded hex
const statusBgClass: Record<Status, string> = {
  READING: "color-mix(in srgb, var(--accent) 15%, transparent)",
  READ: "color-mix(in srgb, var(--primary) 15%, transparent)",
  TBR: "color-mix(in srgb, var(--muted-foreground) 12%, transparent)",
  DNF: "color-mix(in srgb, var(--muted-foreground) 12%, transparent)",
};

function getTallyDuration(index: number): number {
  return Math.max(0.06, 0.4 * Math.pow(0.72, index));
}

function getTallyGroups(count: number) {
  const groups: number[] = [];
  let remaining = Math.min(count, TALLY_THRESHOLD);
  while (remaining > 0) {
    groups.push(Math.min(remaining, 5));
    remaining -= 5;
  }
  return groups;
}

function splitBooks(books: Book[]) {
  return {
    left: books.slice(0, LEFT_PAGE_MAX),
    right: books.slice(LEFT_PAGE_MAX),
  };
}

// -- Status modal --
type StatusModalProps = {
  book: Book;
  onClose: () => void;
  onSelect: (bookId: string, status: Status) => void;
};

function StatusModal({ book, onClose, onSelect }: StatusModalProps) {
  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    // Backdrop
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Change status for ${book.title}`}
      style={{
        position: "fixed", inset: 0, zIndex: 100,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "rgba(0,0,0,0.4)",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: "var(--card)",
        border: "0.5px solid var(--border)",
        borderRadius: "var(--radius)",
        padding: "1.5rem",
        minWidth: "260px",
        boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
      }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1rem" }}>
          <div>
            <p style={{
              fontFamily: "var(--font-display)", fontSize: "14px",
              fontWeight: 600, color: "var(--foreground)", margin: 0,
            }}>
              {book.title}
            </p>
            <p style={{ fontSize: "11px", color: "var(--muted-foreground)", margin: "2px 0 0" }}>
              Change reading status
            </p>
          </div>
          <button
            type="button"
            aria-label="Close status modal"
            onClick={onClose}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              width: "26px", height: "26px",
              border: "0.5px solid var(--border)", borderRadius: "var(--radius)",
              background: "var(--muted)", color: "var(--muted-foreground)",
              cursor: "pointer", flexShrink: 0,
            }}
          >
            <X size={12} aria-hidden="true" />
          </button>
        </div>

        {/* Status options */}
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          {(Object.keys(STATUS_LABELS) as Status[]).map((s) => {
            const active = book.status === s;
            return (
              <button
                key={s}
                type="button"
                aria-pressed={active}
                onClick={() => { onSelect(book.id, s); onClose(); }}
                style={{
                  width: "100%", textAlign: "left",
                  padding: "8px 12px",
                  border: `0.5px solid ${active ? "var(--primary)" : "var(--border)"}`,
                  borderRadius: "var(--radius)",
                  background: active
                    ? "color-mix(in srgb, var(--primary) 10%, var(--card))"
                    : "var(--background)",
                  color: active ? "var(--primary)" : "var(--foreground)",
                  cursor: "pointer", fontSize: "13px", fontFamily: "inherit",
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                }}
              >
                <span>{STATUS_LABELS[s]}</span>
                {active && (
                  <span style={{
                    fontSize: "9px", fontWeight: 600, letterSpacing: "0.06em",
                    color: "var(--primary)",
                    background: "color-mix(in srgb, var(--primary) 12%, transparent)",
                    borderRadius: "3px", padding: "1px 5px",
                  }}>
                    current
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function BookCardItem({
  book,
  onNavigate,
  onStatusClick,
}: {
  book: Book;
  onNavigate: () => void;
  onStatusClick: (e: React.MouseEvent) => void;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      style={{
        background: "var(--background)",
        border: `0.5px solid ${hovered ? "var(--primary)" : "var(--border)"}`,
        borderRadius: "var(--radius)",
        padding: "1rem",
        transform: hovered ? "translateY(-2px)" : "translateY(0)",
        transition: "border-color 0.2s, transform 0.2s",
        position: "relative",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Colour bar -- not interactive */}
      <div style={{
        width: "100%", height: "4px", borderRadius: "2px",
        background: statusColor[book.status], marginBottom: "12px",
      }} />

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "4px" }}>
        {/* Title -- navigates to journal */}
        <button
          type="button"
          aria-label={`Open journal for ${book.title}`}
          onClick={onNavigate}
          style={{
            background: "none", border: "none", padding: 0, cursor: "pointer",
            fontFamily: "var(--font-display)", fontSize: "14px", fontWeight: 600,
            color: "var(--foreground)", lineHeight: 1.3,
            flex: 1, marginRight: "8px", textAlign: "left",
          }}
        >
          {book.title}
        </button>

        {/* Status badge -- opens modal */}
        <button
          type="button"
          aria-label={`Status: ${STATUS_LABELS[book.status]}. Click to change.`}
          onClick={onStatusClick}
          style={{
            fontSize: "9px", fontWeight: 500, letterSpacing: "0.06em",
            color: statusColor[book.status],
            background: statusBgClass[book.status],
            borderRadius: "4px", padding: "2px 6px",
            border: "none", cursor: "pointer",
            whiteSpace: "nowrap", flexShrink: 0,
          }}
        >
          {book.status}
        </button>
      </div>

      <p style={{ fontSize: "11px", color: "var(--muted-foreground)", marginBottom: "8px" }}>
        {book.author}
      </p>
      <p style={{ fontSize: "11px", color: "var(--muted-foreground)" }}>
        {book.status === "TBR" || !book.furthestChapter
          ? "Not started"
          : `Up to chapter ${book.furthestChapter}`}
      </p>
    </div>
  );
}

function AddBookCard({ onClick }: { onClick: () => void }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      aria-label="Add a book"
      style={{
        width: "100%", fontFamily: "inherit",
        background: "var(--background)",
        border: `0.5px dashed ${hovered ? "var(--primary)" : "var(--border)"}`,
        borderRadius: "var(--radius)",
        padding: "1rem",
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        minHeight: "120px", gap: "8px",
        transform: hovered ? "translateY(-2px)" : "translateY(0)",
        transition: "border-color 0.2s, transform 0.2s",
      }}
    >
      <div style={{
        width: "32px", height: "32px", borderRadius: "50%",
        background: "var(--muted)", display: "flex",
        alignItems: "center", justifyContent: "center",
      }}>
        <Plus size={16} style={{ color: "var(--muted-foreground)" }} aria-hidden="true" />
      </div>
      <p style={{ fontSize: "11px", color: "var(--muted-foreground)", textAlign: "center" }}>
        Add a book
      </p>
    </button>
  );
}

function TallyBand({ streak, tallyRefs }: {
  streak: number;
  tallyRefs: React.MutableRefObject<SVGLineElement[]>;
}) {
  const groups = getTallyGroups(streak);
  const showCount = streak > TALLY_THRESHOLD;
  let idx = 0;

  return (
    <div
      style={{
        width: "100%",
        background: "var(--tally-paper)",
        borderBottom: "0.5px solid var(--border)",
        padding: "10px 3rem",
        display: "flex", alignItems: "center", gap: "4px",
        flexShrink: 0,
      }}
      aria-label={`Reading streak: ${streak} day${streak !== 1 ? "s" : ""}`}
    >
      <span
        aria-hidden="true"
        style={{
          fontSize: "9px", letterSpacing: "0.14em",
          color: "var(--muted-foreground)", textTransform: "uppercase",
          marginRight: "12px", whiteSpace: "nowrap",
        }}
      >
        Reading streak
      </span>

      <div style={{ display: "flex", alignItems: "center", gap: "10px" }} aria-hidden="true">
        {groups.map((count, gi) => {
          const groupTallies: number[] = [];
          for (let i = 0; i < count; i++) groupTallies.push(idx++);
          return (
            <svg
              key={gi}
              viewBox="0 0 52 52"
              style={{ width: `${count === 5 ? 52 : count * 12}px`, height: "32px" }}
            >
              {groupTallies.map((ti, i) => {
                const isDiagonal = i === 4;
                return isDiagonal ? (
                  <line
                    key={i}
                    ref={(el) => { if (el) tallyRefs.current[ti] = el; }}
                    x1="4" y1="48" x2="48" y2="4"
                    stroke="var(--tally-stroke)" strokeWidth="2.5" strokeLinecap="round"
                  />
                ) : (
                  <line
                    key={i}
                    ref={(el) => { if (el) tallyRefs.current[ti] = el; }}
                    x1={8 + i * 11} y1="4"
                    x2={8 + i * 11} y2="48"
                    stroke="var(--tally-stroke)" strokeWidth="2.5" strokeLinecap="round"
                  />
                );
              })}
            </svg>
          );
        })}

        {showCount && (
          <span style={{
            fontSize: "15px", fontWeight: 500,
            color: "var(--tally-stroke)", fontFamily: "var(--font-display)",
          }}>
            x{streak}
          </span>
        )}
      </div>
    </div>
  );
}

export default function DashboardClient({ books: initialBooks, streak }: Props) {
  const router = useRouter();
  const [books, setBooks] = useState<Book[]>(initialBooks);
  const [statusModal, setStatusModal] = useState<Book | null>(null);

  const [isOpen, setIsOpen] = useState(false);
  const [booksVisible, setBooksVisible] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  const notebookRef = useRef<HTMLButtonElement>(null);
  const bookSpreadRef = useRef<HTMLDivElement>(null);
  const tallyRefs = useRef<SVGLineElement[]>([]);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
  }, []);

  // -- Status change (optimistic) --
  async function handleStatusSelect(bookId: string, status: Status) {
    const prev = books;
    setBooks(b => b.map(bk => bk.id === bookId ? { ...bk, status } : bk));
    try {
      const res = await fetch("/api/books/status", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookId, status }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setBooks(prev); // revert on failure
    }
  }

  function handleNotebookClick() {
    if (isOpen) return;
    const alreadySeen = localStorage.getItem(ANIMATION_KEY);
    const skip = reducedMotion || alreadySeen === "true";

    if (skip) {
      setIsOpen(true);
      setBooksVisible(true);
      return;
    }

    localStorage.setItem(ANIMATION_KEY, "true");
    const tl = gsap.timeline({
      onComplete: () => { setIsOpen(true); setBooksVisible(true); },
    });
    tl.to(notebookRef.current, { scale: 1.04, rotation: 0, duration: 0.2, ease: "power1.out" });
    tl.to(notebookRef.current, { scale: 10, opacity: 0, duration: 0.55, ease: "power3.in" });
    tl.to(bookSpreadRef.current, { opacity: 1, duration: 0.35, ease: "power2.out" }, "-=0.15");
  }

  useEffect(() => {
    if (!isOpen || reducedMotion) return;
    const tallies = tallyRefs.current.filter(Boolean);
    const tl = gsap.timeline();
    tallies.forEach((line, i) => {
      gsap.set(line, { strokeDasharray: 52, strokeDashoffset: 52 });
      tl.to(line, {
        strokeDashoffset: 0,
        duration: getTallyDuration(i),
        ease: "power1.inOut",
      }, i === 0 ? 0 : ">-0.05");
    });
  }, [isOpen, reducedMotion]);

  const { left: leftBooks, right: rightBooks } = splitBooks(books);

  return (
    <div style={{ position: "relative", width: "100%", minHeight: "100vh", overflow: "hidden" }}>

      {/* Status modal */}
      {statusModal && (
        <StatusModal
          book={statusModal}
          onClose={() => setStatusModal(null)}
          onSelect={handleStatusSelect}
        />
      )}

      {/* -- CLOSED STATE -- */}
      {!isOpen && (
        <>
          <div
            ref={bookSpreadRef}
            style={{
              position: "fixed", inset: 0, top: "64px",
              zIndex: 1, opacity: 0,
              display: "flex", background: "var(--card)",
            }}
          />

          <div style={{
            position: "fixed", inset: 0, zIndex: 10,
            display: "flex", alignItems: "center", justifyContent: "center",
            background: "var(--background)",
          }}>
            <div style={{
              position: "relative",
              width: "min(520px, 75vw)",
              height: "min(760px, 78vh)",
            }}>
              <button
                type="button"
                ref={notebookRef}
                onClick={handleNotebookClick}
                aria-label="Open your reading journal"
                style={{
                  position: "absolute", inset: 0,
                  background: "var(--card)",
                  border: "0.5px solid var(--border)",
                  borderRadius: "6px 20px 20px 6px",
                  transform: "rotate(-3deg)",
                  display: "flex", flexDirection: "column",
                  overflow: "hidden",
                  transition: "box-shadow 0.2s",
                  width: "100%", fontFamily: "inherit",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.boxShadow =
                    "0 16px 56px rgba(107,76,42,0.2)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.boxShadow = "none";
                }}
              >
                {/* Binding */}
                <div style={{
                  position: "absolute", left: 0, top: 0, bottom: 0,
                  width: "clamp(24px, 4vw, 44px)",
                  background: "var(--primary)",
                  borderRadius: "6px 0 0 6px",
                  display: "flex", flexDirection: "column",
                  justifyContent: "space-around", alignItems: "center",
                  padding: "clamp(16px, 3vh, 40px) 0",
                }}>
                  {[0, 1, 2, 3, 4, 5, 6, 7].map(i => (
                    <div key={i} style={{
                      width: "clamp(4px, 0.7vw, 7px)",
                      height: "clamp(4px, 0.7vw, 7px)",
                      borderRadius: "50%",
                      background: "var(--primary-foreground)",
                      opacity: 0.5,
                    }} />
                  ))}
                </div>

                {/* Body */}
                <div style={{
                  flex: 1, display: "flex", flexDirection: "column",
                  padding: "clamp(1.5rem, 3vh, 3rem) clamp(1.25rem, 2.5vw, 2.5rem) 1rem clamp(2.5rem, 5vw, 5rem)",
                }}>
                  <div style={{
                    display: "flex", alignItems: "center",
                    gap: "clamp(8px, 1.5vw, 14px)",
                    marginBottom: "clamp(6px, 1.5vh, 14px)",
                  }}>
                    <BookOpen size={22} style={{ color: "var(--primary)", flexShrink: 0 }} aria-hidden="true" />
                    <span style={{
                      fontSize: "clamp(16px, 2.5vw, 26px)",
                      fontWeight: 700, color: "var(--primary)",
                      fontFamily: "var(--font-display)",
                    }}>
                      Bookloop
                    </span>
                  </div>

                  <p style={{
                    fontSize: "clamp(10px, 1.5vw, 14px)",
                    color: "var(--muted-foreground)",
                    marginBottom: "clamp(20px, 4vh, 52px)",
                  }}>
                    Reading journal
                  </p>

                  <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "clamp(12px, 2.5vh, 26px)" }}>
                    {Array.from({ length: 11 }).map((_, i) => (
                      <div key={i} style={{ height: "0.5px", background: "var(--border)" }} />
                    ))}
                  </div>
                </div>

                <p style={{
                  textAlign: "center",
                  fontSize: "clamp(9px, 1.2vw, 12px)",
                  color: "var(--muted-foreground)",
                  paddingBottom: "clamp(12px, 2vh, 22px)",
                  letterSpacing: "0.04em",
                }}>
                  click to open
                </p>
              </button>
            </div>
          </div>
        </>
      )}

      {/* -- OPEN STATE -- */}
      {isOpen && (
        <div style={{
          position: "fixed", inset: 0, top: "64px",
          display: "flex", flexDirection: "column",
          zIndex: 5,
          height: "calc(100vh - 64px)",
        }}>
          <TallyBand streak={streak} tallyRefs={tallyRefs} />

          <div style={{ flex: 1, minHeight: 0, display: "flex", overflow: "hidden" }}>

            {/* Left page */}
            <div style={{
              flex: 1, background: "var(--card)",
              overflow: "hidden",
              display: "flex", flexDirection: "column",
            }}>
              <div style={{
                padding: "1.25rem 2.5rem 0.75rem",
                display: "flex", alignItems: "baseline",
                justifyContent: "space-between",
                flexShrink: 0,
              }}>
                <h1 style={{
                  fontFamily: "var(--font-display)",
                  fontSize: "clamp(1.1rem, 2vw, 1.6rem)",
                  fontWeight: 700, color: "var(--primary)", margin: 0,
                }}>
                  My reading list
                </h1>
                <span
                  style={{ fontSize: "11px", color: "var(--muted-foreground)" }}
                  aria-label={`${streak} day streak`}
                >
                  {streak} day streak
                </span>
              </div>

              <div style={{ height: "1px", background: "var(--primary)", opacity: 0.4, flexShrink: 0 }} />

              <div style={{
                flex: 1, minHeight: 0, padding: "1.25rem 2.5rem",
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
                gap: "0.75rem",
                alignContent: "start",
                overflowY: "auto",
                opacity: booksVisible ? 1 : 0,
                transition: "opacity 0.4s ease",
              }}>
                {leftBooks.map((book) => (
                  <BookCardItem
                    key={book.id}
                    book={book}
                    onNavigate={() => router.push(`/journal/${book.id}`)}
                    onStatusClick={(e) => { e.stopPropagation(); setStatusModal(book); }}
                  />
                ))}
              </div>
            </div>

            {/* Spine */}
            <div
              aria-hidden="true"
              style={{
                width: "32px", flexShrink: 0, alignSelf: "stretch",
                background: "var(--primary)", opacity: 0.15,
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
              overflow: "hidden",
              display: "flex", flexDirection: "column",
            }}>
              <div style={{
                padding: "1.25rem 2.5rem 0.75rem",
                visibility: "hidden", flexShrink: 0,
                fontSize: "clamp(1.1rem, 2vw, 1.6rem)", fontWeight: 700,
              }}
                aria-hidden="true"
              >
                placeholder
              </div>

              <div style={{ height: "1px", background: "var(--primary)", opacity: 0.4, flexShrink: 0 }} />

              <div style={{
                flex: 1, minHeight: 0, padding: "1.25rem 2.5rem",
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
                gap: "0.75rem",
                alignContent: "start",
                overflowY: "auto",
                opacity: booksVisible ? 1 : 0,
                transition: "opacity 0.4s ease",
              }}>
                {rightBooks.map((book) => (
                  <BookCardItem
                    key={book.id}
                    book={book}
                    onNavigate={() => router.push(`/journal/${book.id}`)}
                    onStatusClick={(e) => { e.stopPropagation(); setStatusModal(book); }}
                  />
                ))}
                <AddBookCard onClick={() => router.push("/books/search")} />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
