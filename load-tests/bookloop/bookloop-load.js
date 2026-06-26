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
const friendsLatency  = new Trend("latency_friends");
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
    http_req_duration:  ["p(95)<500"],   // 95% of all requests under 500ms
    latency_friends:    ["p(95)<400"],   // friends list
    latency_feed:       ["p(95)<600"],   // feed has more DB work
    latency_search:     ["p(95)<200"],   // search should be fast via cache
    errors:             ["rate<0.01"], // under 1% error rate
  },
};

const BASE = __ENV.BOOKLOOP_URL || "https://bookloop.sh";

export default function () {
  const h = authHeaders();

  // Friends list
  const friendsRes = http.get(`${BASE}/api/friends`, { headers: h });
  friendsLatency.add(friendsRes.timings.duration);
  checkOk(friendsRes, "friends");

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

  // Count cache behavior from the x-redis-cache header
  const cacheHeader = searchRes.headers["X-Redis-Cache"];
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
