import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Toggle-able feature flag (mutated per test)
vi.mock("@/lib/features", () => ({
  Features: { search: true, gator: false, email: false },
}));
vi.mock("@/lib/search/expand", () => ({ expandQuery: vi.fn() }));
vi.mock("@/lib/search/embed", () => ({ embedQuery: vi.fn() }));
vi.mock("@/lib/db/search", () => ({ hybridSearch: vi.fn(), tagOnlySearch: vi.fn() }));

import { GET } from "@/app/api/search/route";
import { Features } from "@/lib/features";
import { expandQuery } from "@/lib/search/expand";
import { embedQuery } from "@/lib/search/embed";
import { hybridSearch, tagOnlySearch } from "@/lib/db/search";

function req(qs: string) {
  return new NextRequest(`http://localhost/api/search${qs}`);
}

beforeEach(() => {
  // global setup runs clearAllMocks first, then we (re)prime the mocks
  Features.search = true;
  vi.mocked(expandQuery).mockResolvedValue({ tags: ["theme:betrayal"], semanticQuery: "SEM" });
  vi.mocked(embedQuery).mockResolvedValue([0.1, 0.2, 0.3]);
  vi.mocked(hybridSearch).mockResolvedValue([] as never);
  vi.mocked(tagOnlySearch).mockResolvedValue([] as never);
});

describe("GET /api/search", () => {
  it("returns 503 when search is disabled", async () => {
    Features.search = false;
    const res = await GET(req("?q=theme:betrayal"));
    expect(res.status).toBe(503);
  });

  it("returns empty results for a query shorter than 2 chars", async () => {
    const res = await GET(req("?q=a"));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.results).toEqual([]);
    expect(data.expansion).toBeNull();
    expect(hybridSearch).not.toHaveBeenCalled();
    expect(tagOnlySearch).not.toHaveBeenCalled();
  });

  it("does not call Bedrock for a pure-tag query", async () => {
    const res = await GET(req("?q=theme:betrayal"));
    expect(res.status).toBe(200);
    expect(expandQuery).not.toHaveBeenCalled();
    expect(embedQuery).not.toHaveBeenCalled();
    expect(tagOnlySearch).toHaveBeenCalledTimes(1);
    expect(hybridSearch).not.toHaveBeenCalled();
  });

  it("expands then embeds for a natural-language query, then runs hybrid search", async () => {
    await GET(req(`?q=${encodeURIComponent("sad chapters about betrayal")}`));

    expect(expandQuery).toHaveBeenCalledWith("sad chapters about betrayal");
    expect(embedQuery).toHaveBeenCalledWith("SEM");
    // expansion must happen before embedding (embed consumes the semanticQuery)
    expect(vi.mocked(expandQuery).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(embedQuery).mock.invocationCallOrder[0]
    );

    expect(hybridSearch).toHaveBeenCalledTimes(1);
    const arg = vi.mocked(hybridSearch).mock.calls[0][0];
    expect(arg.queryVector).toEqual([0.1, 0.2, 0.3]);
    expect(arg.ftsQuery).toBe("sad chapters about betrayal");
    expect(arg.expandedTags).toEqual(["theme:betrayal"]);
    expect(tagOnlySearch).not.toHaveBeenCalled();
  });

  it("excludes an expanded tag that the user negated", async () => {
    vi.mocked(expandQuery).mockResolvedValue({
      tags: ["theme:betrayal", "type:summary"],
      semanticQuery: "SEM",
    });
    await GET(req(`?q=${encodeURIComponent("betrayal -type:summary")}`));
    const arg = vi.mocked(hybridSearch).mock.calls[0][0];
    expect(arg.expandedTags).toEqual(["theme:betrayal"]);
    expect(arg.excludeTags).toEqual(["type:summary"]);
  });

  it("passes scope=friends through to the service layer", async () => {
    await GET(req("?q=theme:betrayal&scope=friends"));
    expect(vi.mocked(tagOnlySearch).mock.calls[0][0].scope).toBe("friends");
  });

  it("defaults to scope=mine", async () => {
    await GET(req("?q=theme:betrayal"));
    expect(vi.mocked(tagOnlySearch).mock.calls[0][0].scope).toBe("mine");
  });
});
