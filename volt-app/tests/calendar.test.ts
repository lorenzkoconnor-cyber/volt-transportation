// Run: npm test   (Node's built-in test runner; Node 22.6+ runs TypeScript directly)
import { test } from "node:test";
import assert from "node:assert/strict";
import { addDays, addMonths, monthGrid, repeatDates, weekday, tripItem, groupByDay, staffItem } from "../src/lib/calendar.ts";

test("date math", () => {
  assert.equal(addDays("2026-10-31", 1), "2026-11-01");
  assert.equal(addDays("2026-03-08", 1), "2026-03-09");   // DST day
  assert.equal(addMonths("2027-01-31", 1), "2027-02-28");
  assert.equal(weekday("2026-10-19"), 1);                  // Monday
});

test("month grid covers whole weeks, Sunday first", () => {
  const g = monthGrid("2026-10-19");
  assert.equal(g[0][0], "2026-09-27");
  assert.equal(g.at(-1)!.at(-1), "2026-10-31");
  assert.ok(g.every((w) => w.length === 7));
});

test("repeat dates", () => {
  assert.deepEqual(repeatDates("2026-10-19", "none", "2026-12-01"), ["2026-10-19"]);
  assert.deepEqual(repeatDates("2026-10-19", "weekly", "2026-11-02"), ["2026-10-19", "2026-10-26", "2026-11-02"]);
  assert.deepEqual(repeatDates("2026-10-19", "biweekly", "2026-11-10"), ["2026-10-19", "2026-11-02"]);
  assert.deepEqual(repeatDates("2026-01-31", "monthly", "2026-03-31"), ["2026-01-31", "2026-02-28", "2026-03-31"]);
  assert.equal(repeatDates("2026-01-01", "weekly", "2030-01-01").length, 60);
});

test("ATL trip becomes a pickup with a leave-Volt time", () => {
  const it = tripItem({
    id: "t1", departure_date: "2026-10-19", departure_time: "10:00:00", seats_booked: 6, total_capacity: 8, status: "scheduled",
    route: { origin_key: "atl", duration_minutes: 120 },
    trip_vehicles: [{ vehicle: { name: "Van 1" }, driver: { first_name: "Alex", last_name: "B" } }],
  });
  assert.equal(it.type, "pickup");
  assert.deepEqual(it.leaveVolt, { date: "2026-10-19", time: "08:00" });
  assert.deepEqual(it.vans, [{ vehicle: "Van 1", driver: "Alex B" }]);
});

test("groupByDay sorts all-day items first, then by time", () => {
  const map = groupByDay([
    staffItem({ id: "a", event_date: "2026-10-19", start_time: "15:00:00", title: "Lobby", category: "cleaning" }),
    staffItem({ id: "b", event_date: "2026-10-19", start_time: null, title: "All day", category: "task" }),
    staffItem({ id: "c", event_date: "2026-10-19", start_time: "06:00:00", title: "Early", category: "task" }),
  ]);
  assert.deepEqual(map.get("2026-10-19")!.map((i) => i.id), ["b", "c", "a"]);
});
