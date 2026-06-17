import { redirect } from "next/navigation";
import { getSession } from "@/lib/get-session";
import HeroSection from "@/components/HeroSection";
import FeatureCard from "@/components/FeatureCard";
import { BookOpen, Shield, Users } from "lucide-react";

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
  const session = await getSession();
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
