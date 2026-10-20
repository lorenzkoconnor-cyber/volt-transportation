# Square Terminal for Walk-Ins — Integration Plan

**Goal:** When a customer walks in, staff build the reservation in the dashboard, tap **"Send to Square Terminal"**, and the Terminal on the counter shows the itemized cart (adult tickets, child tickets, pets, extra bags, Military Discount, and so on). The customer taps to pay, and the reservation is marked paid automatically. Square's sales reports and receipts show the same line items.

Stripe stays in place for online bookings and phone card payments. Square is added as a new payment method next to `stripe`, `cash` and `comp`.

## Build status (2026-10-20)

Phases 1–4 are built in `volt-app` (not committed yet) and run in **simulated mode** until the Square keys are added:
- Migration `supabase/migrations/029_square_terminal.sql`, **not applied to the database yet**
- `src/lib/square/` (REST client, itemized order builder + tests, Terminal checkout flow)
- Routes: `/api/payments/square-terminal`, `/api/payments/square-webhook`, `/api/payments/square-devices`
- Dashboard: Square button + split "Rest on" toggle, "Send to Square" on the reservation page, Settings → Payments (pair Terminals), Square on the Payments page, Square refunds and cancellations

Still to do: apply the migration, run a signed-in test booking in simulated mode, then the Square sandbox and a live $1 test (Phase 5).

---

## How it works

```
Dashboard (staff)                Volt server                         Square
─────────────────                ───────────                         ──────
New Reservation / "Charge Card"
  → pick "Square Terminal"  ──►  POST /api/payments/square-terminal
                                   1. Load payments row + reservation
                                   2. Build line items from the
                                      reservation (server-side prices)
                                   3. CreateOrder ──────────────────►  Order (OPEN, itemized)
                                   4. CreateTerminalCheckout ───────►  Terminal shows cart
                                      (order_id, show_itemized_cart)     customer taps card/phone
  "Waiting for tap…" modal   ◄──  polls status                     ◄──  webhook: terminal.checkout.updated
                                   5. COMPLETED → payments row = paid,
                                      store square_payment_id
  modal: "Paid ✓"
```

Square's Terminal API supports this directly. You create an Order with line items, pass its `order_id` into the Terminal checkout, and set `device_options.show_itemized_cart = true`. The checkout amount has to equal the order total, and the Terminal prints or texts an itemized receipt.

---

## Line items sent to Square

These are built on the server from the reservation, never taken from the browser. They use the same rates as `staffPrice()` in `src/lib/staff-pricing.ts`.

| Line item (example) | Qty | Price |
|---|---|---|
| Adult ticket — Outbound (Route name, date) | 2 | $X |
| Adult ticket — Return (date) | 2 | $X |
| Child ticket — Outbound | 1 | $Y |
| Pet fee — Outbound | 1 | $Z |
| Extra bag — Outbound | 1 | $W |
| *Order discount:* Military Discount | — | −$10 |
| *Order discount:* Discount code `SPRING10` | — | −$… |

- **Round trips** get separate Outbound and Return lines, so the receipt matches what the customer sees on the site.
- **Reference ID** on the order is the Volt confirmation number (`VLT-…`), so you can look a sale up in Square by confirmation number.
- **Reservation changes** ("Charge Card" for an edit difference) are sent as one line, e.g. `Reservation change — added 1 adult`, plus the itemized delta when it's available.
- **Built-in check:** if the Square order total doesn't exactly match `payments.amount_cents`, the server refuses to send it to the Terminal.

---

## Build steps

### Phase 1 — Foundation
1. **Install the SDK:** `npm i square` (the official Square Node SDK).
2. **Env vars** (added to `.env.local.example` and `src/lib/env.ts`):
   - `SQUARE_ENVIRONMENT` = `sandbox` | `production`
   - `SQUARE_ACCESS_TOKEN`
   - `SQUARE_LOCATION_ID`
   - `SQUARE_WEBHOOK_SIGNATURE_KEY`
3. **`src/lib/square/server.ts`:** the Square client. It returns `null` when keys are missing, which turns on **simulated mode** the same way `getStripeServer()` does, so the flow can be tested without hardware.
4. **Migration `0xx_square_terminal.sql`:**
   - `alter type payment_method add value 'square';`
   - `payments` gets `square_order_id`, `square_checkout_id` (unique), `square_payment_id` (unique)
   - new table `square_devices` (`id`, `name` e.g. "Front counter", `device_id`, `is_active`), staff-only RLS, editable by the owner/manager in Settings

### Phase 2 — Orders and checkout
5. **`src/lib/square/orders.ts`:** `buildSquareOrder(reservation, payment)`. This turns a reservation into Square line items and order-level discounts and checks the total. It's a pure function, so it gets unit tests in `tests/square-order.test.ts`: one-way, round trip, military, code, staff percent discount, comp (never sent), and split payment.
6. **`POST /api/payments/square-terminal`** (staff only, uses `requireStaff()`):
   - `{ action: "start", paymentId, deviceId }` → CreateOrder (idempotency key `volt-sq-order-<paymentId>-<amount>`) → CreateTerminalCheckout (`order_id`, `show_itemized_cart: true`, `deadline_duration: PT5M`, `reference_id` = payment id) → saves IDs and returns `checkoutId`
   - `{ action: "status", paymentId }` → GetTerminalCheckout → `PENDING | IN_PROGRESS | COMPLETED | CANCELED`
   - `{ action: "cancel", paymentId }` → CancelTerminalCheckout (staff hit Cancel, or the customer walked away)
   - Retrying after a decline reuses the same open order and only creates a new checkout.
