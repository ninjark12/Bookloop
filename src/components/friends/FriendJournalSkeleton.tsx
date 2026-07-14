// Layout-aware skeleton for the friend-journal book grid. Renders BOTH the
// desktop spread (left page | spine | right page) and the mobile grid, toggled
// with a CSS media query at the same 768px breakpoint the page uses — so it
// works in a server `loading.tsx` (no window) and in the client loading state.
// The card + grid CSS mirrors the real BookGrid so the transition is seamless.

const BOTTOM_NAV_HEIGHT = 56;
const SPINE_WIDTH = 32;

function CardSkeleton() {
  return (
    <div style={{
      background: "var(--background)", border: "0.5px solid var(--border)",
      borderRadius: "var(--radius)", padding: "0.75rem",
      display: "flex", flexDirection: "column", gap: "8px",
      animation: "fjPulse 1.5s ease-in-out infinite",
    }}>
      <div style={{ width: "100%", height: "3px", borderRadius: "2px", background: "var(--muted)" }} />
      <div style={{ width: "70%", height: "14px", borderRadius: "4px", background: "var(--muted)" }} />
      <div style={{ width: "45%", height: "11px", borderRadius: "4px", background: "var(--muted)" }} />
      <div style={{ width: "55%", height: "11px", borderRadius: "4px", background: "var(--muted)" }} />
    </div>
  );
}

function HeadingBar({ title }: { title?: string }) {
  if (title) {
    return (
      <h1 style={{ fontFamily: "var(--font-display)", fontSize: "clamp(1rem,2vw,1.5rem)", fontWeight: 700, color: "var(--primary)", margin: 0 }}>
        {title}
      </h1>
    );
  }
  return <div style={{ width: "180px", height: "22px", borderRadius: "4px", background: "var(--muted)", animation: "fjPulse 1.5s ease-in-out infinite" }} />;
}

function DesktopGrid({ count }: { count: number }) {
  return (
    <div style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
      <div style={{ height: "100%", padding: "1rem 2rem", boxSizing: "border-box", display: "grid", gridTemplateColumns: "1fr 1fr", gridTemplateRows: "repeat(4, 1fr)", gap: "0.6rem" }}>
        {Array.from({ length: count }).map((_, i) => <CardSkeleton key={i} />)}
      </div>
    </div>
  );
}

export default function FriendJournalSkeleton({ title }: { title?: string }) {
  return (
    <div className="fj-skel-wrap" style={{ position: "fixed", top: "64px", left: 0, right: 0, overflow: "hidden" }}>
      {/* Desktop spread */}
      <div className="fj-desktop-only" style={{ height: "100%", overflow: "hidden" }}>
        <div style={{ flex: 1, background: "var(--card)", display: "flex", flexDirection: "column", minWidth: 0 }}>
          <div style={{ padding: "1rem 2rem 0.75rem", flexShrink: 0 }}><HeadingBar title={title} /></div>
          <div style={{ height: "1px", background: "var(--primary)", opacity: 0.4, flexShrink: 0 }} />
          <DesktopGrid count={8} />
        </div>

        <div aria-hidden="true" style={{ width: `${SPINE_WIDTH}px`, flexShrink: 0, alignSelf: "stretch", background: "var(--primary)", opacity: 0.15, position: "relative" }}>
          <div style={{ position: "absolute", top: 0, bottom: 0, left: "3px", width: "1px", background: "var(--primary)", opacity: 0.4 }} />
          <div style={{ position: "absolute", top: 0, bottom: 0, right: "3px", width: "1px", background: "var(--primary)", opacity: 0.4 }} />
        </div>

        <div style={{ flex: 1, background: "var(--card)", display: "flex", flexDirection: "column", minWidth: 0 }}>
          <div style={{ padding: "1rem 2rem 0.75rem", visibility: "hidden", flexShrink: 0, fontSize: "clamp(1rem,2vw,1.5rem)", fontWeight: 700 }} aria-hidden="true">.</div>
          <div style={{ height: "1px", background: "var(--primary)", opacity: 0.4, flexShrink: 0 }} />
          <DesktopGrid count={8} />
        </div>
      </div>

      {/* Mobile grid */}
      <div className="fj-mobile-only" style={{ height: "100%", flexDirection: "column", background: "var(--card)", overflow: "hidden" }}>
        <div style={{ padding: "0.75rem 1rem 0.5rem", flexShrink: 0 }}><HeadingBar title={title} /></div>
        <div style={{ height: "1px", background: "var(--primary)", opacity: 0.4, flexShrink: 0 }} />
        <div style={{ flex: 1, minHeight: 0, overflow: "hidden", padding: "0.75rem 1rem", display: "grid", gridTemplateColumns: "1fr 1fr", gridTemplateRows: "repeat(3, minmax(0, 1fr))", gap: "0.6rem" }}>
          {Array.from({ length: 6 }).map((_, i) => <CardSkeleton key={i} />)}
        </div>
      </div>

      <style>{`
        @keyframes fjPulse { 0%, 100% { opacity: 0.5; } 50% { opacity: 0.8; } }
        .fj-skel-wrap { bottom: ${BOTTOM_NAV_HEIGHT}px; }
        .fj-desktop-only { display: none; }
        .fj-mobile-only { display: flex; }
        @media (min-width: 768px) {
          .fj-skel-wrap { bottom: 0; }
          .fj-desktop-only { display: flex; }
          .fj-mobile-only { display: none; }
        }
      `}</style>
    </div>
  );
}
