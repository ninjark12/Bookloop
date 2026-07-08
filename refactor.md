# Refactor + TanStack Query Setup -- Claude Code Task

Reference CLAUDE_CODE_CONTEXT.md for full project context and patterns.

## Scope and philosophy

This is a SCOPED refactor. The rules:

1. DO NOT rewrite JournalPageClient's optimistic entry logic. It works. Leave it.
2. DO NOT change any user-visible behavior. This is pure internal restructuring.
3. New patterns (service layer, route wrapper, TanStack Query) apply to ALL NEW code
   going forward. Existing code migrates only where specified below.
4. Every step must leave the app in a working state. Run `bun run build` after each
   major task to verify.

Order of tasks matters. Do them in sequence.

---

## Task 1: Install and configure TanStack Query

### 1a. Install

```bash
bun add @tanstack/react-query
```

### 1b. Create the provider

File: `src/components/providers/QueryProvider.tsx`

```typescript
"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

export default function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,        // 30s -- data considered fresh
            gcTime: 5 * 60_000,       // 5min -- cache garbage collection
            retry: 1,                 // one retry on failure
            refetchOnWindowFocus: false, // avoid surprise refetches
          },
        },
      })
  );

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
```

### 1c. Wrap the app

File: `src/app/layout.tsx`

Wrap the existing body content with QueryProvider. It must be inside the html/body
but outside page content. If there are other providers, QueryProvider goes outermost
of the client providers.

```tsx
<body>
  <QueryProvider>
    {/* existing providers and children */}
  </QueryProvider>
</body>
```

Verify: `bun run build` passes.

---

## Task 2: Route handler wrapper

File: `src/lib/api.ts`

```typescript
import { NextResponse } from "next/server";
import { getSession } from "@/lib/get-session";

type Session = NonNullable<Awaited<ReturnType<typeof getSession>>>;

type AuthedHandler = (
  req: Request,
  session: Session,
  params: Record<string, string>
) => Promise<Response>;

type PublicHandler = (
  req: Request,
  session: Session | null,
  params: Record<string, string>
) => Promise<Response>;

/**
 * Wraps a route handler with session check + error boundary.
 * Returns 401 if no session. Returns 500 JSON on uncaught errors.
 */
export function withAuth(handler: AuthedHandler) {
  return async (req: Request, context?: { params: Promise<Record<string, string>> }) => {
    try {
      const session = await getSession();
      if (!session?.user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      const params = context?.params ? await context.params : {};
      return await handler(req, session, params);
    } catch (err) {
      console.error(`[API ERROR] ${req.method} ${req.url}:`, err);
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
  };
}

/**
 * Same error boundary but session is optional (for public/anonymous routes
 * like feedback submission).
 */
export function withOptionalAuth(handler: PublicHandler) {
  return async (req: Request, context?: { params: Promise<Record<string, string>> }) => {
    try {
      const session = await getSession();
      const params = context?.params ? await context.params : {};
      return await handler(req, session, params);
    } catch (err) {
      console.error(`[API ERROR] ${req.method} ${req.url}:`, err);
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
  };
}
```

NOTE: Next.js 15 App Router passes params as a Promise -- the wrapper handles
awaiting it so handlers receive plain objects.

Usage pattern for all NEW routes:

```typescript
import { withAuth } from "@/lib/api";

export const GET = withAuth(async (req, session, params) => {
  // session.user.id guaranteed, params already awaited
  return NextResponse.json({ data });
});
```

Verify: `bun run build` passes (the file compiles even though nothing uses it yet).

---

## Task 3: Service layer

Create directory: `src/lib/db/`

These modules own all domain queries. Route handlers call these, never raw queries
for domain logic. UUID validation happens HERE, not in routes.

### 3a. src/lib/db/validate.ts

```typescript
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Better Auth user IDs are arbitrary text; book/entry IDs are UUIDs. */
export function isUuid(v: string): boolean {
  return UUID_RE.test(v);
}

/** Throws a typed error the route wrapper converts to 400. */
export class ValidationError extends Error {
  status = 400;
}

export function assertUuid(v: string, label = "id"): void {
  if (!isUuid(v)) throw new ValidationError(`Invalid ${label}`);
}
```

Also update `src/lib/api.ts` withAuth/withOptionalAuth catch blocks to handle it:

```typescript
} catch (err) {
  if (err instanceof ValidationError) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
  console.error(`[API ERROR] ${req.method} ${req.url}:`, err);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}
```

(Import ValidationError from "@/lib/db/validate" in api.ts.)

### 3b. src/lib/db/friends.ts

