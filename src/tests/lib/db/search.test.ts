import { describe, it, expect, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { db } from "@/db";
import { hybridSearch, tagOnlySearch } from "@/lib/db/search";

const dialect = new PgDialect();

/** Compile the last SQL passed to the mocked db.execute into { sql, params }. */
function lastQuery(): { sql: string; params: unknown[] } {
  const calls = vi.mocked(db.execute).mock.calls;
  const arg = calls[calls.length - 1][0] as SQL;
  return dialect.sqlToQuery(arg);
}

const base = {
  viewerId: "user-1",
  expandedTags: [] as string[],
  queryVector: null,
  ftsQuery: "betrayal",
};

describe("hybridSearch SQL", () => {
  it("fuses the three rankers with RRF k=60", async () => {
    await hybridSearch({ ...base, scope: "mine", includeTags: [], excludeTags: [] });
    expect(lastQuery().sql).toContain("1.0 / (60 + rank)");
  });

  it("applies AND semantics for includeTags via HAVING COUNT(DISTINCT tag)", async () => {
    await hybridSearch({
      ...base,
      scope: "mine",
      includeTags: ["theme:betrayal", "type:quote"],
      excludeTags: [],
    });
    const { sql, params } = lastQuery();
    expect(sql).toContain("HAVING COUNT(DISTINCT tag) =");
    // the tag count is bound as a parameter
    expect(params).toContain(2);
  });

  it("emits a NOT IN filter for excludeTags", async () => {
    await hybridSearch({
      ...base,
      scope: "mine",
      includeTags: [],
      excludeTags: ["type:summary"],
    });
    expect(lastQuery().sql).toContain("s.id NOT IN");
  });

  it("friends scope spoiler-filters against the viewer's progress", async () => {
    await hybridSearch({ ...base, scope: "friends", includeTags: [], excludeTags: [] });
    const { sql } = lastQuery();
    expect(sql).toContain("friend_ids");
    expect(sql).toContain("je.chapter_end <= COALESCE(vp.furthest_chapter, 0)");
  });

  it("only ranks entries that have an embedding when a vector is provided", async () => {
    await hybridSearch({
      ...base,
      scope: "mine",
      includeTags: [],
      excludeTags: [],
      queryVector: [0.1, 0.2],
    });
    const { sql } = lastQuery();
    expect(sql).toContain("s.embedding IS NOT NULL");
    expect(sql).toContain("<=>");
  });
});

describe("tagOnlySearch SQL", () => {
  it("orders by verified-boosted tag score then recency", async () => {
    await tagOnlySearch({
      viewerId: "user-1",
      scope: "mine",
      includeTags: ["theme:betrayal"],
      excludeTags: [],
    });
    const { sql } = lastQuery();
    expect(sql).toContain("ORDER BY scored.tag_score DESC");
    expect(sql).toContain("f2.created_at DESC");
  });

  it("carries the friends spoiler filter into the fallback path too", async () => {
    await tagOnlySearch({
      viewerId: "user-1",
      scope: "friends",
      includeTags: [],
      excludeTags: [],
    });
    expect(lastQuery().sql).toContain("COALESCE(vp.furthest_chapter, 0)");
  });
});
