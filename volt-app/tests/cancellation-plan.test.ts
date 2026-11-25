// Run: npm test   (Node's built-in test runner; Node 22.6+ runs TypeScript directly)
import { test } from "node:test";
import assert from "node:assert/strict";
import { amountToKeep, planCancellation, KEEP_ALL_CENTS, type PlanPayment } from "../src/lib/cancellation-plan.ts";

const card = (id: string, cents: number, extra: Partial<PlanPayment> = {}): PlanPayment =>
  ({ id, method: "stripe", status: "paid", amount_cents: cents, refund_amount_cents: 0, created_at: "2026-10-01", ...extra });
const cash = (id: string, cents: number, extra: Partial<PlanPayment> = {}): PlanPayment =>
  ({ id, method: "cash", status: "paid", amount_cents: cents, refund_amount_cents: 0, created_at: "2026-10-01", ...extra });

test("card booking: keeps $15, refunds the rest to the card", () => {
  const plan = planCancellation([card("a", 11800)], 1500, true);
  assert.equal(plan.keptFromPaidCents, 1500);
  assert.deepEqual(plan.refunds, [{ paymentId: "a", method: "stripe", amountCents: 10300, owedOnly: false }]);
  assert.deepEqual(plan.holds, []);
});

test("fee waived: full refund", () => {
  const plan = planCancellation([card("a", 5900)], 0, false);
  assert.equal(plan.keptFromPaidCents, 0);
  assert.equal(plan.refunds[0].amountCents, 5900);
});

test("split cash + card: card refunded first, fee comes out of the cash", () => {
  const plan = planCancellation([cash("c", 5000), card("k", 6800)], 1500, false);
  assert.deepEqual(plan.refunds, [
    { paymentId: "k", method: "stripe", amountCents: 6800, owedOnly: false },
    { paymentId: "c", method: "cash", amountCents: 3500, owedOnly: false },
  ]);
});

test("online cancel of a cash booking: cash is owed, not recorded", () => {
  const plan = planCancellation([cash("c", 5900)], 1500, true);
  assert.deepEqual(plan.refunds, [{ paymentId: "c", method: "cash", amountCents: 4400, owedOnly: true }]);
});

test("already partly refunded payment only refunds what's left", () => {
  const plan = planCancellation([card("a", 11800, { refund_amount_cents: 5900 })], 1500, true);
  assert.equal(plan.refunds[0].amountCents, 4400);
});

test("fee larger than what was paid keeps everything, refunds nothing", () => {
  const plan = planCancellation([card("a", 1000)], 1500, true);
  assert.equal(plan.keptFromPaidCents, 1000);
  assert.deepEqual(plan.refunds, []);
});

test("military card hold: capture only the fee", () => {
  const plan = planCancellation([card("h", 11800, { status: "authorized" })], 1500, true);
  assert.deepEqual(plan.holds, [{ paymentId: "h", action: "capture", amountCents: 1500 }]);
  assert.equal(plan.keptFromHoldsCents, 1500);
  assert.deepEqual(plan.refunds, []);
});

test("card hold with the fee waived: release it", () => {
  const plan = planCancellation([card("h", 11800, { status: "authorized" })], 0, false);
  assert.deepEqual(plan.holds, [{ paymentId: "h", action: "void", amountCents: 0 }]);
});

test("free (comp) booking: nothing to refund or charge", () => {
  const plan = planCancellation([{ id: "z", method: "comp", status: "paid", amount_cents: 0, refund_amount_cents: 0 }], 1500, true);
  assert.equal(plan.keptFromPaidCents, 0);
  assert.deepEqual(plan.refunds, []);
  assert.deepEqual(plan.holds, []);
});

test("pending and refunded payments are ignored", () => {
  const plan = planCancellation([
    card("p", 2000, { status: "pending" }),
    card("r", 5900, { status: "refunded", refund_amount_cents: 5900 }),
    card("a", 5900),
  ], 1500, true);
  assert.deepEqual(plan.refunds.map((r) => [r.paymentId, r.amountCents]), [["a", 4400]]);
});

// ── Partial refund vs no refund ───────────────────────────────────────────────
const alex = { feeCents: 1500, roundTrip: true, totalCents: 13800, tipCents: 2000, pickupFeeCents: 0, dropoffFeeCents: 0 };

test("partial refund before any ride: keep only the fee (tip refunded)", () => {
  const keep = amountToKeep({ ...alex, mode: "partial", firstLegTaken: false });
  assert.equal(keep.totalCents, 1500);
  const plan = planCancellation([card("a", 13800)], keep.totalCents, false);
  assert.equal(plan.refunds[0].amountCents, 12300);
});

test("partial refund after the first leg: refund only the return ride minus the fee", () => {
  const keep = amountToKeep({ ...alex, mode: "partial", firstLegTaken: true });
  assert.deepEqual([keep.usedRideCents, keep.tipCents, keep.feeCents, keep.totalCents], [5900, 2000, 1500, 9400]);
  const plan = planCancellation([card("a", 13800)], keep.totalCents, false);
  assert.equal(plan.refunds[0].amountCents, 4400);
});

test("partial refund after the first leg, fee waived: whole return ride back", () => {
  const keep = amountToKeep({ ...alex, feeCents: 0, mode: "partial", firstLegTaken: true });
  assert.equal(planCancellation([card("a", 13800)], keep.totalCents, false).refunds[0].amountCents, 5900);
});

test("door fees follow their leg: pickup kept, drop-off refunded", () => {
  const keep = amountToKeep({ ...alex, totalCents: 13800 + 10000, pickupFeeCents: 5000, dropoffFeeCents: 5000, mode: "partial", firstLegTaken: true });
  assert.equal(keep.usedRideCents, 5900 + 5000);
  assert.equal(planCancellation([card("a", 23800)], keep.totalCents, false).refunds[0].amountCents, 5900 + 5000 - 1500);
});

test("odd fare: the untaken half rounds down", () => {
  const keep = amountToKeep({ ...alex, totalCents: 11801, tipCents: 0, mode: "partial", firstLegTaken: true });
  assert.equal(keep.usedRideCents, 5901);
});

test("one-way already taken: nothing left to refund", () => {
  const keep = amountToKeep({ ...alex, roundTrip: false, totalCents: 5900, tipCents: 0, mode: "partial", firstLegTaken: true });
  assert.deepEqual(planCancellation([card("a", 5900)], keep.totalCents, false).refunds, []);
});

test("no refund keeps everything paid, across payments", () => {
  const keep = amountToKeep({ ...alex, mode: "none", firstLegTaken: false });
  assert.equal(keep.totalCents, KEEP_ALL_CENTS);
  const plan = planCancellation([cash("c", 5000), card("k", 8800)], keep.totalCents, false);
  assert.deepEqual(plan.refunds, []);
  assert.equal(plan.keptFromPaidCents, 13800);
});

test("no refund on a card hold: the whole hold is charged", () => {
  const plan = planCancellation([card("h", 10800, { status: "authorized" })], KEEP_ALL_CENTS, false);
  assert.deepEqual(plan.holds, [{ paymentId: "h", action: "capture", amountCents: 10800 }]);
});