```typescript
import { db } from "@/db";
import { sql } from "drizzle-orm";

/**
 * True if an ACCEPTED friend request exists between the two users
 * in either direction. This is THE friendship check -- use it everywhere.
 */
export async function isFriend(userA: string, userB: string): Promise<boolean> {
  const result = await db.execute(sql`
    SELECT 1 FROM friend_requests
    WHERE status = 'ACCEPTED'
      AND (
        (sender_id = ${userA} AND receiver_id = ${userB})
        OR
        (sender_id = ${userB} AND receiver_id = ${userA})
      )
    LIMIT 1
  `);
  return result.length > 0;
}

/** All accepted friends of a user, with display info. */
export async function getFriends(userId: string) {
  return db.execute(sql`
    SELECT u.id, u.name, u.image, u.display_name, u.discriminator
    FROM users u
    JOIN friend_requests fr ON (
      (fr.sender_id = ${userId} AND fr.receiver_id = u.id)
      OR
      (fr.receiver_id = ${userId} AND fr.sender_id = u.id)
    )
    WHERE fr.status = 'ACCEPTED' AND u.id != ${userId}
    ORDER BY u.name
  `);
}

/**
 * Removes a friendship by setting status to DECLINED.
 * Returns true if a friendship was found and removed.
 */
export async function removeFriend(userId: string, friendId: string): Promise<boolean> {
  const result = await db.execute(sql`
    UPDATE friend_requests
    SET status = 'DECLINED', updated_at = NOW()
    WHERE status = 'ACCEPTED'
      AND (
        (sender_id = ${userId} AND receiver_id = ${friendId})
        OR
        (sender_id = ${friendId} AND receiver_id = ${userId})
      )
    RETURNING id
  `);
  return result.length > 0;
}

/** Pending incoming requests for the inbox panel. */
export async function getPendingRequests(userId: string) {
  return db.execute(sql`
    SELECT fr.id, fr.created_at, u.id as sender_id, u.name, u.image,
           u.display_name, u.discriminator
    FROM friend_requests fr
    JOIN users u ON u.id = fr.sender_id
    WHERE fr.receiver_id = ${userId} AND fr.status = 'PENDING'
    ORDER BY fr.created_at DESC
  `);
}
```

### 3c. src/lib/db/journal.ts

```typescript
import { db } from "@/db";
import { sql } from "drizzle-orm";
import { assertUuid } from "./validate";

/**
 * THE spoiler filter. Public entries from `ownerId` for `bookId`,
 * visible only up to the viewer's furthest chapter.
 * viewerChapter = 0 means the viewer hasn't started -- sees nothing.
 * Whole-book entries (chapter_end = 9999) are visible only if the viewer
 * has also finished (viewerChapter = 9999) or explicitly at 9999.
 */
export async function getPublicEntriesForViewer(
  ownerId: string,
  bookId: string,
  viewerChapter: number
) {
  assertUuid(bookId, "bookId");
  return db.execute(sql`
    SELECT je.*
    FROM journal_entries je
    WHERE je.user_id = ${ownerId}
      AND je.book_id = ${bookId}
      AND je.is_public = true
      AND je.chapter_end <= ${viewerChapter}
    ORDER BY je.chapter_end DESC
  `);
}

/** Count of spoiler-hidden public entries (for the "X entries hidden" banner). */
export async function getHiddenEntryCount(
  ownerId: string,
  bookId: string,
  viewerChapter: number
): Promise<number> {
  assertUuid(bookId, "bookId");
  const result = await db.execute(sql`
    SELECT COUNT(*)::int AS count
    FROM journal_entries je
    WHERE je.user_id = ${ownerId}
      AND je.book_id = ${bookId}
      AND je.is_public = true
      AND je.chapter_end > ${viewerChapter}
  `);
  return (result[0] as any)?.count ?? 0;
}

/** Distinct tags on entries the viewer can see (spoiler-safe tag list). */
export async function getVisibleTags(
  ownerId: string,
  bookId: string,
  viewerChapter: number
) {
  assertUuid(bookId, "bookId");
  return db.execute(sql`
    SELECT jet.tag, jet.namespace, jet.name, COUNT(*)::int AS count
    FROM journal_entry_tags jet
    JOIN journal_entries je ON je.id = jet.entry_id
    WHERE je.user_id = ${ownerId}
      AND je.book_id = ${bookId}
      AND je.is_public = true
      AND je.chapter_end <= ${viewerChapter}
    GROUP BY jet.tag, jet.namespace, jet.name
    ORDER BY count DESC
  `);
}

/** Tags for a single entry (for the entry detail view + polling). */
export async function getEntryTags(entryId: string) {
  assertUuid(entryId, "entryId");
  return db.execute(sql`
    SELECT tag, namespace, name, source, verified
    FROM journal_entry_tags
    WHERE entry_id = ${entryId}
    ORDER BY namespace, name
  `);
}
```

