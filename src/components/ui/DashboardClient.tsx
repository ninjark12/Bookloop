"use client";

import { useEffect, useRef, useState } from "react";
import { gsap } from "gsap";
import { useRouter } from "next/navigation";
import { Plus, BookOpen } from "lucide-react";

const STREAK = 7;
const TALLY_THRESHOLD = 15;
const ANIMATION_KEY = "bookloop_tally_seen";
const LEFT_PAGE_MAX = 4;

type Book = {
  id: string;
  title: string;
  author: string;
  chapter: number;
  status: "READING" | "READ" | "TBR";
};

const mockBooks: Book[] = [
  { id: "dune", title: "Dune", author: "Frank Herbert", chapter: 12, status: "READING" },
  { id: "notw", title: "The Name of the Wind", author: "Patrick Rothfuss", chapter: 42, status: "READING" },
  { id: "educated", title: "Educated", author: "Tara Westover", chapter: 30, status: "READ" },
  { id: "piranesi", title: "Piranesi", author: "Susanna Clarke", chapter: 1, status: "TBR" },
];

const statusColor: Record<Book["status"], string> = {
  READING: "#4A6741",
  READ: "#6B4C2A",
  TBR: "#8C7B6B",
};

const statusBg: Record<Book["status"], string> = {
  READING: "rgba(74,103,65,0.15)",
  READ: "rgba(107,76,42,0.15)",
  TBR: "rgba(140,123,107,0.12)",
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

function BookCardItem({ book, onClick }: { book: Book; onClick: () => void }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: "var(--background)",
        border: `0.5px solid ${hovered ? "var(--primary)" : "var(--border)"}`,
        borderRadius: "var(--radius)",
        padding: "1rem",
        cursor: "pointer",
        transform: hovered ? "translateY(-2px)" : "translateY(0)",
        transition: "border-color 0.2s, transform 0.2s",
      }}
    >
      <div style={{
        width: "100%", height: "4px", borderRadius: "2px",
        background: statusColor[book.status], marginBottom: "12px",
      }} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "4px" }}>
        <p style={{
          fontFamily: "var(--font-display)", fontSize: "14px", fontWeight: 600,
          color: "var(--foreground)", lineHeight: 1.3, flex: 1, marginRight: "8px",
        }}>
          {book.title}
        </p>
        <span style={{
          fontSize: "9px", fontWeight: 500, letterSpacing: "0.06em",
          color: statusColor[book.status], background: statusBg[book.status],
          borderRadius: "4px", padding: "2px 6px", whiteSpace: "nowrap",
        }}>
          {book.status}
        </span>
      </div>
      <p style={{ fontSize: "11px", color: "var(--muted-foreground)", marginBottom: "8px" }}>
        {book.author}
      </p>
      <p style={{ fontSize: "11px", color: "var(--muted-foreground)" }}>
        {book.status === "TBR" ? "Not started" : `Up to chapter ${book.chapter}`}
      </p>
    </div>
  );
}

function AddBookCard({ onClick }: { onClick: () => void }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: "var(--background)",
        border: `0.5px dashed ${hovered ? "var(--primary)" : "var(--border)"}`,
        borderRadius: "var(--radius)",
        padding: "1rem",
        cursor: "pointer",
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
        <Plus size={16} style={{ color: "var(--muted-foreground)" }} />
      </div>
      <p style={{ fontSize: "11px", color: "var(--muted-foreground)", textAlign: "center" }}>
        Add a book
      </p>
    </div>
  );
}

// Tally SVG drawn inline — used in the open state band
function TallyBand({ streak, tallyRefs }: {
  streak: number;
  tallyRefs: React.MutableRefObject<SVGLineElement[]>;
}) {
  const groups = getTallyGroups(streak);
  const showCount = streak > TALLY_THRESHOLD;
  let idx = 0;

  return (
    <div style={{
      width: "100%",
      background: "#E8E0D0",
      borderBottom: "0.5px solid #C4A882",
      padding: "10px 3rem",
      display: "flex",
      alignItems: "center",
      gap: "4px",
      flexShrink: 0,
    }}>
      <span style={{
        fontSize: "9px", letterSpacing: "0.14em",
        color: "#8C7B6B", textTransform: "uppercase",
        marginRight: "12px", whiteSpace: "nowrap",
      }}>
        Reading streak
      </span>

      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
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
                    stroke="#6B4C2A" strokeWidth="2.5" strokeLinecap="round"
                  />
                ) : (
                  <line
                    key={i}
                    ref={(el) => { if (el) tallyRefs.current[ti] = el; }}
                    x1={8 + i * 11} y1="4"
                    x2={8 + i * 11} y2="48"
                    stroke="#6B4C2A" strokeWidth="2.5" strokeLinecap="round"
                  />
                );
              })}
            </svg>
          );
        })}

        {showCount && (
          <span style={{
            fontSize: "15px", fontWeight: 500,
            color: "#6B4C2A", fontFamily: "var(--font-display)",
          }}>
            ×{streak}
          </span>
        )}
      </div>
    </div>
  );
}