7. **`POST /api/payments/square-webhook`:** checks the `x-square-hmacsha256-signature` header, then handles:
   - `terminal.checkout.updated` → COMPLETED: mark the payments row `paid` and store `square_payment_id` and `captured_at` (guarded by `.eq("status","pending")` so it runs only once). CANCELED: leave it pending.
   - `refund.updated` → keep the refund status in sync.
   - The webhook is the source of truth. The polling route also marks the row paid, so the UI doesn't depend on the webhook arriving first. This mirrors the Stripe staff-card + webhook pattern.

### Phase 3 — Dashboard
8. **Payment buttons:** the Payment section of the New Reservation form (`src/components/admin/StaffBookingForm.tsx`) goes from 4 buttons to 5:

   `Cash` · `Card` · `Square` · `Split` · `Comp (Free)`

   - **Card** stays Stripe (phone orders, typed-in cards).
   - **Square** sends the full total to the Square Terminal. It creates the payments row with `method: 'square'`, `status: 'pending'` (via `PayMethod` / `normalizePayment` / `createStaffReservation` in `src/lib/staff-booking.ts`).
   - Reservation → "Charge Card" on an existing booking also gets a **Send to Square** button.
9. **Split (cash + Square or cash + card):** after staff pick **Split**, they enter the cash amount (as today), and a small toggle chooses where the rest goes:

   ```
   Cash amount  [ $20.00 ]
   Rest on:     ( Square Terminal )  ( Card )      ← Square selected by default
   Cash $20.00 · Square $39.00
   ```

   - The cash row is saved as `paid`, and the remainder row as `method: 'square'` (or `'stripe'`), `pending`.
   - On the Terminal, the customer sees the full itemized cart, then a `Paid in cash  −$20.00` line, then **$39.00 due**. Square's order total then equals the amount charged, and the receipt explains why.
   - If the Square tap is declined or cancelled, the cash part stays recorded and the Square part stays pending. Staff can retry or switch the remainder to cash from the reservation page.
10. **Terminal modal:** device picker (remembers the last one), "Sent to Front counter — waiting for customer to tap…", live status every 2 seconds, then **Paid ✓** / **Declined — try again** / **Cancel**. The reservation is created first, so nothing is lost if the tap fails.
11. **Payments page** (`src/app/dashboard/payments/page.tsx`): a "Square" badge and stat card, with Square payments included in totals and Reports.
12. **Receipts page** (`/receipt/[token]`): shows "Card (Square Terminal)".

### Phase 4 — Refunds
13. **`/api/payments/refund`:** a new branch for `method === 'square'` that calls Square RefundPayment with `square_payment_id` (full or partial). It reuses the existing cancellation-fee logic ($15 fee, 2-hour cutoff) unchanged.

### Phase 5 — Test and launch
14. Sandbox test with Square's **virtual Terminal device IDs**, which simulate approve, decline and timeout without hardware.
15. Pair the real Terminal (Devices API device code → enter it on the Terminal), run a $1 live test, then refund it.

---

## What you (the owner) need to do

1. Create a **Square Developer** account (developer.squareup.com) and an application. Copy the **sandbox** and **production** access tokens and your **Location ID**.
2. **Device: Square Terminal (decided).** It's the standalone device with a screen; the small Square Reader can't take itemized checkouts pushed from the website. Update it to firmware **6.62 or later**.
3. Add a webhook subscription in the Square app settings, pointing to `https://<your-domain>/api/payments/square-webhook`, with events `terminal.checkout.updated` and `refund.updated`. Copy the signature key.
4. Add the 4 env vars to your hosting provider.

---

## Decisions to make

| # | Question | Recommendation |
|---|---|---|
| 1 | Should Square use **Catalog items** (Adult Ticket, Child Ticket… set up in the Square Dashboard) or **ad-hoc line items** built from Volt's pricing? | **Ad-hoc** to start. Volt's Settings stay the single source of prices, so nothing drifts. Square reports still group sales by line-item name. Catalog items can be added later if you want Square's item reports. |
| 2 | How should a cash + Square split appear on the Square receipt? | **Decided:** Split has a "Rest on: Square / Card" toggle; Square shows the full cart plus a `Paid in cash` line. |
| 3 | Do online (Stripe) bookings also need to appear in Square? | **No.** Keep them in Stripe. Volt's Payments page and Reports already combine every method. |
| 4 | Tipping on the Terminal? | Off (`tip_settings.allow_tipping: false`) unless drivers or staff should get tips. |

## Things to know
- **Two processors, two payouts:** Stripe and Square deposit separately. Volt's Payments and Reports pages are where everything comes together.
- **Fees:** Square charges ~2.6% + 15¢ for in-person taps, which is usually lower than Stripe's online rate.
- **US only:** itemized Terminal carts are supported in the US, which covers Volt.

## Sources
- [Take Payments for Orders — Terminal API](https://developer.squareup.com/docs/terminal-api/take-payments-for-orders)
- [Create terminal checkout — API reference](https://developer.squareup.com/reference/square/terminal-api/create-terminal-checkout)
- [TerminalCheckout object](https://developer.squareup.com/reference/square/objects/TerminalCheckout)
