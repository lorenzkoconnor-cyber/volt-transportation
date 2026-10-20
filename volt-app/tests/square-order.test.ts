// Run: npm test   (Node's built-in test runner; Node 22.6+ runs TypeScript directly)
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSquareOrder, type OrderReservation } from "../src/lib/square/orders.ts";

const PRICING = { adult: 59, child: 39, pet: 25, extraBag: 15 };

const resv = (extra: Partial<OrderReservation> = {}): OrderReservation => ({
  confirmationNumber: "VOLT-ABC123",
  adults: 1, children: 0, pets: 0, extraBags: 0, isRoundTrip: false,
  subtotalCents: 5900, discountCents: 0, totalCents: 5900, discountLabel: null,
  pricing: PRICING,
  outboundLabel: "Columbus → ATL · Oct 22, 8:00 AM",
  returnLabel: null,
  ...extra,
});

const charge = (amountCents: number) => ({ amountCents, paidElsewhereLabel: "Paid in cash" });

test("one adult, one way: a single ticket line", () => {
  const o = buildSquareOrder(resv(), charge(5900));
  assert.ok(o.ok);
  assert.deepEqual(o.lines, [{ name: "Adult ticket", quantity: 1, unitCents: 5900, variation: "Columbus → ATL · Oct 22, 8:00 AM" }]);
  assert.deepEqual(o.discounts, []);
  assert.equal(o.totalCents, 5900);
});

test("round trip with kids, pet and bag: lines per leg", () => {
  // one way: 2×59 + 1×39 + 1×25 + 1×15 = 197 → ×2 = 394
  const r = resv({
    adults: 2, children: 1, pets: 1, extraBags: 1, isRoundTrip: true,
    subtotalCents: 39400, totalCents: 39400, returnLabel: "ATL → Columbus · Oct 25, 6:00 PM",
  });
  const o = buildSquareOrder(r, charge(39400));
  assert.ok(o.ok);
  assert.equal(o.lines.length, 8);
  assert.equal(o.lines[0].name, "Adult ticket (Outbound)");
  assert.equal(o.lines[0].quantity, 2);
  assert.equal(o.lines[4].name, "Adult ticket (Return)");
  assert.equal(o.lines[4].variation, "ATL → Columbus · Oct 25, 6:00 PM");
  assert.equal(o.totalCents, 39400);
});

test("military discount becomes an order discount", () => {
  const r = resv({ adults: 2, subtotalCents: 11800, discountCents: 1000, totalCents: 10800, discountLabel: "Military Discount" });
  const o = buildSquareOrder(r, charge(10800));
  assert.ok(o.ok);
  assert.deepEqual(o.discounts, [{ name: "Military Discount", cents: 1000 }]);
  assert.equal(o.totalCents, 10800);
});

test("split: the cash part shows as 'Paid in cash'", () => {
  const r = resv({ adults: 2, subtotalCents: 11800, discountCents: 1000, totalCents: 10800, discountLabel: "Military Discount" });
  const o = buildSquareOrder(r, charge(8800));
  assert.ok(o.ok);
  assert.deepEqual(o.discounts, [{ name: "Military Discount", cents: 1000 }, { name: "Paid in cash", cents: 2000 }]);
  assert.equal(o.totalCents, 8800);
});

test("prices that don't match the per-item math fall back to one fare line", () => {
  const r = resv({ adults: 2, subtotalCents: 12500, totalCents: 12500 });
  const o = buildSquareOrder(r, charge(12500));
  assert.ok(o.ok);
  assert.equal(o.lines.length, 1);
  assert.equal(o.lines[0].name, "Volt shuttle fare");
  assert.equal(o.lines[0].note, "2 adults");
  assert.equal(o.totalCents, 12500);
});

test("reservation change: one line for the difference", () => {
  const o = buildSquareOrder(resv(), {
    amountCents: 5900,
    paidElsewhereLabel: "Paid in cash",
    change: { priceChangeCents: 5900, summary: ["Adults: 1 → 2", "Price: $59 → $118"] },
  });
  assert.ok(o.ok);
  assert.deepEqual(o.lines, [{ name: "Reservation change", quantity: 1, unitCents: 5900, variation: "VOLT-ABC123", note: "Adults: 1 → 2" }]);
  assert.equal(o.totalCents, 5900);
});

test("reservation change split with cash", () => {
  const o = buildSquareOrder(resv(), {
    amountCents: 3900, paidElsewhereLabel: "Paid in cash",
    change: { priceChangeCents: 5900, summary: [] },
  });
  assert.ok(o.ok);
  assert.deepEqual(o.discounts, [{ name: "Paid in cash", cents: 2000 }]);
  assert.equal(o.totalCents, 3900);
});

test("refuses to charge more than the booking costs", () => {
  const o = buildSquareOrder(resv(), charge(6000));
  assert.equal(o.ok, false);
});

test("refuses a zero charge", () => {
  assert.equal(buildSquareOrder(resv(), charge(0)).ok, false);
});
