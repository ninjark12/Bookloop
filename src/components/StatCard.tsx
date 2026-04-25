import { Card, CardContent } from "@/components/ui/card";
import type { LucideIcon } from "lucide-react";

type Props = {
  label: string;
  value: string | number;
  icon: LucideIcon;
  sub?: string;
};

export default function StatCard({ label, value, icon: Icon, sub }: Props) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-muted-foreground">{label}</span>
          <Icon className="w-4 h-4 text-muted-foreground" />
        </div>
        <div
          className="text-2xl font-bold text-primary"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {value}
        </div>
        {sub && (
          <p className="text-xs text-muted-foreground mt-1">{sub}</p>
        )}
      </CardContent>
    </Card>
  );
}
