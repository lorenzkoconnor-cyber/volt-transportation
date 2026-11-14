// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  deriveRun, driveFraction, easternInstant, estimatePosition, etaForStop, livePosition, runIssues, stopTerminals,
  type RunEvent, type RunRider, type RunTrip,
  unansweredMessages,
} from "../src/lib/driver-run.ts";

const rider = (id: string, terminal: string, extra: Partial<RunRider> = {}): RunRider => ({
  reservationId: id, name: `Rider ${id}`, partySize: 1, terminal, bookedTerminal: terminal, flight: null,
  boarded: false, noShow: false, notes: "", doorAddress: null, rideAlong: false, update: null, canText: true, messages: [], ...extra,
});
const T0 = Date.parse("2026-11-13T23:00:00Z"); // 6:00 PM Eastern
const min = (m: number) => new Date(T0 + m * 60_000).toISOString();
// ATL pickup at 8:00 PM → van leaves Volt at 6:00 PM.
const pickup: RunTrip = { kind: "from_atl", departureAt: min(120), routeMinutes: 120 };
const riders = [rider("a", "Domestic – North"), rider("b", "Domestic – South"), rider("c", "Domestic – South")];

test("Eastern wall-clock time becomes the right instant (EST in November)", () => {
  assert.equal(easternInstant("2026-11-13", "18:00"), "2026-11-13T23:00:00.000Z");
  assert.equal(easternInstant("2026-07-04", "18:00"), "2026-07-04T22:00:00.000Z");
});

test("stops follow driving order: South, North, International, unknown last", () => {
  assert.deepEqual(stopTerminals([rider("1", "Terminal not given"), rider("2", "International (Concourse F)"), ...riders]),
    ["Domestic – South", "Domestic – North", "International (Concourse F)", "Terminal not given"]);
});

test("pickup run walks through its steps", () => {
  let events: RunEvent[] = [];
  let d = deriveRun(pickup, riders, events, T0);
  assert.equal(d.stage, "not_started");
  assert.equal(d.next.label, "On the way to ATL");

  events = [{ kind: "left_volt", at: min(0) }];
  d = deriveRun(pickup, riders, events, T0 + 60 * 60_000);
  assert.equal(d.stage, "driving");
  assert.equal(d.next.type, "arrive");
  assert.equal(d.next.label, "Arrived at Domestic South");

  events.push({ kind: "arrived_stop", terminal: "Domestic – South", at: min(118) });
  d = deriveRun(pickup, riders, events, T0 + 125 * 60_000);
  assert.equal(d.stage, "at_stop");
  assert.equal(d.waitedMinutes, 7);
  assert.equal(d.noShowAllowed, false);
  assert.equal(d.next.label, "Done, go to Domestic North");

  d = deriveRun(pickup, riders, events, T0 + 140 * 60_000);
  assert.equal(d.noShowAllowed, true);   // 22 min ≥ 20
  assert.equal(d.overWait, false);       // < 25
  d = deriveRun(pickup, riders, events, T0 + 144 * 60_000);
  assert.equal(d.overWait, true);

  events.push({ kind: "stop_done", terminal: "Domestic – South", at: min(130) });
  events.push({ kind: "arrived_stop", terminal: "Domestic – North", at: min(138) });
  events.push({ kind: "stop_done", terminal: "Domestic – North", at: min(145) });
  d = deriveRun(pickup, riders, events, T0 + 150 * 60_000);
  assert.equal(d.stage, "heading_home");
  assert.equal(d.next.type, "back_at_volt");

  events.push({ kind: "run_completed", at: min(270) });
  assert.equal(deriveRun(pickup, riders, events, T0 + 271 * 60_000).stage, "completed");
});

test("undoing an arrival puts the stop back", () => {
  const events: RunEvent[] = [
    { kind: "left_volt", at: min(0) },
    { kind: "arrived_stop", terminal: "Domestic – North", at: min(110) },
    { kind: "stop_reopened", terminal: "Domestic – North", at: min(111) },
  ];
  const d = deriveRun(pickup, riders, events, T0 + 112 * 60_000);
  assert.equal(d.stage, "driving");
  assert.equal(d.currentStop, null);
});

