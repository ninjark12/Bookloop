"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { BookOpen, User, LogOut, Sun, Moon, ChevronDown, Settings, Bug, Search } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { useEffect, useRef, useState } from "react";
import { useFriendRequests } from "@/components/friends/FriendRequestsProvider";
import BugReportModal from "@/components/BugReportModal";
import SearchPanel from "@/components/search/SearchPanel";

const links = [
  { href: "/dashboard", label: "Journal" },
  { href: "/books/search", label: "Books" },
  { href: "/feed", label: "Friends" },
];

// Single-line to avoid hydration mismatches: multi-line string-literal classNames
// get their embedded whitespace serialized differently on server vs client.
const iconButtonClass =
  "w-8 h-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-primary hover:bg-muted transition-colors";

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = authClient.useSession();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [bugModalOpen, setBugModalOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { pendingCount } = useFriendRequests();

  useEffect(() => setMounted(true), []);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    if (dropdownOpen) {
      document.addEventListener("mousedown", handleClick);
      return () => document.removeEventListener("mousedown", handleClick);
    }
  }, [dropdownOpen]);

  // Close dropdown on Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setDropdownOpen(false);
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, []);

  // "/" opens search when not typing in a field
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key !== "/") return;
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || el?.isContentEditable) return;
      e.preventDefault();
      setSearchOpen(true);
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, []);

  async function handleSignOut() {
    setDropdownOpen(false);
    await authClient.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <>
    <nav className="border-b border-border bg-card/80 backdrop-blur-sm fixed top-0 left-0 right-0 z-50">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">

        {/* Logo */}
        <Link href="/dashboard" className="flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-primary" aria-hidden="true" />
          <span
            className="text-xl font-bold text-primary"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Bookloop
          </span>
        </Link>

        <div className="flex items-center gap-6">
          {/* Nav links — hidden on mobile, shown on md+ */}
          {links.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                "hidden md:block text-sm transition-colors hover:text-primary relative",
                pathname === href
                  ? "text-primary font-semibold"
                  : "text-muted-foreground"
              )}
            >
              {label}
              {href === "/feed" && pendingCount > 0 && (
                <span
                  aria-label={`${pendingCount} pending friend request${pendingCount > 1 ? "s" : ""}`}
                  style={{
                    position: "absolute", top: "-6px", right: "-10px",
                    minWidth: "16px", height: "16px",
                    background: "var(--primary)", color: "var(--primary-foreground)",
                    borderRadius: "8px", fontSize: "10px", fontWeight: 700,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    padding: "0 4px", lineHeight: 1,
                  }}
                >
                  {pendingCount}
                </span>
              )}
            </Link>
          ))}

          {/* Search */}
          {session && (
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className={iconButtonClass}
              aria-label="Search journal"
              title="Search (/)"
            >
              <Search className="w-4 h-4" aria-hidden="true" />
            </button>
          )}

          {/* Bug report */}
          <button
            type="button"
            onClick={() => setBugModalOpen(true)}
            className={iconButtonClass}
            aria-label="Report a bug"
          >
            <Bug className="w-4 h-4" aria-hidden="true" />
          </button>

          {/* Dark mode toggle */}
          {mounted && (
            <button
              type="button"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className={iconButtonClass}
              aria-label="Toggle dark mode"
            >
              {theme === "dark"
                ? <Sun className="w-4 h-4" aria-hidden="true" />
                : <Moon className="w-4 h-4" aria-hidden="true" />
              }
            </button>
          )}

          {/* Auth area */}
          {session ? (
            <div ref={dropdownRef} style={{ position: "relative" }}>
              {/* Profile trigger */}
              <button
                type="button"
                onClick={() => setDropdownOpen(prev => !prev)}
                aria-haspopup="true"
                aria-expanded={dropdownOpen}
                aria-label="Open profile menu"
                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors"
              >
                <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center">
                  <User className="w-3.5 h-3.5 text-primary" aria-hidden="true" />
                </div>
                <span className="hidden sm:block">
                  {session.user.name?.split(" ")[0] ?? "Profile"}
                </span>
                <ChevronDown
                  className="w-3 h-3 hidden sm:block"
                  aria-hidden="true"
                  style={{
                    transform: dropdownOpen ? "rotate(180deg)" : "rotate(0deg)",
                    transition: "transform 0.15s",
                  }}
                />
              </button>

              {/* Dropdown */}
              {dropdownOpen && (
                <div
                  role="menu"
                  aria-label="Profile menu"
                  style={{
                    position: "absolute", right: 0, top: "calc(100% + 8px)",
                    minWidth: "180px",
                    background: "var(--card)",
                    border: "0.5px solid var(--border)",
                    borderRadius: "var(--radius)",
                    boxShadow: "0 4px 24px rgba(0,0,0,0.12)",
                    overflow: "hidden",
                    zIndex: 60,
                  }}
                >
                  {/* User info header */}
                  <div style={{
                    padding: "12px 14px",
                    borderBottom: "0.5px solid var(--border)",
                  }}>
                    <p style={{ fontSize: "13px", fontWeight: 600, color: "var(--foreground)", margin: 0 }}>
                      {session.user.name ?? "Reader"}
                    </p>
                    <p style={{
                      fontSize: "11px", color: "var(--muted-foreground)", margin: "2px 0 0",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"
                    }}>
                      {session.user.email}
                    </p>
                  </div>

                  {/* Profile link */}
                  <Link
                    href="/profile"
                    role="menuitem"
                    onClick={() => setDropdownOpen(false)}
                    style={{
                      display: "flex", alignItems: "center", gap: "8px",
                      padding: "10px 14px", fontSize: "13px",
                      color: "var(--foreground)", textDecoration: "none",
                    }}
                    className="hover:bg-muted transition-colors"
                  >
                    <Settings size={13} aria-hidden="true" style={{ color: "var(--muted-foreground)" }} />
                    Profile &amp; settings
                  </Link>

                  {/* Sign out */}
                  <button
                    type="button"
                    role="menuitem"
                    onClick={handleSignOut}
                    style={{
                      width: "100%", textAlign: "left",
                      display: "flex", alignItems: "center", gap: "8px",
                      padding: "10px 14px", fontSize: "13px",
                      color: "var(--muted-foreground)",
                      background: "none", border: "none",
                      cursor: "pointer", fontFamily: "inherit",
                      borderTop: "0.5px solid var(--border)",
                    }}
                    className="hover:text-destructive hover:bg-muted transition-colors"
                  >
                    <LogOut size={13} aria-hidden="true" />
                    Sign out
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" >
                <Link href="/login">Sign in</Link>
              </Button>
              <Button size="sm" >
                <Link href="/register">Sign up</Link>
              </Button>
            </div>
          )}
        </div>
      </div>
    </nav>
    {bugModalOpen && <BugReportModal onClose={() => setBugModalOpen(false)} />}
    {searchOpen && <SearchPanel onClose={() => setSearchOpen(false)} />}
    </>
  );
}
