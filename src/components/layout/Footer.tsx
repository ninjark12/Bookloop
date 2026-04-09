import { BookOpen } from "lucide-react";

export default function Footer() {
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
