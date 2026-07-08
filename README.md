# Bookloop

A reading journal for people who want to read more intentionally and share with friends spoiler free. 

**Live:** [bookloop.sh](https://bookloop.sh)

## Features

**Journal**
- Write entries scoped to a single chapter, a range, or the whole book
- Edit and delete entries inline
- Optimistic UI — entries appear instantly and revert cleanly on failure
- Keyboard shortcuts: `Shift+N` for new entry, `Shift+Enter` to save, `Escape` to close

**Dashboard**
- Book-style two-page spread with animated notebook opening sequence
- Paginated grid — left page fills first, then right, then turns the page
- Revisit animation replays after 24 hours away
- Reading status management per book with optimistic updates

**Feed**
- Friends' public journal entries with automatic spoiler protection — entries are hidden until you've reached that chapter
- Spoiler tags generated via AWS Bedrock so you can take a peek at what you might get spoiled on.
- Author news via RSS aggregation (Gator microservice integration)

**Tags & search**
- Every entry is tagged against a controlled taxonomy (theme, emotion, character, plot, claim, evidence, tone, and more) and embedded for search — generated in the background by an AWS Lambda tagger
- Per-entry Tags modal to view, add, and remove tags, with a live "Analyzing…" indicator while the tagger runs
- Journal search — press `/` or the navbar search icon for a slide-out panel. Mix booru-style tags (`theme:betrayal -type:summary`) with plain language ("sad chapters about power"), ranked by meaning, keywords, and tags
- Search your own journal or your friends', spoiler-filtered per book the same way the feed is
- Book search via Open Library API with write-through cache to PostgreSQL

**Streak system**
- Daily reading streak with a 24-hour grace period before it resets
- Email reminders via Resend when you're in the grace window
- Redis-backed deduplication so streaks are only awarded once per day

**Reports**
- In-app bug and feature-request modal, delivered by email via Resend

**Chrome extension**
- Detects chapter changes on MangaDex, Webtoon, MangaPlus, and Tapas
- Prompts a journal entry modal with an 8-second delay
- Deep-links directly into the correct book and chapter in the app
- Extension is inpired by MAL Sync


## Using it

Everything lives at [bookloop.sh](https://bookloop.sh) — nothing to install.

- **Add books** from the Books search and set a reading status (reading, read, TBR, DNF).
- **Journal as you read** — scope each entry to a chapter, a range, or the whole book, and mark it public when you want to share it.
- **Add friends** to see each other's public entries in the Feed, revealed only up to the chapter you've reached. Spoiler tags give a safe heads-up before you choose to peek.
- **Search** your journal (or a friend's) by pressing `/` — type tags like `theme:betrayal` or just describe what you remember. Entries get tagged automatically; open an entry's **Tags** to add or remove your own.
- **Keep a streak** by writing daily — you'll get an email reminder if you're about to lose it.
- **Install the Chrome extension** to catch chapter changes on MangaDex, Webtoon, MangaPlus, and Tapas and jump straight into a journal entry.

## Tech stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack) |
| Language | TypeScript |
| Auth | Better Auth |
| Database | Supabase PostgreSQL (pgvector) via Drizzle ORM |
| Client data | TanStack Query |
| Cache | Redis (ioredis locally, Upstash on Vercel) |
| Styling | Tailwind CSS + shadcn/ui |
| Animation | GSAP |
| Email | Resend |
| Scheduling | Upstash QStash (streak reminders) |
| AI / search | AWS Bedrock — Claude Haiku (tagging + spoilers), Titan Embeddings V2 |
| Async jobs | AWS SQS (+ DLQ) → AWS Lambda (tagger) |
| Infra as code | Terraform (tagger stack) |
| Deployment | Vercel |
| AWS | Bedrock, Lambda, SQS, S3, CloudWatch, IAM |

---



## Project structure

```
src/
  app/
    (auth)/               # login, register, password reset
    api/                  # REST API routes
      books/              # search, add, status, remove
      entries/[id]/tags/  # per-entry tags
      feed/               # friends activity + author news
      journal/            # CRUD for journal entries
      search/             # journal search
      users/              # user search
      friends/            # friend requests
      bug-report/         # bug / feature reports
      cron/               # streak reminder (Vercel cron)
    dashboard/            # main book grid
    feed/                 # social feed page
    journal/[bookId]/     # per-book journal
    profile/              # account settings
  components/
    providers/            # TanStack Query provider
    search/               # SearchPanel, TagChip
    journal/              # EntryTagsModal
    friends/              # friend requests provider
    layout/               # Navbar, Footer, BottomNav
    DashboardClient       # animated book spread with pagination
    JournalPageClient     # two-page journal layout
    FeedClient            # friends + author news tabs
    ProfileClient         # notification toggle, delete account
  hooks/                  # TanStack Query hooks (search, entry tags)
  db/
    schema.ts             # Drizzle schema
    index.ts              # database client
  lib/
    api.ts                # route wrapper (auth + error handling)
    features.ts           # feature flags
    db/                   # domain queries (friends, journal, books, users, search)
    search/               # query parser + Bedrock/Titan clients
    auth.ts               # Better Auth server config
    streak.ts             # streak logic with grace period
    email.ts              # Resend email templates
    gator-client.ts       # Gator RSS microservice client
    bedrock.ts            # spoiler-tag generation
    redis.ts              # Redis singleton
drizzle/                  # SQL migrations
scripts/                  # one-off maintenance scripts
tagger/                   # SQS -> Lambda tagger + Terraform infra
bookloop-extension/       # Chrome extension
```

---

## License

MIT
