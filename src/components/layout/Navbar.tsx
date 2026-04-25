"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { BookOpen, User, LogOut, Sun, Moon } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { useEffect, useState } from "react";

const links = [
  { href: "/", label: "Home" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/journal", label: "Journal" },
  { href: "/books/search", label: "Books" },
];

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = authClient.useSession();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Only render theme toggle after mount to avoid hydration mismatch
  useEffect(() => setMounted(true), []);

  async function handleSignOut() {
    await authClient.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <nav className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">

        {/* Logo */}
        <Link href="/" className="flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-primary" />
          <span
            className="text-xl font-bold text-primary"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Bookloop
          </span>
        </Link>

        <div className="flex items-center gap-6">
          {/* Nav links */}
          {links.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                "text-sm transition-colors hover:text-primary",
                pathname === href
                  ? "text-primary font-semibold"
                  : "text-muted-foreground"
              )}
            >
              {label}
            </Link>
          ))}

          {/* Dark mode toggle */}
          {mounted && (
            <button
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className="w-8 h-8 flex items-center justify-center rounded-md
                         text-muted-foreground hover:text-primary
                         hover:bg-muted transition-colors"
              aria-label="Toggle dark mode"
            >
              {theme === "dark"
                ? <Sun className="w-4 h-4" />
                : <Moon className="w-4 h-4" />
              }
            </button>
          )}

          {/* Auth area */}
          {session ? (
            <div className="flex items-center gap-3">
              <Link
                href="/profile"
                className="flex items-center gap-2 text-sm text-muted-foreground
                           hover:text-primary transition-colors"
              >
                <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center">
                  <User className="w-3.5 h-3.5 text-primary" />
                </div>
                <span className="hidden sm:block">
                  {session.user.name?.split(" ")[0] ?? "Profile"}
                </span>
              </Link>
              <button
                onClick={handleSignOut}
                className="flex items-center gap-1.5 text-sm text-muted-foreground
                           hover:text-destructive transition-colors"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden sm:block">Sign out</span>
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm">
                <Link href="/login">Sign in</Link>
              </Button>
              <Button size="sm">
                <Link href="/register">Sign up</Link>
              </Button>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