### 3d. src/lib/db/books.ts

```typescript
import { db } from "@/db";
import { sql } from "drizzle-orm";

/** Books where `ownerId` has at least one PUBLIC entry -- for friend profile grid. */
export async function getPublicBooksForUser(ownerId: string) {
  return db.execute(sql`
    SELECT
      b.*,
      rp.status,
      rp.furthest_chapter,
      COUNT(je.id)::int AS public_entry_count
    FROM books b
    JOIN reading_progress rp ON rp.book_id = b.id AND rp.user_id = ${ownerId}
    JOIN journal_entries je ON je.book_id = b.id
      AND je.user_id = ${ownerId}
      AND je.is_public = true
    GROUP BY b.id, rp.status, rp.furthest_chapter, rp.updated_at
    ORDER BY rp.updated_at DESC
  `);
}

/** The viewer's furthest chapter on a book. 0 if not started. */
export async function getViewerChapter(viewerId: string, bookId: string): Promise<number> {
  const result = await db.execute(sql`
    SELECT furthest_chapter FROM reading_progress
    WHERE user_id = ${viewerId} AND book_id = ${bookId}
    LIMIT 1
  `);
  return (result[0] as any)?.furthest_chapter ?? 0;
}
```

### 3e. src/lib/db/users.ts

```typescript
import { db } from "@/db";
import { sql } from "drizzle-orm";

/** Look up a user by their URL identifier. Uses id since Better Auth ids are text. */
export async function getUserById(id: string) {
  const result = await db.execute(sql`
    SELECT id, name, image, display_name, discriminator, streak_count
    FROM users WHERE id = ${id} LIMIT 1
  `);
  return result[0] ?? null;
}

/** Search by displayName#discriminator, e.g. "Maya#0001". */
export async function findUserByTag(displayName: string, discriminator: string) {
  const result = await db.execute(sql`
    SELECT id, name, image, display_name, discriminator
    FROM users
    WHERE display_name = ${displayName} AND discriminator = ${discriminator}
    LIMIT 1
  `);
  return result[0] ?? null;
}
```

Verify: `bun run build` passes.

---

## Task 4: Migrate the friend/feedback routes to the new patterns

If CLAUDE_CODE_FRIENDS_FEEDBACK.md tasks were already implemented, migrate those
routes to use withAuth + service layer. If not yet implemented, implement them
directly in the new style. Either way the final state is:

### /api/friends (GET)
```typescript
import { withAuth } from "@/lib/api";
import { getFriends } from "@/lib/db/friends";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export const GET = withAuth(async (_req, session) => {
  const friends = await getFriends(session.user.id);
  return NextResponse.json({ friends });
});
```

### /api/friends/[friendId] (DELETE)
```typescript
export const DELETE = withAuth(async (_req, session, params) => {
  const removed = await removeFriend(session.user.id, params.friendId);
  if (!removed) {
    return NextResponse.json({ error: "Friendship not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
});
```

### /api/users/[userId]/books (GET)
Friendship check via isFriend(), then getPublicBooksForUser(). 403 if not friends.

### /api/users/[userId]/books/[bookId]/entries (GET)
isFriend() -> getViewerChapter() -> getPublicEntriesForViewer() +
getHiddenEntryCount() + getVisibleTags(). Return all three.

### /api/feedback (POST)
Uses withOptionalAuth (anonymous feedback allowed).

### /api/entries/[entryId]/tags (GET)
NEW route for tag polling:
```typescript
export const GET = withAuth(async (_req, session, params) => {
  // Ownership or friendship check: entry must belong to session user
  // OR be a public entry of a friend. For simplicity phase 1: owner only.
  const tags = await getEntryTags(params.entryId);
  const status = await db.execute(sql`
    SELECT processing_status FROM journal_entries WHERE id = ${params.entryId}
    AND user_id = ${session.user.id} LIMIT 1
  `);
  if (!status[0]) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({
    tags,
    processingStatus: (status[0] as any).processing_status
  });
});
```

DO NOT migrate these existing routes (leave them exactly as they are):
- /api/journal (all methods) -- works, has SQS logic, high regression risk
- /api/books/search, /api/books/add, /api/books/status, /api/books/remove
- /api/feed
- /api/cron/streak-reminder
- Auth routes

