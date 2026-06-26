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

  const cacheHeader = res.headers["x-redis-cache"];
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
