// Run: npm test   (Node's built-in test runner; Node 22.6+ runs TypeScript directly)
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkReview, defaultDisplayName, holdReasonFor } from "../src/lib/reviews.ts";

test("a normal review publishes right away", () => {
  const r = checkReview({ rating: 5, body: "Driver was early and the van was spotless.", displayName: "Jordan M." });
  assert.ok(r.ok);
  assert.equal(r.holdReason, null);
  assert.equal(r.value.rating, 5);
});

test("a low rating is never held for being negative", () => {
  const r = checkReview({ rating: 1, body: "We left 30 minutes late and nobody told us why.", displayName: "Sam" });
  assert.ok(r.ok);
  assert.equal(r.holdReason, null);
});

test("links, contact details and profanity are held", () => {
  assert.equal(holdReasonFor("check out www.example.com"), "Contains a link");
  assert.equal(holdReasonFor("visit cheapflights.net now"), "Contains a link");
  assert.equal(holdReasonFor("email me at a@b.co"), "Contains an email address");
  assert.equal(holdReasonFor("call 706-555-1234"), "Contains a phone number");
  assert.equal(holdReasonFor("this was shit"), "Contains profanity");
  assert.equal(holdReasonFor("Scunthorpe trip, class act"), null);
});

test("rejects bad input", () => {
  assert.equal(checkReview({ rating: 0, body: "Great ride overall", displayName: "A" }).ok, false);
  assert.equal(checkReview({ rating: 4.5, body: "Great ride overall", displayName: "A" }).ok, false);
  assert.equal(checkReview({ rating: 5, body: "ok", displayName: "A" }).ok, false);
  assert.equal(checkReview({ rating: 5, body: "Great ride overall", displayName: "   " }).ok, false);
  assert.equal(checkReview({ rating: 5, body: "x".repeat(1001), displayName: "A" }).ok, false);
});

test("tidies whitespace", () => {
  const r = checkReview({ rating: 4, body: "  Great   ride.\r\n\r\n\r\n\r\nWould book again.  ", displayName: " Lee  K. " });
  assert.ok(r.ok);
  assert.equal(r.value.body, "Great ride.\n\nWould book again.");
  assert.equal(r.value.displayName, "Lee K.");
});

test("default display name is first name + last initial", () => {
  assert.equal(defaultDisplayName("Jordan", "miles"), "Jordan M.");
  assert.equal(defaultDisplayName("Jordan", ""), "Jordan");
  assert.equal(defaultDisplayName("", ""), "Volt rider");
});
