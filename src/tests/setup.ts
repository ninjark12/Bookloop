import { vi, beforeEach } from "vitest";

// -- Mock next/headers --
vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
}));

// -- Mock next/navigation --
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => { throw new Error(`NEXT_REDIRECT:${url}`); }),
  notFound: vi.fn(() => { throw new Error("NEXT_NOT_FOUND"); }),
}));

// -- Mock Better Auth session --
// Default: authenticated. Override per-test with vi.mocked(auth.api.getSession).mockResolvedValueOnce(null)
vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: vi.fn().mockResolvedValue({
        user: { id: "user-123", email: "test@example.com", name: "Test User" },
        session: { id: "session-abc" },
      }),
    },
  },
}));

// -- Mock Drizzle DB --
// Each test file overrides the specific methods it needs.
vi.mock("@/db", () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([]),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    then: vi.fn(),
    innerJoin: vi.fn().mockReturnThis(),
  },
}));

// -- Mock Redis --
vi.mock("@/lib/redis", () => ({
  redis: {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue("OK"),
    setex: vi.fn().mockResolvedValue("OK"),
  },
  getStreak: vi.fn().mockResolvedValue(null),
  setStreak: vi.fn().mockResolvedValue(undefined),
}));

// Reset all mocks between tests so state doesn't bleed across
beforeEach(() => {
  vi.clearAllMocks();
});
