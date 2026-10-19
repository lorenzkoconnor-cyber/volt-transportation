// Run: npm test   (Node's built-in test runner; Node 22.6+ runs TypeScript directly)
import { test } from "node:test";
import assert from "node:assert/strict";
import { legTimes, shiftClock, minutesBetween, formatDuration, atlSpot } from "../src/lib/trip-timeline.ts";

test("Columbus → ATL: riders at Volt early, drop-off one route-time later", () => {
  const t = legTimes("columbus", "2026-12-19", "04:00:00", 120, 20);
  assert.equal(t.kind, "to_atl");
  assert.deepEqual(t.ridersAtVoltBy, { date: "2026-12-19", time: "03:40" });
  assert.deepEqual(t.leaveVolt, { date: "2026-12-19", time: "04:00" });
  assert.deepEqual(t.atAtl, { date: "2026-12-19", time: "06:00" });
});

test("ATL → Columbus: van leaves Volt one route-time before the pickup", () => {
  const t = legTimes("atl", "2027-01-05", "22:00", 120);
  assert.equal(t.kind, "from_atl");
  assert.deepEqual(t.leaveVolt, { date: "2027-01-05", time: "20:00" });
  assert.deepEqual(t.atAtl, { date: "2027-01-05", time: "22:00" });
  assert.deepEqual(t.backAtVolt, { date: "2027-01-06", time: "00:00" });
});

test("early pickup: leaving Volt falls on the previous day", () => {
  const t = legTimes("atl", "2027-01-01", "01:00", 120);
  assert.deepEqual(t.leaveVolt, { date: "2026-12-31", time: "23:00" });
});

test("shiftClock / minutesBetween / formatDuration", () => {
  assert.deepEqual(shiftClock("2026-02-28", "23:30", 45), { date: "2026-03-01", time: "00:15" });
  assert.equal(minutesBetween({ date: "2027-01-05", time: "19:40" }, { date: "2027-01-05", time: "22:00" }), 140);
  assert.equal(formatDuration(140), "2h 20m");
  assert.equal(formatDuration(60), "1h");
  assert.equal(formatDuration(45), "45m");
});

test("atlSpot names the terminal, null when unknown", () => {
  assert.equal(atlSpot("International (Concourse F)"), "International Terminal (Concourse F)");
  assert.equal(atlSpot("Domestic – South"), "Domestic Terminal – South");
  assert.equal(atlSpot(null), null);
});
