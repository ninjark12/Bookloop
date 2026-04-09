import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type Props = {
  title: string;
  author: string;
  chapter: number;
  status: "READING" | "READ" | "TBR";
};

const statusColor = {
  READING: "bg-accent text-accent-foreground",
  READ: "bg-primary text-primary-foreground",
  TBR: "bg-muted text-muted-foreground",
};

export default function BookCard({ title, author, chapter, status }: Props) {
  return (
    <Card className="hover:shadow-md transition-shadow cursor-pointer">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base leading-tight"
            style={{ fontFamily: "var(--font-display)" }}>
            {title}
          </CardTitle>
          <Badge className={statusColor[status]}>{status}</Badge>
        </div>
        <p className="text-xs text-muted-foreground">{author}</p>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          {status === "TBR" ? "Not started" : `Up to chapter ${chapter}`}
        </p>
      </CardContent>
    </Card>
  );
}
