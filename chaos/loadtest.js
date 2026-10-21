// k6 load test:  scripts/tb k6 run --env BASE_URL=http://host.docker.internal:8080 chaos/loadtest.js
import http from "k6/http";
import { check, sleep } from "k6";

const BASE = __ENV.BASE_URL || "http://localhost:8080";

export const options = {
  stages: [
    { duration: "30s", target: 20 },
    { duration: "2m", target: 100 },   // overload ramp
    { duration: "30s", target: 0 },
  ],
  thresholds: {
    http_req_failed: ["rate<0.005"],      // SLO-1
    http_req_duration: ["p(95)<300"],     // SLO-2
  },
};

export default function () {
  if (Math.random() < 0.3) {
    const r = http.post(`${BASE}/v1/resources`, JSON.stringify({ type: "aws_instance", name: `n-${__VU}-${__ITER}` }),
      { headers: { "Content-Type": "application/json" } });
    check(r, { created: (x) => x.status === 201 });
  } else {
    check(http.get(`${BASE}/v1/resources`), { ok: (x) => x.status === 200 });
  }
  sleep(0.05);
}