Verify: `bun run build` passes. Manually test one migrated route.

---

## Task 5: TanStack Query hooks for new features

Create directory: `src/hooks/`

### 5a. src/hooks/useFriends.ts

```typescript
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export type Friend = {
  id: string;
  name: string;
  image: string | null;
  display_name: string | null;
  discriminator: string | null;
};

export function useFriends(enabled = true) {
  return useQuery({
    queryKey: ["friends"],
    queryFn: async (): Promise<Friend[]> => {
      const res = await fetch("/api/friends");
      if (!res.ok) throw new Error("Failed to load friends");
      const data = await res.json();
      return data.friends;
    },
    enabled, // pass false until the modal opens to avoid eager fetching
  });
}

export function useRemoveFriend() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (friendId: string) => {
      const res = await fetch(`/api/friends/${friendId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to remove friend");
      return friendId;
    },
    // Optimistic removal
    onMutate: async (friendId) => {
      await queryClient.cancelQueries({ queryKey: ["friends"] });
      const previous = queryClient.getQueryData<Friend[]>(["friends"]);
      queryClient.setQueryData<Friend[]>(["friends"], (old) =>
        old?.filter((f) => f.id !== friendId) ?? []
      );
      return { previous };
    },
    onError: (_err, _friendId, context) => {
      // Revert on failure
      if (context?.previous) {
        queryClient.setQueryData(["friends"], context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["friends"] });
    },
  });
}
```

### 5b. src/hooks/useEntryTags.ts

The tag polling hook. Polls while the entry is processing, stops when done.

```typescript
"use client";

import { useQuery } from "@tanstack/react-query";

export type EntryTag = {
  tag: string;
  namespace: string;
  name: string;
  source: string;
  verified: boolean;
};

type TagsResponse = {
  tags: EntryTag[];
  processingStatus: "pending" | "processing" | "done" | "failed";
};

export function useEntryTags(entryId: string | null) {
  return useQuery({
    queryKey: ["entry-tags", entryId],
    queryFn: async (): Promise<TagsResponse> => {
      const res = await fetch(`/api/entries/${entryId}/tags`);
      if (!res.ok) throw new Error("Failed to load tags");
      return res.json();
    },
    enabled: !!entryId,
    // Poll every 2.5s while processing, stop when done or failed.
    refetchInterval: (query) => {
      const status = query.state.data?.processingStatus;
      if (status === "done" || status === "failed") return false;
      return 2500;
    },
    // Safety: stop polling after ~60s regardless (24 polls)
    refetchIntervalInBackground: false,
  });
}
```

### 5c. src/hooks/useFriendJournal.ts

```typescript
"use client";

import { useQuery } from "@tanstack/react-query";

export function useFriendBooks(userId: string) {
  return useQuery({
    queryKey: ["friend-books", userId],
    queryFn: async () => {
      const res = await fetch(`/api/users/${userId}/books`);
      if (!res.ok) throw new Error("Failed to load books");
      return res.json();
    },
  });
}

export function useFriendEntries(userId: string, bookId: string) {
  return useQuery({
    queryKey: ["friend-entries", userId, bookId],
    queryFn: async () => {
      const res = await fetch(`/api/users/${userId}/books/${bookId}/entries`);
      if (!res.ok) throw new Error("Failed to load entries");
      return res.json(); // { entries, availableTags, hiddenCount, viewerChapter }
    },
  });
}
```

### 5d. Wire hooks into components

- ManageFriendsModal: replace any manual fetch/useState with useFriends(open)
  and useRemoveFriend(). The `enabled: open` pattern means it only fetches when
  the modal opens.
- FriendJournalClient: use useFriendEntries. Tag filtering stays client-side
  (filter the entries array by selected tags).
- Entry detail views (own journal): after an entry is saved and has a real id,
  render tags via useEntryTags(entryId). Show a subtle "Analyzing..." chip while
  processingStatus is pending/processing, tag chips when done, nothing on failed.

DO NOT convert JournalPageClient's entry CRUD to TanStack Query. Only ADD the
useEntryTags hook for the tags display. The optimistic entry save/edit/delete
logic stays untouched.

Verify: `bun run build` passes.

---

## Task 6: Feature flags

File: `src/lib/features.ts`

```typescript
/**
 * Central feature availability. Each flag reflects whether the required
 * infrastructure is configured. Routes and components gate on these
 * instead of checking env vars inline.
 */
