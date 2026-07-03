import { describe, it, expect, vi, beforeEach } from "vitest";

vi.hoisted(() => {
  process.env.GATOR_URL = "http://localhost:8080";
  process.env.GATOR_API_KEY = "test-key";
});

import { getPostsForAuthors, registerAuthor } from "@/lib/gator-client";

const VALID_UUID = "00000000-0000-0000-0000-000000000001";

const MOCK_POST = {
  id: "p1",
  title: "New Release",
  url: "http://example.com",
  description: null,
  type: "UpcomingRelease",
  source: "GoogleBooks",
  publishedAt: null,
  createdAt: "2024-01-01T00:00:00Z",
  isbn: null,
  coverImageUrl: null,
  releaseDate: null,
};

describe("registerAuthor", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  it("posts to /authors with just name", async () => {
    vi.mocked(fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: VALID_UUID, name: "Brandon Sanderson", createdAt: "2024-01-01T00:00:00Z" }),
    });
    const result = await registerAuthor("Brandon Sanderson");
    expect(result?.name).toBe("Brandon Sanderson");
    const [url, init] = (vi.mocked(fetch) as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/authors");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ name: "Brandon Sanderson" });
  });
});

describe("getPostsForAuthors", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  it("returns empty result when no author IDs are provided", async () => {
    const result = await getPostsForAuthors([]);
    expect(result.posts).toEqual([]);
    expect(result.nextCursor).toBeNull();
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it("filters out non-UUID author IDs before calling Gator", async () => {
    const result = await getPostsForAuthors(["not-a-uuid", "also-invalid"]);
    expect(result.posts).toEqual([]);
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it("calls /authors/{id}/posts for each valid UUID", async () => {
    vi.mocked(fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ posts: [], nextCursor: null }),
    });
    await getPostsForAuthors([VALID_UUID]);
    expect(vi.mocked(fetch)).toHaveBeenCalledOnce();
    const calledUrl = (vi.mocked(fetch) as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(calledUrl).toContain(`/authors/${VALID_UUID}/posts`);
  });

  it("returns empty result when Gator returns a non-OK response", async () => {
    vi.mocked(fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: false, status: 503 });
    const result = await getPostsForAuthors([VALID_UUID]);
    expect(result.posts).toEqual([]);
  });

  it("returns empty result on network error without throwing", async () => {
    vi.mocked(fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("Network error"));
    const result = await getPostsForAuthors([VALID_UUID]);
    expect(result.posts).toEqual([]);
  });

  it("returns posts from a successful Gator response", async () => {
    vi.mocked(fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ posts: [MOCK_POST], nextCursor: null }),
    });
    const result = await getPostsForAuthors([VALID_UUID]);
    expect(result.posts).toHaveLength(1);
    expect(result.posts[0].title).toBe("New Release");
  });

  it("sets nextCursor when Gator returns one", async () => {
    vi.mocked(fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ posts: [MOCK_POST], nextCursor: "abc123" }),
    });
    const result = await getPostsForAuthors([VALID_UUID]);
    expect(result.nextCursor).not.toBeNull();
  });

  it("merges and sorts posts from multiple authors by createdAt desc", async () => {
    const SECOND_UUID = "00000000-0000-0000-0000-000000000002";
    const olderPost = { ...MOCK_POST, id: "old", createdAt: "2023-01-01T00:00:00Z" };
    const newerPost = { ...MOCK_POST, id: "new", createdAt: "2024-06-01T00:00:00Z" };

    vi.mocked(fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ posts: [olderPost], nextCursor: null }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ posts: [newerPost], nextCursor: null }) });

    const result = await getPostsForAuthors([VALID_UUID, SECOND_UUID]);
    expect(result.posts[0].id).toBe("new");
    expect(result.posts[1].id).toBe("old");
  });
});