export default function DashboardClient() {
  const router = useRouter();

  // closed = notebook shown, open = book spread shown
  const [isOpen, setIsOpen] = useState(false);
  const [booksVisible, setBooksVisible] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  const notebookRef = useRef<HTMLDivElement>(null);
  const bookSpreadRef = useRef<HTMLDivElement>(null);
  const tallyRefs = useRef<SVGLineElement[]>([]);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
  }, []);

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
      onComplete: () => {
        setIsOpen(true);
        setBooksVisible(true);
      },
    });

    // Notebook pulses then zooms out to reveal book
    tl.to(notebookRef.current, {
      scale: 1.04, rotation: 0, duration: 0.2, ease: "power1.out",
    });
    tl.to(notebookRef.current, {
      scale: 10, opacity: 0, duration: 0.55, ease: "power3.in",
    });

    // Book spread fades in behind
    tl.to(bookSpreadRef.current, {
      opacity: 1, duration: 0.35, ease: "power2.out",
    }, "-=0.15");
  }

  // After open state mounts, animate tally strokes
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

  const { left: leftBooks, right: rightBooks } = splitBooks(mockBooks);

  return (
    <div style={{ position: "relative", width: "100%", minHeight: "100vh", overflow: "hidden" }}>

      {/* ── CLOSED STATE — notebook only, no tallies ── */}
      {!isOpen && (
        <>
          {/* Invisible target for zoom animation to fade into */}
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
              {/* Notebook */}
              <div
                ref={notebookRef}
                onClick={handleNotebookClick}
                style={{
                  position: "absolute",
                  inset: 0,
                  background: "var(--card)",
                  border: "0.5px solid var(--border)",
                  borderRadius: "6px 20px 20px 6px",
                  cursor: "pointer",
                  transform: "rotate(-3deg)",
                  display: "flex",
                  flexDirection: "column",
                  overflow: "hidden",
                  transition: "box-shadow 0.2s",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLDivElement).style.boxShadow =
                    "0 16px 56px rgba(107,76,42,0.2)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLDivElement).style.boxShadow = "none";
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
                    <BookOpen size={22} style={{ color: "var(--primary)", flexShrink: 0 }} />
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

                  {/* Ruled lines */}
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
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── OPEN STATE ── */}
      {isOpen && (
        <div style={{
          position: "fixed", inset: 0, top: "64px",
          display: "flex", flexDirection: "column",
          zIndex: 5,
        }}>

          {/* Tally band — full width, sits right under navbar */}
          <TallyBand streak={STREAK} tallyRefs={tallyRefs} />

          {/* Open book — fills remaining space */}
          <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>

            {/* Left page */}
            <div style={{
              flex: 1, background: "var(--card)",
              overflow: "hidden",
              display: "flex", flexDirection: "column",
            }}>
              {/* Header */}
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
                <span style={{ fontSize: "11px", color: "var(--muted-foreground)" }}>
                  {STREAK} day streak
                </span>
              </div>

              {/* Divider — goes edge to edge on left page */}
              <div style={{
                height: "1px", background: "var(--primary)",
                opacity: 0.4, flexShrink: 0,
              }} />

              {/* Cards */}
              <div style={{
                flex: 1, padding: "1.25rem 2.5rem",
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
                    onClick={() => router.push(`/journal/${book.id}`)}
                  />
                ))}
              </div>
            </div>

            {/* Spine */}
            <div style={{
              width: "32px", flexShrink: 0,
              background: "var(--primary)", opacity: 0.15,
              position: "relative",
            }}>
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
              {/* Invisible header to match left page height */}
              <div style={{
                padding: "1.25rem 2.5rem 0.75rem",
                visibility: "hidden", flexShrink: 0,
                fontSize: "clamp(1.1rem, 2vw, 1.6rem)", fontWeight: 700,
              }}>
                placeholder
              </div>

              {/* Matching divider */}
              <div style={{
                height: "1px", background: "var(--primary)",
                opacity: 0.4, flexShrink: 0,
              }} />

              {/* Cards */}
              <div style={{
                flex: 1, padding: "1.25rem 2.5rem",
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
                    onClick={() => router.push(`/journal/${book.id}`)}
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
