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
    http_req_duration: ["p(95)<1000"],
    errors: ["rate<0.01"],
  },
};

const BASE = __ENV.BOOKLOOP_URL || "https://bookloop.sh";

export default function () {
  const h = authHeaders();

  // Health check: friends list
  const friends = http.get(`${BASE}/api/friends`, { headers: h });
  checkOk(friends, "friends");

  // Health check: book search (should hit Redis cache on repeat calls)
  const search = http.get(`${BASE}/api/books/search?q=dune`, { headers: h });
  checkOk(search, "book-search");

  // Health check: feed
  const feed = http.get(`${BASE}/api/feed`, { headers: h });
  checkOk(feed, "feed");

  sleep(1);
}
