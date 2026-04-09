"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { BookOpen } from "lucide-react";

const links = [
  { href: "/", label: "Home" },
  { href: "/dashboard", label: "Dashboard" },
];

export default function Navbar() {
  const pathname = usePathname();
  return (
    <nav className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-primary" />
          <span className="font-display text-xl font-bold text-primary"
            style={{ fontFamily: "var(--font-display)" }}>
            Bookloop
          </span>
        </Link>
        <div className="flex items-center gap-6">
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
          <Button size="sm" >
            <Link href="/register">Sign up</Link>
          </Button>
        </div>
      </div>
    </nav>
  );
}
