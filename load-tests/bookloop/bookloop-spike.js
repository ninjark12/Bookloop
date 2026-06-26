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
