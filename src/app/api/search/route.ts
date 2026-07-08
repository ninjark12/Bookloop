import { withAuth } from "@/lib/api";
import { Features } from "@/lib/features";
import { parseQuery } from "@/lib/search/parser";
import { expandQuery } from "@/lib/search/expand";
import { embedQuery } from "@/lib/search/embed";
import { hybridSearch, tagOnlySearch } from "@/lib/db/search";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export const GET = withAuth(async (req, session) => {
  if (!Features.search) {
    return NextResponse.json({ error: "Search is not enabled" }, { status: 503 });
  }

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").slice(0, 300).trim();
  const scope = url.searchParams.get("scope") === "friends" ? "friends" : "mine";

  if (q.length < 2) {
    return NextResponse.json({ results: [], expansion: null });
  }

  const parsed = parseQuery(q);
  const hasNL = parsed.naturalLanguage.length > 0;

  let expandedTags: string[] = [];
  let queryVector: number[] | null = null;
  let ftsQuery: string | null = null;

  if (hasNL) {
    // FTS uses the raw NL immediately; expansion produces the semanticQuery
    // that gets embedded, so those two are sequential.
    ftsQuery = parsed.naturalLanguage;
    const expansion = await expandQuery(parsed.naturalLanguage);
    expandedTags = expansion.tags.filter((t) => !parsed.excludeTags.includes(t));
    queryVector = await embedQuery(expansion.semanticQuery);
  }

  const results = hasNL
    ? await hybridSearch({
        viewerId: session.user.id,
        scope,
        includeTags: parsed.includeTags,
        excludeTags: parsed.excludeTags,
        expandedTags,
        queryVector,
        ftsQuery,
      })
    : await tagOnlySearch({
        viewerId: session.user.id,
        scope,
        includeTags: parsed.includeTags,
        excludeTags: parsed.excludeTags,
      });

  return NextResponse.json({
    results,
    expansion: hasNL ? { tags: expandedTags } : null,
    parsed: { includeTags: parsed.includeTags, excludeTags: parsed.excludeTags },
  });
});
