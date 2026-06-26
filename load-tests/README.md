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
