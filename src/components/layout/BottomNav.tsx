"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, Search, Users, User } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { useEffect, useState } from "react";

const items = [
  { href: "/dashboard", label: "Journal", icon: BookOpen },
  { href: "/books/search", label: "Books", icon: Search },
  { href: "/feed", label: "Feed", icon: Users },
  { href: "/profile", label: "Profile", icon: User },
] as const;

export default function BottomNav() {
  const pathname = usePathname();
  const { data: session } = authClient.useSession();
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    if (!session) return;
    fetch("/api/friends/requests")
      .then((r) => r.json())
      .then((json) => setPendingCount(json.requests?.length ?? 0))
      .catch(() => {});
  }, [session, pathname]);

  if (!session) return null;

  return (
    <nav
      aria-label="Mobile navigation"
      className="flex md:hidden"
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        height: "56px",
        background: "var(--card)",
        borderTop: "0.5px solid var(--border)",
        alignItems: "stretch",
        zIndex: 40,
      }}
    >
      {items.map(({ href, label, icon: Icon }) => {
        const active =
          pathname === href ||
          (href === "/dashboard" && pathname.startsWith("/journal"));
        const isFeed = href === "/feed";

        return (
          <Link
            key={href}
            href={href}
            aria-label={label}
            aria-current={active ? "page" : undefined}
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: "3px",
              color: active ? "var(--primary)" : "var(--muted-foreground)",
              textDecoration: "none",
              fontSize: "10px",
              fontWeight: active ? 600 : 400,
              transition: "color 0.15s",
            }}
          >
            <div style={{ position: "relative" }}>
              <Icon size={20} aria-hidden="true" />
              {isFeed && pendingCount > 0 && (
                <span
                  aria-label={`${pendingCount} pending friend request${pendingCount > 1 ? "s" : ""}`}
                  style={{
                    position: "absolute", top: "-4px", right: "-6px",
                    minWidth: "14px", height: "14px",
                    background: "var(--primary)", color: "var(--primary-foreground)",
                    borderRadius: "7px", fontSize: "9px", fontWeight: 700,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    padding: "0 3px", lineHeight: 1,
                  }}
                >
                  {pendingCount}
                </span>
              )}
            </div>
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
