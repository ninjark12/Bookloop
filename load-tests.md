# Load Testing Setup - Claude Code Task

## Context
Bookloop is a Next.js 15 app deployed at bookloop.sh (Vercel). The Author News Aggregator
is a C#/.NET service (not yet deployed - test locally for now against localhost).
Both use PostgreSQL via Supabase (transaction pooler port 6543).
Redis (Upstash) is used as a write-through cache on /api/books/search.

This task creates a complete k6 load testing suite plus the one BookLoop API change
needed to make cache metrics measurable.

---

## Step 1 - Add X-Cache header to /api/books/search

File: src/app/api/books/search/route.ts

The book search route currently hits Redis first and falls back to Open Library.
Add a response header so k6 can count cache hits vs misses.

Find the place where Redis returns a cached result and add:
```typescript
headers: { "X-Cache": "HIT" }
```

Find the place where Open Library is called (cache miss path) and add:
```typescript
headers: { "X-Cache": "MISS" }
```

The full response should look like:
```typescript
// Cache hit path:
return NextResponse.json(cached, {
  headers: { "X-Cache": "HIT" }
});

// Cache miss path (after fetching from Open Library and writing to Redis):
return NextResponse.json(data, {
  headers: { "X-Cache": "MISS" }
});
```

Verify: curl -I https://bookloop.sh/api/books/search?q=dune should show X-Cache in response headers.

---

## Step 2 - Create the load testing directory

Create this directory structure at the repo root:

```
load-tests/
  bookloop/
    bookloop-smoke.js       -- 5 VUs, 30s, sanity check
    bookloop-load.js        -- 50 VUs, 3 min, sustained load
    bookloop-spike.js       -- ramp to 200 VUs, find the ceiling
    bookloop-cache.js       -- cache hit rate measurement only
  gator/
    gator-load.js           -- posts endpoint + author registration
  shared/
    auth.js                 -- shared auth helper
    checks.js               -- shared check functions
  .env.example              -- documents required env vars
  README.md                 -- how to run each test
```

---

## Step 3 - Create load-tests/.env.example

```bash
# Bookloop
BOOKLOOP_URL=https://bookloop.sh
AUTH_TOKEN=your_better_auth_session_token_here
BOOK_ID=a-valid-book-uuid-from-your-db
USER_ID=your-user-uuid

# Gator (use http://localhost:5000 for local testing)
GATOR_URL=http://localhost:5000
GATOR_API_KEY=your-gator-api-key
AUTHOR_IDS=uuid1,uuid2,uuid3
```

---

## Step 4 - Create load-tests/shared/auth.js

```javascript
// shared/auth.js
// Helpers for authenticated requests to Bookloop.
// Better Auth uses a session cookie. Pass AUTH_TOKEN env var
// which is the value of the better-auth.session_token cookie.

export function authHeaders() {
  return {
    Cookie: `better-auth.session_token=${__ENV.AUTH_TOKEN}`,
    "Content-Type": "application/json",
  };
}

export function gatorHeaders() {
  return {
    "X-Api-Key": __ENV.GATOR_API_KEY,
    "Content-Type": "application/json",
  };
}
```

---

## Step 5 - Create load-tests/shared/checks.js

```javascript
// shared/checks.js
import { check } from "k6";
import { Rate } from "k6/metrics";

export const errorRate = new Rate("errors");

export function checkOk(res, name) {
  const ok = check(res, {
    [`${name} status 200`]: (r) => r.status === 200,
    [`${name} no error body`]: (r) => !r.body?.includes('"error"'),
  });
  if (!ok) errorRate.add(1);
  return ok;
}

export function checkCreated(res, name) {
  const ok = check(res, {
    [`${name} status 201`]: (r) => r.status === 201,
  });
  if (!ok) errorRate.add(1);
  return ok;
}
```

---

## Step 6 - Create load-tests/bookloop/bookloop-smoke.js

```javascript
// bookloop-smoke.js
// Purpose: Quick sanity check before running heavier tests.
// Run with: k6 run bookloop-smoke.js
// Expected: all checks pass, no errors, latency under 1s

import http from "k6/http";
import { sleep } from "k6";
import { authHeaders } from "../shared/auth.js";
import { checkOk } from "../shared/checks.js";

export const options = {
  vus: 5,
  duration: "30s",
  thresholds: {
    http_req_duration: ["p95<1000"],
    errors: ["rate<0.01"],
  },
};

const BASE = __ENV.BOOKLOOP_URL || "https://bookloop.sh";

export default function () {
  const h = authHeaders();

  // Health check: journal entries
  const journal = http.get(`${BASE}/api/journal?bookId=${__ENV.BOOK_ID}`, { headers: h });
  checkOk(journal, "journal");

  // Health check: book search (should hit Redis cache on repeat calls)
  const search = http.get(`${BASE}/api/books/search?q=dune`, { headers: h });
  checkOk(search, "book-search");

  // Health check: feed
  const feed = http.get(`${BASE}/api/feed`, { headers: h });
  checkOk(feed, "feed");

  sleep(1);
}
```

