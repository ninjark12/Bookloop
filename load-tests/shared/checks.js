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
