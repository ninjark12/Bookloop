// Instant Suspense fallback for the journal route. Next renders this the moment
// the user navigates (e.g. from search) while the server component resolves its
// DB queries, so the page frame appears immediately instead of a blank hang.
//
// Mirrors JournalPageClient's shell. That component picks its layout with a
// client-side `useIsMobile()` (breakpoint 768px), which we can't run in a server
// component — so we render BOTH layouts and toggle them with a CSS media query at
// the same 768px breakpoint. Desktop: two panels (Entries | Spine | Write).
// Mobile: a single Entries panel.

const BOTTOM_NAV_HEIGHT = 56;
const SPINE_WIDTH = 32;

function EntrySkeleton() {
  return (
    <div
      aria-hidden="true"
      style={{
        border: "0.5px solid var(--border)",
        borderRadius: "var(--radius)",
        padding: "1rem",
        display: "flex",
        flexDirection: "column",
        gap: "8px",
        background: "var(--background)",
        animation: "journalPulse 1.5s ease-in-out infinite",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
        <div style={{ width: "64px", height: "16px", borderRadius: "4px", background: "var(--muted)" }} />
        <div style={{ width: "44px", height: "12px", borderRadius: "4px", background: "var(--muted)" }} />
      </div>
      <div style={{ width: "100%", height: "10px", borderRadius: "4px", background: "var(--muted)" }} />
      <div style={{ width: "92%", height: "10px", borderRadius: "4px", background: "var(--muted)" }} />
      <div style={{ width: "78%", height: "10px", borderRadius: "4px", background: "var(--muted)" }} />
    </div>
  );
}

// The center "book spine" between the two desktop panels — mirrors DashboardClient's Spine.
function SpineSkeleton() {
  return (
    <div aria-hidden="true" style={{ width: `${SPINE_WIDTH}px`, flexShrink: 0, alignSelf: "stretch", background: "var(--primary)", opacity: 0.15, position: "relative" }}>
      <div style={{ position: "absolute", top: 0, bottom: 0, left: "3px", width: "1px", background: "var(--primary)", opacity: 0.4 }} />
      <div style={{ position: "absolute", top: 0, bottom: 0, right: "3px", width: "1px", background: "var(--primary)", opacity: 0.4 }} />
    </div>
  );
}

export default function JournalLoading() {
  return (
    <div style={{ position: "fixed", inset: 0, top: "64px", display: "flex", flexDirection: "column", height: `calc(100dvh - 64px - ${BOTTOM_NAV_HEIGHT}px)` }}>
      {/* Header — matches renderHeader() */}
      <div style={{ background: "var(--card)", borderBottom: "0.5px solid var(--border)", padding: "0.75rem 1.25rem", display: "flex", alignItems: "center", gap: "0.75rem", flexShrink: 0, animation: "journalPulse 1.5s ease-in-out infinite" }}>
        {/* Back link + divider — desktop only */}
        <div className="j-desktop-only" style={{ alignItems: "center", gap: "0.75rem" }}>
          <div style={{ width: "72px", height: "14px", borderRadius: "4px", background: "var(--muted)" }} />
          <div style={{ width: "0.5px", height: "16px", background: "var(--border)" }} />
        </div>
        {/* Cover */}
        <div style={{ width: "28px", height: "40px", borderRadius: "2px", background: "var(--muted)", flexShrink: 0 }} />
        {/* Title + author */}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "6px" }}>
          <div style={{ width: "45%", height: "14px", borderRadius: "4px", background: "var(--muted)" }} />
          <div style={{ width: "28%", height: "11px", borderRadius: "4px", background: "var(--muted)" }} />
        </div>
        {/* Status control */}
        <div style={{ width: "96px", height: "22px", borderRadius: "4px", background: "var(--muted)", flexShrink: 0 }} />
        {/* New entry button — desktop only */}
        <div className="j-desktop-only" style={{ width: "104px", height: "32px", borderRadius: "var(--radius)", background: "var(--muted)", flexShrink: 0 }} />
      </div>

      {/* Mobile body — single Entries panel */}
      <div className="j-mobile-only" style={{ flex: 1, minHeight: 0, flexDirection: "column", background: "var(--card)", overflow: "hidden" }}>
        <div style={{ padding: "1rem 1.25rem 0.75rem", flexShrink: 0, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: "1rem", fontWeight: 600, color: "var(--primary)", margin: 0 }}>Entries</h2>
          <div aria-hidden="true" style={{ width: "104px", height: "32px", borderRadius: "var(--radius)", background: "var(--muted)", animation: "journalPulse 1.5s ease-in-out infinite" }} />
        </div>
        <div style={{ height: "1px", background: "var(--primary)", opacity: 0.4, flexShrink: 0 }} />
        <div style={{ flex: 1, minHeight: 0, overflowY: "hidden", padding: "1rem 1.25rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
          {[0, 1, 2, 3].map((i) => <EntrySkeleton key={i} />)}
        </div>
      </div>

      {/* Desktop body — Entries | Spine | Write */}
      <div className="j-desktop-only" style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
        {/* Left: entries list */}
        <div style={{ flex: 1, background: "var(--card)", display: "flex", flexDirection: "column", overflow: "hidden", maxWidth: `calc(50% - ${SPINE_WIDTH / 2}px)` }}>
          <div style={{ padding: "1rem 2rem 0.75rem", flexShrink: 0 }}>
            <h2 style={{ fontFamily: "var(--font-display)", fontSize: "1rem", fontWeight: 600, color: "var(--primary)", margin: 0 }}>Entries</h2>
          </div>
          <div style={{ height: "1px", background: "var(--primary)", opacity: 0.4, flexShrink: 0 }} />
          <div style={{ flex: 1, minHeight: 0, overflowY: "hidden", padding: "1rem 2rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
            {[0, 1, 2, 3].map((i) => <EntrySkeleton key={i} />)}
          </div>
        </div>

        <SpineSkeleton />

        {/* Right: write / detail pane */}
        <div style={{ flex: 1, background: "var(--card)", display: "flex", flexDirection: "column", overflow: "hidden", maxWidth: `calc(50% - ${SPINE_WIDTH / 2}px)` }}>
          <div style={{ padding: "1rem 2rem 0.75rem", flexShrink: 0 }}>
            <h2 style={{ fontFamily: "var(--font-display)", fontSize: "1rem", fontWeight: 600, color: "var(--primary)", margin: 0 }}>Write</h2>
          </div>
          <div style={{ height: "1px", background: "var(--primary)", opacity: 0.4, flexShrink: 0 }} />
          <div style={{ flex: 1, minHeight: 0, padding: "1rem 2rem" }}>
            <div aria-hidden="true" style={{ width: "100%", height: "100%", minHeight: "200px", borderRadius: "var(--radius)", background: "var(--background)", border: "0.5px solid var(--border)", animation: "journalPulse 1.5s ease-in-out infinite" }} />
          </div>
        </div>
      </div>

      <style>{`
        @keyframes journalPulse { 0%, 100% { opacity: 0.55; } 50% { opacity: 0.85; } }
        .j-desktop-only { display: none; }
        .j-mobile-only { display: flex; }
        @media (min-width: 768px) {
          .j-desktop-only { display: flex; }
          .j-mobile-only { display: none; }
        }
      `}</style>
    </div>
  );
}