---

## Step 7 - Create load-tests/bookloop/bookloop-load.js

```javascript
// bookloop-load.js
// Purpose: Sustained load test simulating real concurrent users.
// Run with: k6 run bookloop-load.js
// Measures: p95 latency per endpoint, error rate, cache hit rate

import http from "k6/http";
import { sleep } from "k6";
import { Trend, Rate, Counter } from "k6/metrics";
import { authHeaders } from "../shared/auth.js";
import { checkOk } from "../shared/checks.js";

// Custom metrics - these show up in k6 output and cloud dashboard
const journalLatency  = new Trend("latency_journal");
const feedLatency     = new Trend("latency_feed");
const searchLatency   = new Trend("latency_search");
const cacheHits       = new Counter("cache_hits");
const cacheMisses     = new Counter("cache_misses");

export const options = {
  stages: [
    { duration: "30s", target: 10  },  // ramp up slowly
    { duration: "2m",  target: 50  },  // sustained load
    { duration: "30s", target: 0   },  // ramp down
  ],
  thresholds: {
    http_req_duration:  ["p95<500"],   // 95% of all requests under 500ms
    latency_journal:    ["p95<400"],   // journal specifically
    latency_feed:       ["p95<600"],   // feed has more DB work
    latency_search:     ["p95<200"],   // search should be fast via cache
    errors:             ["rate<0.01"], // under 1% error rate
  },
};

const BASE = __ENV.BOOKLOOP_URL || "https://bookloop.sh";

export default function () {
  const h = authHeaders();

  // Journal entries for a specific book
  const journalRes = http.get(
    `${BASE}/api/journal?bookId=${__ENV.BOOK_ID}`,
    { headers: h }
  );
  journalLatency.add(journalRes.timings.duration);
  checkOk(journalRes, "journal");

  // Feed (friends + author news)
  const feedRes = http.get(`${BASE}/api/feed`, { headers: h });
  feedLatency.add(feedRes.timings.duration);
  checkOk(feedRes, "feed");

  // Book search - track cache hits vs misses
  const searchRes = http.get(
    `${BASE}/api/books/search?q=dune`,
    { headers: h }
  );
  searchLatency.add(searchRes.timings.duration);
  checkOk(searchRes, "book-search");

  // Count cache behavior from the X-Cache header added in Step 1
  const cacheHeader = searchRes.headers["X-Cache"];
  if (cacheHeader === "HIT")  cacheHits.add(1);
  if (cacheHeader === "MISS") cacheMisses.add(1);

  sleep(1);
}

// Runs once after the test completes
export function handleSummary(data) {
  const hits   = data.metrics.cache_hits?.values?.count   || 0;
  const misses = data.metrics.cache_misses?.values?.count || 0;
  const total  = hits + misses;
  const hitRate = total > 0 ? ((hits / total) * 100).toFixed(1) : "N/A";

  console.log("\n=== CACHE SUMMARY ===");
  console.log(`Cache hits:   ${hits}`);
  console.log(`Cache misses: ${misses}`);
  console.log(`Hit rate:     ${hitRate}%`);
  console.log("====================\n");

  return {
    "load-tests/results/bookloop-load-summary.json": JSON.stringify(data, null, 2),
  };
}
```

---

## Step 8 - Create load-tests/bookloop/bookloop-spike.js

```javascript
// bookloop-spike.js
// Purpose: Find the throughput ceiling - where does latency blow up?
// Run with: k6 run bookloop-spike.js
// Watch for: when p95 breaks 500ms or errors start climbing

import http from "k6/http";
import { sleep } from "k6";
import { authHeaders } from "../shared/auth.js";
import { checkOk, errorRate } from "../shared/checks.js";

export const options = {
  stages: [
    { duration: "30s", target: 10  },
    { duration: "1m",  target: 50  },
    { duration: "1m",  target: 100 },
    { duration: "1m",  target: 200 }, // spike - 4x sustained load
    { duration: "30s", target: 50  }, // partial recovery
    { duration: "30s", target: 0   },
  ],
  // No hard thresholds here - we want to observe the ceiling, not fail early
};

const BASE = __ENV.BOOKLOOP_URL || "https://bookloop.sh";

export default function () {
  const h = authHeaders();
  const res = http.get(`${BASE}/api/feed`, { headers: h });
  checkOk(res, "feed-spike");
  sleep(0.5); // tighter sleep to increase pressure
}
```

