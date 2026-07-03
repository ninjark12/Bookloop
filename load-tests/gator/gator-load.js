// gator-load.js
// Load test the Gator author-news service against the current API shape.
//
// Run:
//   k6 run gator-load.js \
//     -e GATOR_URL=http://localhost:8080 \
//     -e GATOR_API_KEY=<key>
//
// Two concurrent scenarios:
//   1. get_feed    – simulates BookLoop feed page hitting GET /feed
//   2. reg_authors – simulates book-adds triggering POST /authors

import http from "k6/http";
import { check, sleep } from "k6";
import { Trend, Rate } from "k6/metrics";
import { gatorHeaders } from "../shared/auth.js";

const feedLatency     = new Trend("gator_feed_latency");
const registerLatency = new Trend("gator_register_latency");
const errorRate       = new Rate("errors");

export const options = {
  scenarios: {
    get_feed: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "30s", target: 20 },
        { duration: "2m",  target: 50 },
        { duration: "30s", target: 0  },
      ],
      exec: "getFeed",
    },
    reg_authors: {
      executor: "constant-arrival-rate",
      rate: 3,
      timeUnit: "1s",
      duration: "2m",
      preAllocatedVUs: 15,
      exec: "registerAuthor",
    },
  },
  thresholds: {
    gator_feed_latency:     ["p(95)<300"],
    gator_register_latency: ["p(95)<500"],
    errors:                 ["rate<0.01"],
  },
};

const GATOR = (__ENV.GATOR_URL || "http://localhost:8080").replace(/\/$/, "");
const h     = gatorHeaders();

export function setup() {
  const res = http.get(`${GATOR}/health`);
  check(res, { "health ok": (r) => r.status === 200 });
}

// Simulates BookLoop's feed page loading author news
export function getFeed() {
  const res = http.get(`${GATOR}/feed?pageSize=20`, { headers: h });
  feedLatency.add(res.timings.duration);
  const ok = check(res, {
    "feed 200": (r) => r.status === 200,
    "feed has posts array": (r) => {
      try {
        const body = JSON.parse(r.body);
        return Array.isArray(body.posts);
      } catch { return false; }
    },
  });
  if (!ok) errorRate.add(1);
  else errorRate.add(0);
  sleep(0.5);
}

// Simulates ensureAuthorFollowed registering a new author via POST /authors
export function registerAuthor() {
  const payload = JSON.stringify({
    name: `Test Author ${Math.floor(Math.random() * 100000)}`,
  });
  const res = http.post(`${GATOR}/authors`, payload, { headers: h });
  registerLatency.add(res.timings.duration);
  const ok = check(res, {
    "register 201": (r) => r.status === 201,
    "register returns id": (r) => {
      try {
        const body = JSON.parse(r.body);
        return typeof body.id === "string";
      } catch { return false; }
    },
  });
  if (!ok) errorRate.add(1);
  else errorRate.add(0);
}
