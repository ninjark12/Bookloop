import { BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

type Props = {
  title: string;
  description: string;
  actionLabel?: string;
  actionHref?: string;
};

export default function EmptyState({
  title,
  description,
  actionLabel,
  actionHref,
}: Props) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
        <BookOpen className="w-8 h-8 text-primary" />
      </div>
      <h3
        className="text-xl font-bold text-primary mb-2"
        style={{ fontFamily: "var(--font-display)" }}
      >
        {title}
      </h3>
      <p className="text-muted-foreground text-sm max-w-sm mb-6">
        {description}
      </p>
      {actionLabel && actionHref && (
        <Button>
          <Link href={actionHref}>{actionLabel}</Link>
        </Button>
      )}
    </div>
  );
}
