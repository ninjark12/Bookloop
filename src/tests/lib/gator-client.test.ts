import { describe, it, expect, vi, beforeEach } from "vitest";

// vi.hoisted runs before any module imports, so GATOR_URL is set
// when gator-client.ts evaluates its module-level constant.
vi.hoisted(() => {
  process.env.GATOR_URL = "http://localhost:8080";
  process.env.GATOR_API_KEY = "test-key";
});

import { buildGoodreadsFeedUrl, getPostsForAuthors } from "@/lib/gator-client";

const VALID_UUID = "00000000-0000-0000-0000-000000000001";

describe("buildGoodreadsFeedUrl", () => {
  it("builds a valid Goodreads RSS URL for a numeric author ID", () => {
    const url = buildGoodreadsFeedUrl("12345");
    expect(url).toBe("https://www.goodreads.com/author/list/12345.rss");
  });

  it("throws for a non-numeric goodreadsId", () => {
    expect(() => buildGoodreadsFeedUrl("abc")).toThrow(/invalid goodreadsId/i);
  });

  it("throws for an ID with special characters", () => {
    expect(() => buildGoodreadsFeedUrl("123; DROP TABLE")).toThrow();
  });
});

describe("getPostsForAuthors", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  it("returns empty result when no author IDs are provided", async () => {
    const result = await getPostsForAuthors([]);
    expect(result.content).toEqual([]);
    expect(result.totalPages).toBe(0);
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it("filters out non-UUID author IDs before calling Gator", async () => {
    const result = await getPostsForAuthors(["not-a-uuid", "also-invalid"]);
    expect(result.content).toEqual([]);
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it("calls Gator with valid UUID author IDs", async () => {
    vi.mocked(fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ content: [], totalPages: 0, totalElements: 0, page: 0 }),
    });
    await getPostsForAuthors([VALID_UUID]);
    expect(vi.mocked(fetch)).toHaveBeenCalledOnce();
    const calledUrl = (vi.mocked(fetch) as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(calledUrl).toContain(VALID_UUID);
  });

  it("returns empty result when Gator returns a non-OK response", async () => {
    vi.mocked(fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: false, status: 503 });
    const result = await getPostsForAuthors([VALID_UUID]);
    expect(result.content).toEqual([]);
  });

  it("returns empty result on network error without throwing", async () => {
    vi.mocked(fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("Network error"));
    const result = await getPostsForAuthors([VALID_UUID]);
    expect(result.content).toEqual([]);
  });

  it("returns the posts from a successful Gator response", async () => {
    const post = {
      id: "p1",
      title: "New Release",
      url: "http://example.com",
      description: null,
      publishedAt: "2024-01-01",
      authorId: VALID_UUID,
      authorName: "Author",
    };
    vi.mocked(fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ content: [post], totalPages: 1, totalElements: 1, page: 0 }),
    });
    const result = await getPostsForAuthors([VALID_UUID]);
    expect(result.content).toHaveLength(1);
    expect(result.content[0].title).toBe("New Release");
  });
});
