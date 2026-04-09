import Link from "next/link";
import { Button } from "@/components/ui/button";
import FeatureCard from "@/components/FeatureCard";
import { BookOpen, Shield, Users } from "lucide-react";

const features = [
  {
    icon: BookOpen,
    title: "Chapter journals",
    description:
      "Reflect on specific chapters, ranges, or entire books. Keep your thoughts organised by what you've read.",
  },
  {
    icon: Shield,
    title: "Spoiler protection",
    description:
      "See friends' journals without spoilers. Entries are blurred until you've reached that chapter.",
  },
  {
    icon: Users,
    title: "Book clubs",
    description:
      "Read together with friends. Share progress, discuss chapters, and stay accountable.",
  },
];

export default function Home() {
  return (
    <div className="max-w-6xl mx-auto px-6">
      {/* Hero */}
      <section className="py-24 text-center">
        <h1
          className="text-5xl font-bold text-primary mb-4 leading-tight"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Stay in the loop
          <br />
          with your books.
        </h1>
        <p className="text-lg text-muted-foreground max-w-xl mx-auto mb-8">
          A reading journal that grows with you. Reflect chapter by chapter,
          track your streak, and share your journey — without spoilers.
        </p>
        <div className="flex gap-3 justify-center">
          <Button size="lg" >
            <Link href="/register">Start journaling</Link>
          </Button>
          <Button size="lg" variant="outline" >
            <Link href="/dashboard">See demo</Link>
          </Button>
        </div>
      </section>

      {/* Features */}
      <section className="pb-24">
        <h2
          className="text-2xl font-bold text-center text-foreground mb-8"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Everything a reader needs
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {features.map((f) => (
            <FeatureCard key={f.title} {...f} />
          ))}
        </div>
      </section>
    </div>
  );
}