export const Features = {
  /** SQS tagging pipeline (Lambda + Bedrock). */
  tagging: !!process.env.BOOKLOOP_TAGGING_QUEUE_URL,
  /** Gator author news microservice. */
  gator: !!process.env.GATOR_URL,
  /** Resend email (password reset, feedback, streak reminders). */
  email: !!process.env.RESEND_API_KEY,
} as const;
```

Migrate inline env checks to use Features:
- The SQS send in /api/journal POST: `if (Features.tagging) { ... }`
- gator-client.ts: `if (!Features.gator) return { posts: [] }`
- Email sends: `if (!Features.email) return`

NOTE: Features is server-only (env vars without NEXT_PUBLIC_ are not available
client-side). For client components that need to know if tagging is enabled,
pass it as a prop from a server component or include it in the API response
(e.g. the tags endpoint already implicitly communicates this via processingStatus).

Verify: `bun run build` passes.

---

## Task 7: Cache key registry

File: `src/lib/cache-keys.ts`

```typescript
/**
 * All Redis cache keys. Never write a key string inline in a route --
 * add it here so invalidation stays consistent.
 */
export const CacheKeys = {
  bookSearch: (q: string) => `book:search:${q.toLowerCase().trim()}`,
  entryTags: (entryId: string) => `tags:${entryId}`,
  friendsList: (userId: string) => `friends:${userId}`,
} as const;
```

Migrate the book search route's inline key construction to CacheKeys.bookSearch.
This is the only existing Redis usage to migrate. New Redis usage must use this file.

Verify: `bun run build` passes and book search still works (cache hit/miss behavior
unchanged -- same key format as before, confirm by checking the existing key format
first and matching it EXACTLY so existing cached data stays valid).

IMPORTANT: read the current key format in the book search route BEFORE writing
CacheKeys.bookSearch. If the existing format differs (e.g. no trim, different
prefix), match the existing format to avoid invalidating the production cache.

---

## Task 8: Component folder organization

Move files into feature folders. Update all imports. NO logic changes.

```
src/components/
  providers/
    QueryProvider.tsx          (created in Task 1)
  journal/
    JournalPageClient.tsx      (moved)
  dashboard/
    DashboardClient.tsx        (moved -- note: exports Spine used by journal)
  feed/
    (feed-related components)  (moved)
  friends/
    ManageFriendsModal.tsx     (moved or created)
    FriendJournalClient.tsx    (moved or created)
    AddFriendModal.tsx         (if exists)
  feedback/
    FeedbackModal.tsx          (moved or created)
  shared/
    Navbar.tsx                 (moved)
    ConditionalFooter.tsx      (moved)
    Footer.tsx                 (if separate)
  ui/                          (shadcn -- DO NOT MOVE)
```

Gotcha: JournalPageClient imports Spine from DashboardClient. Either:
(a) extract Spine to src/components/shared/Spine.tsx (preferred -- it's shared), or
(b) update the import path.
Prefer (a): create shared/Spine.tsx, export from there, update both importers.

Use search across the codebase for every moved file's old import path and update.
TypeScript path alias @/components/... makes this a find/replace per file.

Verify: `bun run build` passes. This task has zero runtime changes -- build passing
is sufficient verification.

---

## Task 9: Verification pass

Run in order:
1. `bun run build` -- must pass with no errors
2. `bun run lint` (or bunx eslint if no script) -- fix any import errors
3. If tests exist (vitest): `bun run test` -- all existing tests must still pass.
   Update test imports for moved components.

Manual smoke test list:
- [ ] Login works
- [ ] Dashboard loads with books
- [ ] Journal page opens, new entry saves optimistically (UNCHANGED behavior)
- [ ] Book search works (cache keys unchanged)
- [ ] Feed loads
- [ ] Manage Friends modal opens, lists friends, remove works with optimistic update
- [ ] Friend journal pages load with spoiler filtering
- [ ] Tag chips appear on entries after Lambda processes (or "Analyzing..." shows
      if tagging enabled, nothing if disabled)
- [ ] Feedback modal submits

---

## Summary of new conventions (for all future work)

1. New API route = withAuth/withOptionalAuth wrapper from @/lib/api
2. Domain queries live in src/lib/db/* -- routes never contain raw domain SQL
3. The spoiler filter is getPublicEntriesForViewer -- never reimplement it
4. The friendship check is isFriend -- never reimplement it
5. New client data fetching = TanStack Query hook in src/hooks/
6. Redis keys come from CacheKeys -- never inline strings
7. Feature availability checks come from Features -- never inline env checks
8. New components go in their feature folder under src/components/
9. JournalPageClient optimistic logic is legacy-stable: do not refactor it
   without an explicit task saying so
