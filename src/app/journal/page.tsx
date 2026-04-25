import EmptyState from "@/components/EmptyState";
import StatCard from "@/components/StatCard";
import { BookOpen, Flame, BookMarked } from "lucide-react";

export default function JournalPage() {
  return (
    <div className="max-w-6xl mx-auto px-6 py-12">
      <h1
        className="text-3xl font-bold text-primary mb-2"
        style={{ fontFamily: "var(--font-display)" }}
      >
        My journal
      </h1>
      <p className="text-muted-foreground mb-8">
        Your reflections, chapter by chapter.
      </p>

      {/* Stats row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-12">
        <StatCard
          label="Current streak"
          value="7 days"
          icon={Flame}
          sub="Keep it going!"
        />
        <StatCard
          label="Total entries"
          value={0}
          icon={BookMarked}
          sub="Start writing today"
        />
        <StatCard
          label="Books tracked"
          value={0}
          icon={BookOpen}
          sub="Add your first book"
        />
      </div>

      {/* Empty state */}
      <EmptyState
        title="No journal entries yet"
        description="Start by adding a book to your reading list,
                     then write your first reflection."
        actionLabel="Find a book"
        actionHref="/books"
      />
    </div>
  );
}
