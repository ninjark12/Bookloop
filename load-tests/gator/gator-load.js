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
    gator_posts_latency:    ["p(95)<300"],  // posts should be fast
    gator_register_latency: ["p(95)<500"],
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
