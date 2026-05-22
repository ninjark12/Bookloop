import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import HeroSection from "@/components/HeroSection";
import FeatureCard from "@/components/FeatureCard";
import { BookOpen, Shield, Users } from "lucide-react";
export const dynamic = "force-dynamic"
const features = [
  {
    icon: BookOpen,
    title: "Chapter journals",
    description: "Reflect on specific chapters, ranges, or entire books. Keep your thoughts organised by what you've read.",
  },
  {
    icon: Shield,
    title: "Spoiler protection",
    description: "See friends' journals without spoilers. Entries are blurred until you've reached that chapter.",
  },
  {
    icon: Users,
    title: "Book clubs",
    description: "Read together with friends. Share progress, discuss chapters, and stay accountable.",
  },
];

export default async function Home() {
  let session = null;
  try {
    session = await auth.api.getSession({ headers: await headers() });
  } catch (e) {
    // Session cookie exists but the DB row is gone (expired and purged)
    // or the DB is momentarily unreachable. Treat as unauthenticated.
    console.error("[home] getSession failed:", e);
  }

  if (session) redirect("/dashboard");

  return (
    <div className="max-w-6xl mx-auto px-6">
      <HeroSection />
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
