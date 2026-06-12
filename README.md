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

**Streak system**
- Daily reading streak with a 24-hour grace period before it resets
- Email reminders via Resend when you're in the grace window
- Redis-backed deduplication so streaks are only awarded once per day

**Search**
- Book search via Open Library API with write-through cache to PostgreSQL database hosted on Supabase

**Chrome extension**
- Detects chapter changes on MangaDex, Webtoon, MangaPlus, and Tapas
- Prompts a journal entry modal with an 8-second delay
- Deep-links directly into the correct book and chapter in the app
- Extension is inpired by MAL Sync


## Tech stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 (App Router, Turbopack) |
| Language | TypeScript |
| Auth | Better Auth |
| Database | Supabase PostgreSQL via Drizzle ORM |
| Cache | Redis (ioredis locally, Upstash on Vercel) |
| Styling | Tailwind CSS + shadcn/ui |
| Animation | GSAP |
| Email | Resend |
| Deployment | Vercel |
| Local infra | Docker + Docker Compose |
| Cloud | AWS Bedrock + Lambda + S3 |

---



## Project structure

```
src/
  app/
    (auth)/           # login and register pages
    api/              # REST API routes
      books/          # search, add, status, remove
      feed/           # friends activity + author news
      journal/        # CRUD for journal entries
      user/           # account deletion, notification prefs
      cron/           # streak reminder (Vercel cron)
    dashboard/        # main book grid
    feed/             # social feed page
    journal/[bookId]/ # per-book journal
    profile/          # account settings
  components/
    layout/           # Navbar, Footer
    DashboardClient   # animated book spread with pagination
    JournalPageClient # two-page journal layout
    FeedClient        # friends + author news tabs
    ProfileClient     # notification toggle, delete account
  db/
    schema.ts         # Drizzle schema
    index.ts          # database client
  lib/
    auth.ts           # Better Auth server config
    auth-client.ts    # Better Auth client config
    get-session.ts    # safe session helper (try/catch wrapper)
    streak.ts         # streak logic with grace period
    email.ts          # Resend email templates
    gator-client.ts   # Gator RSS microservice client
    redis.ts          # Redis singleton
bookloop-extension/   # Chrome extension
```

---

## License

MIT
