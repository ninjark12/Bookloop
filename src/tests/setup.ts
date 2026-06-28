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
    onConflictDoNothing: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    execute: vi.fn().mockResolvedValue([]),
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
    del: vi.fn().mockResolvedValue(1),
    status: "ready",
    once: vi.fn(),
  },
  keys: {
    streak: (userId: string) => `streak:${userId}`,
    bookSearch: (q: string) => `book_search:${encodeURIComponent(q)}`,
    bookLocalSearch: (q: string) => `book_local_search:${encodeURIComponent(q)}`,
    bookDesc: (k: string) => `book_desc:${encodeURIComponent(k)}`,
    feed: (userId: string) => `feed:${userId}`,
    rateLimit: (userId: string, ep: string) => `rl:${ep}:${userId}`,
    progress: (userId: string, bookId: string) => `progress:${userId}:${bookId}`,
  },
  TTL: {
    BOOK_SEARCH: 3600,
    BOOK_LOCAL_SEARCH: 300,
    BOOK_DESC: 604800,
    STREAK: 90000,
    FEED: 60,
    PROGRESS: 300,
  },
  getJSON: vi.fn().mockResolvedValue(null),
  setJSON: vi.fn().mockResolvedValue(undefined),
}));

// Mock Chrome extension APIs (used by extension tests; no-op in all others)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(global as any).chrome = {
  storage: {
    local: {
      get: vi.fn(),
      set: vi.fn(),
      remove: vi.fn(),
    },
    session: {
      get: vi.fn(),
      set: vi.fn(),
    },
  },
  runtime: {
    sendMessage: vi.fn(),
    onMessage: { addListener: vi.fn() },
    lastError: null,
  },
  tabs: {
    query: vi.fn(),
    sendMessage: vi.fn(),
  },
};

// Reset call tracking between tests (implementations persist)
beforeEach(() => {
  vi.clearAllMocks();
});
