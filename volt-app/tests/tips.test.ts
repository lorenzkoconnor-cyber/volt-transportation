// Run: npm test   (Node's built-in test runner; Node 22.6+ runs TypeScript directly)
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeTipCents, tipFromDollars } from "../src/lib/tips.ts";

test("tip amounts are whole, non-negative cents with a ceiling", () => {
  assert.equal(normalizeTipCents(500), 500);
  assert.equal(normalizeTipCents("1000"), 1000);
  assert.equal(normalizeTipCents(-5), 0);
  assert.equal(normalizeTipCents("abc"), 0);
  assert.equal(normalizeTipCents(10_000_000), 50_000);
  assert.equal(tipFromDollars("12.5"), 1250);
  assert.equal(tipFromDollars(""), 0);
});