---

## Step 9 - Create load-tests/bookloop/bookloop-cache.js

```javascript
// bookloop-cache.js
// Purpose: Isolate Redis cache performance. Run this first with a warm cache,
// then flush Redis and run again to get the cold vs warm comparison.
// Run with: k6 run bookloop-cache.js

import http from "k6/http";
import { Trend, Counter } from "k6/metrics";
import { authHeaders } from "../shared/auth.js";

const coldLatency = new Trend("cold_latency");
const warmLatency = new Trend("warm_latency");
const cacheHits   = new Counter("cache_hits");
const cacheMisses = new Counter("cache_misses");

export const options = {
  vus: 20,
  duration: "1m",
};

const BASE   = __ENV.BOOKLOOP_URL || "https://bookloop.sh";
// Test several queries to get a representative sample
const QUERIES = ["dune", "mistborn", "berserk", "one piece", "naruto"];

export default function () {
  const h = authHeaders();
  const q = QUERIES[Math.floor(Math.random() * QUERIES.length)];

  const res = http.get(`${BASE}/api/books/search?q=${q}`, { headers: h });

  const cacheHeader = res.headers["X-Cache"];
  if (cacheHeader === "HIT") {
    cacheHits.add(1);
    warmLatency.add(res.timings.duration);
  } else {
    cacheMisses.add(1);
    coldLatency.add(res.timings.duration);
  }
}

export function handleSummary(data) {
  const hits    = data.metrics.cache_hits?.values?.count    || 0;
  const misses  = data.metrics.cache_misses?.values?.count  || 0;
  const total   = hits + misses;
  const hitRate = total > 0 ? ((hits / total) * 100).toFixed(1) : "N/A";
  const coldP95 = data.metrics.cold_latency?.values?.["p(95)"]?.toFixed(0) || "N/A";
  const warmP95 = data.metrics.warm_latency?.values?.["p(95)"]?.toFixed(0) || "N/A";

  console.log("\n=== CACHE PERFORMANCE ===");
  console.log(`Hit rate:      ${hitRate}%`);
  console.log(`Cold p95:      ${coldP95}ms  (Open Library + Redis write)`);
  console.log(`Warm p95:      ${warmP95}ms  (Redis read only)`);
  console.log("=========================\n");

  return {
    "load-tests/results/bookloop-cache-summary.json": JSON.stringify(data, null, 2),
  };
}
```

---

## Step 10 - Create load-tests/gator/gator-load.js

```javascript
// gator-load.js
// Purpose: Load test the Author News Aggregator C# service.
// Run locally first: k6 run gator-load.js -e GATOR_URL=http://localhost:5000
//
// Two concurrent scenarios:
//   1. get_posts - simulates BookLoop feed page calling the aggregator
//   2. register_authors - simulates new book adds registering authors

import http from "k6/http";
import { check, sleep } from "k6";
import { Trend, Rate } from "k6/metrics";
import { gatorHeaders } from "../shared/auth.js";

const postsLatency      = new Trend("gator_posts_latency");
const registerLatency   = new Trend("gator_register_latency");
const errorRate         = new Rate("errors");

export const options = {
  scenarios: {
    // Scenario 1: sustained reads (BookLoop feed page)
    get_posts: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "30s", target: 20  },
        { duration: "2m",  target: 50  },
        { duration: "30s", target: 0   },
      ],
      exec: "getPosts",
    },
    // Scenario 2: bursty writes (users adding books triggers author registration)
    register_authors: {
      executor: "constant-arrival-rate",
      rate: 3,           // 3 registrations per second
      timeUnit: "1s",
      duration: "2m",
      preAllocatedVUs: 15,
      exec: "registerAuthor",
    },
  },
  thresholds: {
    gator_posts_latency:    ["p95<300"],  // posts should be fast
    gator_register_latency: ["p95<500"],
    errors:                 ["rate<0.01"],
  },
};

const GATOR = __ENV.GATOR_URL || "http://localhost:5000";
const h     = gatorHeaders();

// Simulates BookLoop's getPostsForAuthors call
export function getPosts() {
  const ids = __ENV.AUTHOR_IDS || "";
  const res = http.get(
    `${GATOR}/api/authors/posts?ids=${ids}&page=0&size=20`,
    { headers: h }
  );
  postsLatency.add(res.timings.duration);
  const ok = check(res, {
    "posts 200": (r) => r.status === 200,
    "posts has content": (r) => {
      try {
        const body = JSON.parse(r.body);
        return Array.isArray(body.content);
      } catch { return false; }
    },
  });
  if (!ok) errorRate.add(1);
  sleep(0.5);
}

// Simulates BookLoop's registerAuthor call when a user adds a book
export function registerAuthor() {
  const payload = JSON.stringify({
    name: `Test Author ${Math.floor(Math.random() * 10000)}`,
    feedUrls: [
      `https://www.goodreads.com/author/list/${Math.floor(Math.random() * 9000000) + 1000000}.rss`,
    ],
  });
  const res = http.post(`${GATOR}/api/authors/get-or-create`, payload, { headers: h });
  registerLatency.add(res.timings.duration);
  const ok = check(res, {
    "register 200 or 201": (r) => r.status === 200 || r.status === 201,
  });
  if (!ok) errorRate.add(1);
}
```

---

## Step 11 - Create load-tests/README.md

```markdown
# Bookloop Load Tests