test("progress moves steadily, never reaches the end on its own", () => {
  assert.equal(driveFraction(0, 100), 0);
  assert.equal(driveFraction(50, 100), 0.5);
  assert.ok(driveFraction(95, 100) > 0.9 && driveFraction(95, 100) < driveFraction(100, 100));
  assert.ok(driveFraction(500, 100) < 1);
  // Strictly increasing second by second through the whole drive and beyond.
  let prev = -1;
  for (let s = 0; s <= 3 * 7200; s += 30) {
    const f = driveFraction(s * 1000, 7200_000);
    assert.ok(f > prev);
    prev = f;
  }
});

test("the van's live position keeps moving between page refreshes", () => {
  const events: RunEvent[] = [{ kind: "left_volt", at: min(0) }];
  const d = deriveRun(pickup, riders, events, T0 + 30 * 60_000);
  const pos = estimatePosition(d, 120, T0 + 30 * 60_000);
  assert.ok(pos.motion);
  const a = livePosition(pos, T0 + 30 * 60_000).fromColumbus;
  const b = livePosition(pos, T0 + 31 * 60_000).fromColumbus;
  assert.ok(Math.abs(a - 0.25) < 1e-9);
  assert.ok(b > a);
  assert.equal(pos.label, "About 90 min to ATL");
});

test("later stops get an ETA, the current stop doesn't", () => {
  const events: RunEvent[] = [
    { kind: "left_volt", at: min(0) },
    { kind: "arrived_stop", terminal: "Domestic – South", at: min(120) },
  ];
  const now = T0 + 121 * 60_000;
  const d = deriveRun(pickup, riders, events, now);
  assert.equal(etaForStop(d, "Domestic – South", 120, now), null);
  const eta = etaForStop(d, "Domestic – North", 120, now)!;
  // 10 min at South + 8 min to North → ~8:18 PM.
  assert.equal(new Date(eta.from).getTime(), T0 + (120 + 10 + 8 - 3) * 60_000);
});

test("office sees a late start and rider updates", () => {
  const late = deriveRun(pickup, riders, [], T0 + 15 * 60_000);
  const issues = runIssues(late, [...riders, rider("d", "Domestic – South", { update: { status: "cant_make_it", delayMinutes: null, newLandingTime: null, terminal: null, updatedAt: min(0) } })], 120, T0 + 15 * 60_000);
  assert.ok(issues.some((i) => i.key === "late_start"));
  assert.ok(issues.some((i) => i.key === "cant:d"));
});

test("Columbus → ATL: board at Volt, no-show only after departure, drop-offs by terminal", () => {
  const trip: RunTrip = { kind: "to_atl", departureAt: min(0), routeMinutes: 120 };
  assert.equal(deriveRun(trip, riders, [], T0 - 60_000).noShowAllowed, false);
  assert.equal(deriveRun(trip, riders, [], T0 + 60_000).noShowAllowed, true);
  const d = deriveRun(trip, riders, [{ kind: "left_volt", at: min(0) }], T0 + 100 * 60_000);
  assert.equal(d.next.label, "Dropped off at Domestic South");
});

test("unanswered messages: rider notes after the driver's last reply", () => {
  const m = (id: string, from: "rider" | "driver" | "office") => ({ id, from, body: id, at: "2026-11-13T20:00:00Z" });
  assert.deepEqual(unansweredMessages({ messages: [] }), []);
  assert.deepEqual(unansweredMessages({ messages: [m("a", "rider"), m("b", "rider")] }).map((x) => x.id), ["a", "b"]);
  assert.deepEqual(unansweredMessages({ messages: [m("a", "rider"), m("b", "driver")] }), []);
  assert.deepEqual(unansweredMessages({ messages: [m("a", "rider"), m("b", "office"), m("c", "rider")] }).map((x) => x.id), ["c"]);
});
