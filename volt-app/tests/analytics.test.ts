// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanPagePath, isTrackedPath } from "../src/lib/analytics.ts";

test("staff and sign-in pages are never tracked", () => {
  assert.equal(isTrackedPath("/dashboard"), false);
  assert.equal(isTrackedPath("/dashboard/reservations/123"), false);
  assert.equal(isTrackedPath("/emp-login"), false);
  assert.equal(isTrackedPath("/auth/set-password"), false);
  assert.equal(isTrackedPath("/"), true);
  assert.equal(isTrackedPath("/book"), true);
  assert.equal(isTrackedPath("/dashboards-info"), true);
});

test("private URL parts are stripped, ad attribution kept", () => {
  assert.equal(cleanPagePath("/receipt/abc123secret", ""), "/receipt");
  assert.equal(cleanPagePath("/manage-reservation", "?email=a%40b.com&code=X"), "/manage-reservation");
  assert.equal(cleanPagePath("/book", "?from=columbus&utm_source=google&gclid=abc"), "/book?utm_source=google&gclid=abc");
});
