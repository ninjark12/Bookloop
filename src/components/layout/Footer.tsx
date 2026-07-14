"use client"
import { BookOpen } from "lucide-react";
import { usePathname } from "next/navigation";

export default function Footer() {
  const pathname = usePathname();
  if (pathname.startsWith("/journal") || pathname.startsWith("/dashboard") || pathname.startsWith("/u/")) {
    return null;
  } else {
    return (

      <footer className="border-t border-border bg-card mt-auto">
        <div className="max-w-6xl mx-auto px-6 py-8 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-primary" />
            <span className="text-sm font-semibold text-primary"
              style={{ fontFamily: "var(--font-display)" }}>
              Bookloop
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            Stay in the loop with your reading.
          </p>
        </div>
      </footer>
    );
  }

}
