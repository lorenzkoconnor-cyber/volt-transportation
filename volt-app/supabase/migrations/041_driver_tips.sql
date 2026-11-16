-- 041: Driver tips
--   • Tips stay in revenue as before. Each tip is credited to the driver(s) of
--     the leg(s) the rider rode: a round trip's tip is split evenly between the
--     outbound and return drivers; a van with no driver yet shows "Unassigned".
--   • Card tips (Stripe or Square) pay the driver the tip minus an estimated
--     processing fee, booking_settings.tip_card_fee_percent (default 2.9%).
--   • A tip stays UNPAID until an owner or manager marks it paid on the
--     Driver Tips page. Each "mark paid" writes one row per tip share in a batch;
--     undoing a batch deletes its rows. A tip that changes after it was paid
--     (e.g. a later tip or a refund) shows the difference as unpaid again.
--   • Shares are worked out in the app (src/lib/driver-tips.ts); this table only
--     records what was handed to each driver.

alter table public.booking_settings
  add column if not exists tip_card_fee_percent numeric(5,2) not null default 2.9
    check (tip_card_fee_percent >= 0 and tip_card_fee_percent <= 20);

create table if not exists public.driver_tip_payouts (
  id               uuid primary key default gen_random_uuid(),
  batch_id         uuid not null,
  driver_id        uuid not null references public.drivers(id) on delete cascade,
  -- "<reservation id>:<out|ret>" — the tip share this payment covers
  share_key        text not null,
  reservation_id   uuid references public.reservations(id) on delete set null,
  amount_cents     integer not null,
  paid_by          uuid references public.employees(id) on delete set null,
  paid_by_name     text,
  created_at       timestamptz not null default now()
);

create index if not exists idx_driver_tip_payouts_driver on public.driver_tip_payouts(driver_id);
create index if not exists idx_driver_tip_payouts_batch on public.driver_tip_payouts(batch_id);

-- Read/written only by the server (service role) behind owner/manager/driver checks.
alter table public.driver_tip_payouts enable row level security;
