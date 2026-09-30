-- ═══════════════════════════════════════════════════════════════════════════════
-- Stripe checkout: server-priced checkouts, webhook-safe finalization, and
-- authorize-then-capture for Military Discount bookings awaiting verification.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── Payment states ─────────────────────────────────────────────────────────────
-- authorized: card is on hold for the full fare (Military Discount under review);
--             captured later at 90% (approved) or 100% (denied / can't verify).
-- voided:     the hold was released without charging (booking cancelled, or the
--             authorization expired).
alter type payment_status add value if not exists 'authorized';
alter type payment_status add value if not exists 'voided';

alter table payments
  add column if not exists authorization_expires_at timestamptz,
  add column if not exists captured_at timestamptz,
  add column if not exists captured_by_employee_id uuid references employees(id) on delete set null;

-- ── Checkouts ──────────────────────────────────────────────────────────────────
-- One row per checkout attempt. Holds the server-verified booking details and
-- price BEFORE payment, so the reservation can be created from the Stripe
-- webhook even if the rider closes the page. Each checkout maps to exactly one
-- PaymentIntent and at most one reservation.
create table if not exists booking_checkouts (
  id                         uuid primary key default uuid_generate_v4(),
  status                     text not null default 'open'
                               check (status in ('open', 'processing', 'completed', 'failed')),
  customer_id                uuid references customers(id) on delete set null,
  payload                    jsonb not null,
  subtotal_cents             integer not null,
  discount_cents             integer not null default 0,
  total_cents                integer not null,
  capture_method             text not null default 'automatic'
                               check (capture_method in ('automatic', 'manual')),
  is_military                boolean not null default false,
  military_discount_pending  boolean not null default false,
  stripe_payment_intent_id   text unique,
  reservation_id             uuid references reservations(id) on delete set null,
  confirmation_number        text,
  error                      text,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now()
);

create index if not exists idx_booking_checkouts_status on booking_checkouts(status);

drop trigger if exists set_booking_checkouts_updated_at on booking_checkouts;
create trigger set_booking_checkouts_updated_at before update on booking_checkouts
  for each row execute function set_updated_at();

-- Service-role API routes only; no anon/authenticated access.
alter table booking_checkouts enable row level security;
