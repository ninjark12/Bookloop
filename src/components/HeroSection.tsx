import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function HeroSection() {
  return (
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
        <Button size="lg">
          <Link href="/register">Start journaling</Link>
        </Button>
        <Button size="lg" variant="outline">
          <Link href="/dashboard">See demo</Link>
        </Button>
      </div>
    </section>
  );
}
