import { vi, beforeEach } from "vitest";

// Prevent "server-only" from throwing in the test environment
vi.mock("server-only", () => ({}));

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
      signOut: vi.fn().mockResolvedValue(undefined),
    },
  },
}));

// -- Mock Drizzle DB --
// Chains that end in .returning() resolve via that mock.
// Chains that end in .limit() / .where() / .offset() return `this`; awaiting them
// calls `then`, which resolves with [] by default.
// Override per-test: vi.mocked(db.limit).mockResolvedValueOnce([data])
vi.mock("@/db", () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    offset: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([]),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    onConflictDoUpdate: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    then: vi.fn().mockImplementation((resolve: (value: unknown) => void) => resolve([])),
    transaction: vi.fn().mockImplementation(async (cb: (tx: unknown) => unknown) => {
      const tx = {
        delete: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([]),
        insert: vi.fn().mockReturnThis(),
        values: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
        set: vi.fn().mockReturnThis(),
      };
      return cb(tx);
    }),
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

// Reset call tracking between tests (implementations persist)
beforeEach(() => {
  vi.clearAllMocks();
});
