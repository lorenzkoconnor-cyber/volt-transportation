import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSender } from "../src/lib/notifications/email.ts";

const box = "support@contactvolt.com";
const want = { name: "Volt Transportation", address: box };

test("reads the usual format", () => {
  assert.deepEqual(parseSender("Volt Transportation <support@contactvolt.com>", box), want);
});

test("copes with how hosting panels store it", () => {
  assert.deepEqual(parseSender('"Volt Transportation <support@contactvolt.com>"', box), want);
  assert.deepEqual(parseSender("Volt Transportation support@contactvolt.com", box), want);
  assert.deepEqual(parseSender('"Volt Transportation" <support@contactvolt.com>', box), want);
  assert.deepEqual(parseSender("support@contactvolt.com", box), want);
});

test("falls back to the mailbox", () => {
  assert.deepEqual(parseSender(undefined, box), want);
  assert.deepEqual(parseSender("", box), want);
  assert.deepEqual(parseSender("Volt Rides", box), { name: "Volt Rides", address: box });
});