Uses [k6](https://k6.io). Install: `scoop install k6` (Windows) or `brew install k6`.

## Setup

Copy .env.example and fill in values:
```bash
cp .env.example .env
```

Get your AUTH_TOKEN from browser DevTools:
- Open bookloop.sh, log in
- DevTools -> Application -> Cookies -> bookloop.sh
- Copy the value of `better-auth.session_token`

Get a BOOK_ID from Supabase: any row in reading_progress that belongs to your user.

## Running tests

Always run smoke first to confirm auth works:
```bash
k6 run bookloop/bookloop-smoke.js \
  -e BOOKLOOP_URL=https://bookloop.sh \
  -e AUTH_TOKEN=your_token \
  -e BOOK_ID=your_book_uuid
```

Sustained load test (the main one):
```bash
k6 run bookloop/bookloop-load.js \
  -e BOOKLOOP_URL=https://bookloop.sh \
  -e AUTH_TOKEN=your_token \
  -e BOOK_ID=your_book_uuid
```

Cache comparison (flush Redis first for cold run):
```bash
# Cold run: flush Upstash Redis via dashboard first, then:
k6 run bookloop/bookloop-cache.js \
  -e BOOKLOOP_URL=https://bookloop.sh \
  -e AUTH_TOKEN=your_token

# Warm run: run immediately after without flushing
k6 run bookloop/bookloop-cache.js \
  -e BOOKLOOP_URL=https://bookloop.sh \
  -e AUTH_TOKEN=your_token
```

Spike test (find the ceiling):
```bash
k6 run bookloop/bookloop-spike.js \
  -e BOOKLOOP_URL=https://bookloop.sh \
  -e AUTH_TOKEN=your_token \
  -e BOOK_ID=your_book_uuid
```

Gator (run against local service first):
```bash
k6 run gator/gator-load.js \
  -e GATOR_URL=http://localhost:5000 \
  -e GATOR_API_KEY=your_key \
  -e AUTHOR_IDS=uuid1,uuid2
```

## Results

JSON summaries are written to load-tests/results/ after each run.
The handleSummary functions print a human-readable cache summary to stdout.

## Metrics to record for resume

After running bookloop-load.js, note:
- p95 latency per endpoint (journal, feed, search)
- Overall error rate
- Cache hit rate from the summary output
- Peak VUs sustained before degradation

After running bookloop-spike.js, note:
- VU count where p95 first breaks 500ms
- VU count where error rate first breaks 1%

After running bookloop-cache.js (cold vs warm):
- Cold p95 (Open Library + Redis write)
- Warm p95 (Redis read only)
- The ratio is your "Redis reduced latency by Nx" number

After running gator-load.js:
- p95 for posts endpoint under 50 concurrent readers
- p95 for author registration under 3/s arrival rate
```

---

## Step 12 - Add results directory with .gitkeep

Create: load-tests/results/.gitkeep (empty file)
Add to .gitignore:
```
load-tests/results/*.json
```

---

## Important notes for Claude Code

1. Do NOT run k6 directly - just create the files. The user will run tests manually.

2. The X-Cache header change in Step 1 is the only code change to the Bookloop
   application itself. Everything else is new files in load-tests/.

3. Check that src/app/api/books/search/route.ts actually uses Redis before adding
   the header. Read the file first to find the exact cache hit/miss branch points.
   The Redis client is at src/lib/redis.ts.

4. Create load-tests/results/ with a .gitkeep so the directory exists but results
   are gitignored.

5. All k6 scripts use ES module syntax (import/export) which k6 supports natively.
   Do not use require().

6. The gator/gator-load.js uses two named scenarios with separate exec functions -
   this is k6's scenario API, not standard VU functions. The two exported functions
   getPosts and registerAuthor are both valid k6 entry points when referenced by
   the scenarios config.
```
