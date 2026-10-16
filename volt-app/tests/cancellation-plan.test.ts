// Run: npm test   (Node's built-in test runner; Node 22.6+ runs TypeScript directly)
import { test } from "node:test";
import assert from "node:assert/strict";
import { planCancellation, type PlanPayment } from "../src/lib/cancellation-plan.ts";

const card = (id: string, cents: number, extra: Partial<PlanPayment> = {}): PlanPayment =>
  ({ id, method: "stripe", status: "paid", amount_cents: cents, refund_amount_cents: 0, created_at: "2026-10-01", ...extra });
const cash = (id: string, cents: number, extra: Partial<PlanPayment> = {}): PlanPayment =>
  ({ id, method: "cash", status: "paid", amount_cents: cents, refund_amount_cents: 0, created_at: "2026-10-01", ...extra });

test("card booking: keeps $15, refunds the rest to the card", () => {
  const plan = planCancellation([card("a", 11800)], 1500, true);
  assert.equal(plan.feeFromPaidCents, 1500);
  assert.deepEqual(plan.refunds, [{ paymentId: "a", method: "stripe", amountCents: 10300, owedOnly: false }]);
  assert.deepEqual(plan.holds, []);
});

test("fee waived: full refund", () => {
  const plan = planCancellation([card("a", 5900)], 0, false);
  assert.equal(plan.feeFromPaidCents, 0);
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
  assert.equal(plan.feeFromPaidCents, 1000);
  assert.deepEqual(plan.refunds, []);
});

test("military card hold: capture only the fee", () => {
  const plan = planCancellation([card("h", 11800, { status: "authorized" })], 1500, true);
  assert.deepEqual(plan.holds, [{ paymentId: "h", action: "capture", amountCents: 1500 }]);
  assert.equal(plan.feeFromHoldsCents, 1500);
  assert.deepEqual(plan.refunds, []);
});

test("card hold with the fee waived: release it", () => {
  const plan = planCancellation([card("h", 11800, { status: "authorized" })], 0, false);
  assert.deepEqual(plan.holds, [{ paymentId: "h", action: "void", amountCents: 0 }]);
});

test("free (comp) booking: nothing to refund or charge", () => {
  const plan = planCancellation([{ id: "z", method: "comp", status: "paid", amount_cents: 0, refund_amount_cents: 0 }], 1500, true);
  assert.equal(plan.feeFromPaidCents, 0);
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
