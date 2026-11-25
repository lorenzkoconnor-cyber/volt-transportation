// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { splitCents, tipShares, tipTotals } from "../src/lib/driver-tips.ts";
import { staffTripTime } from "../src/lib/trip-timeline.ts";

const TODAY = "2026-11-16";
const trip = (id: string, date: string, drivers: [string, string][], status = "completed") => ({
  id, departure_date: date, departure_time: "18:00:00", status, route: { name: "R" },
  trip_vehicles: drivers.length ? drivers.map(([did, name]) => ({ driver: { id: did, first_name: name, last_name: "X" } })) : [],
});
const resv = (o: any) => ({
  id: "r1", confirmation_number: "V1", status: "confirmed", tip_cents: 1000, is_round_trip: false,
  customer: { first_name: "Ann", last_name: "Lee" },
  payments: [{ method: "cash", status: "paid", amount_cents: 6000, refund_amount_cents: 0, is_tip: false }],
  trip: trip("t1", "2026-11-15", [["d1", "Gary"]]), return_trip: null, ...o,
});
const opts = (paid = {}) => ({ feePercent: 3, today: TODAY, paid });

test("splitCents gives leftovers to the first parts", () => {
  assert.deepEqual(splitCents(1001, 2), [501, 500]);
  assert.deepEqual(splitCents(10, 3), [4, 3, 3]);
});

test("cash tip goes to the driver in full", () => {
  const [s] = tipShares([resv({})], opts());
  assert.equal(s.driverId, "d1");
  assert.equal(s.netCents, 1000);
  assert.equal(s.feeCents, 0);
  assert.equal(s.owedCents, 1000);
});

test("card tip loses the card fee", () => {
  const r = resv({ payments: [{ method: "stripe", status: "paid", amount_cents: 6000, is_tip: false }] });
  const [s] = tipShares([r], opts());
  assert.equal(s.feeCents, 30);
  assert.equal(s.netCents, 970);
});

test("split cash + card: fee only on the card share", () => {
  const r = resv({ payments: [
    { method: "cash", status: "paid", amount_cents: 3000, is_tip: false },
    { method: "square", status: "paid", amount_cents: 3000, is_tip: false },
  ] });
  assert.equal(tipTotals(r, 3).feeCents, 15);
});

test("round trip splits between both drivers; return leg waits until it runs", () => {
  const r = resv({ is_round_trip: true, tip_cents: 1001, return_trip: trip("t2", "2026-11-20", [["d2", "Lorenz"]], "scheduled") });
  let shares = tipShares([r], opts());
  assert.equal(shares.length, 1);
  assert.equal(shares[0].netCents, 501);
  r.return_trip.status = "completed";
  shares = tipShares([r], opts());
  assert.deepEqual(shares.map((s) => [s.driverId, s.netCents]).sort(), [["d1", 501], ["d2", 500]]);
});

test("unpaid booking, cancelled booking, and unassigned van", () => {
  assert.equal(tipShares([resv({ payments: [{ method: "cash", status: "pending", amount_cents: 6000, is_tip: false }] })], opts()).length, 0);
  assert.equal(tipShares([resv({ status: "cancelled", trip: trip("t1", "2026-11-20", [["d1", "Gary"]], "scheduled") })], opts()).length, 0);
  const [s] = tipShares([resv({ trip: trip("t1", "2026-11-15", []) })], opts());
  assert.equal(s.driverId, null);
  assert.equal(s.owedCents, 0);
});

test("tip after the trip counts even with its own card fee; paid amounts reduce what's owed", () => {
  const r = resv({ tip_cents: 1500, payments: [
    { method: "cash", status: "paid", amount_cents: 6000, is_tip: false },
    { method: "stripe", status: "paid", amount_cents: 500, is_tip: true },
  ] });
  const [s] = tipShares([r], opts({ "r1:out|d1": 1000 }));
  assert.equal(s.grossCents, 1500);
  assert.equal(s.feeCents, 15);
  assert.equal(s.owedCents, 485);
});

test("staff time labels never confuse an ATL pickup with leaving Volt", () => {
  assert.equal(staffTripTime("columbus", "2026-11-16", "06:00:00", 120).text, "Leave Volt 6:00 AM");
  const atl = staffTripTime("atl", "2026-11-16", "18:00:00", 120);
  assert.equal(atl.main, "ATL pickup 6:00 PM");
  assert.equal(atl.sub, "leave Volt by 4:00 PM");
  assert.equal(staffTripTime("atl", "2026-11-16", "01:00", 120).sub, "leave Volt by 11:00 PM (day before)");
});

test("cancelled after the first leg with the tip kept: whole tip to the outbound driver", () => {
  const r = resv({
    status: "cancelled", is_round_trip: true, tip_cents: 2000,
    payments: [{ method: "cash", status: "paid", amount_cents: 13800, refund_amount_cents: 4400, is_tip: false }],
    return_trip: trip("t2", "2026-11-25", [["d2", "Lee"]], "scheduled"),
  });
  const shares = tipShares([r], opts());
  assert.equal(shares.length, 1);
  assert.equal(shares[0].driverId, "d1");
  assert.equal(shares[0].grossCents, 2000);
});

test("cancelled with the tip refunded: no driver credit", () => {
  const r = resv({
    status: "cancelled", tip_cents: 2000,
    payments: [{ method: "cash", status: "paid", amount_cents: 7900, refund_amount_cents: 6400, is_tip: false }],
  });
  assert.equal(tipShares([r], opts()).length, 0);
});
