-- 031 — Tips, door-to-door pickup / drop-off, and ride-alongs.
--   • Tips: riders can tip at online checkout, from the ride-along page, or
--     after the trip (/tip/<review_token>, linked from the review request
--     email). Staff can add one when booking. reservations.tip_cents is part
--     of total_cents, so balances, receipts and cancellation refunds include
--     it. A tip paid after the trip is its own payments row (is_tip = true)
--     and is added to the reservation by add_reservation_tip(). Refunding a
--     tip takes it back off; it never cancels the reservation.
--   • Door service (Team Portal only): optional pickup at an address and/or
--     drop-off at an address, a flat fee each (booking_settings, default $50).
--     Also part of total_cents; never discounted.
--   • Ride-alongs: a driver or office staff opens a QR code for a departing
--     trip; the rider scans it, picks their party and pays on their phone. The
--     QR's token is ride_along_sessions.token. A QR stays open for 30 minutes
--     (several parties can scan the same one) or until staff close it. Each
--     paid party is a normal reservation (is_ride_along) made through
--     booking_checkouts (ride_along_id).
--
--   total_cents = subtotal_cents − discount_cents + pickup_fee_cents
--                 + dropoff_fee_cents + tip_cents

alter table public.reservations
  add column if not exists tip_cents          integer not null default 0 check (tip_cents >= 0),
  add column if not exists pickup_fee_cents   integer not null default 0 check (pickup_fee_cents >= 0),
  add column if not exists dropoff_fee_cents  integer not null default 0 check (dropoff_fee_cents >= 0),
  add column if not exists pickup_address     text,
  add column if not exists dropoff_address    text,
  add column if not exists is_ride_along      boolean not null default false;

alter table public.booking_checkouts
  add column if not exists tip_cents     integer not null default 0 check (tip_cents >= 0),
  add column if not exists ride_along_id uuid;

alter table public.payments
  add column if not exists is_tip boolean not null default false;

alter table public.booking_settings
  add column if not exists door_pickup_fee_cents  integer not null default 5000,
  add column if not exists door_dropoff_fee_cents integer not null default 5000;

-- ── Ride-along QR sessions ──────────────────────────────────────────────────
create table if not exists public.ride_along_sessions (
  id                      uuid primary key default uuid_generate_v4(),
  token                   uuid not null unique default gen_random_uuid(),
  trip_id                 uuid not null references public.trips(id) on delete cascade,
  created_by_employee_id  uuid references public.employees(id) on delete set null,
  status                  text not null default 'open' check (status in ('open', 'closed')),
  reservation_id          uuid references public.reservations(id) on delete set null,
  expires_at              timestamptz not null,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create index if not exists idx_ride_along_sessions_trip on public.ride_along_sessions(trip_id, created_at desc);

drop trigger if exists set_ride_along_sessions_updated_at on public.ride_along_sessions;
create trigger set_ride_along_sessions_updated_at before update on public.ride_along_sessions
  for each row execute function set_updated_at();

-- Service-role API routes only.
alter table public.ride_along_sessions enable row level security;

-- ── Tips paid after booking ─────────────────────────────────────────────────
-- Adds (or, for a refunded tip, removes — negative p_cents) a tip on a
-- reservation and its total in one statement, so concurrent writers can't lose
-- an update. The tip never goes below zero.
create or replace function public.add_reservation_tip(p_reservation_id uuid, p_cents integer)
returns void language sql security definer set search_path = public, pg_temp
as $$
  update reservations
     set total_cents = total_cents - tip_cents + greatest(tip_cents + p_cents, 0),
         tip_cents   = greatest(tip_cents + p_cents, 0)
   where id = p_reservation_id;
$$;

revoke execute on function public.add_reservation_tip(uuid, integer) from public, anon, authenticated;
grant  execute on function public.add_reservation_tip(uuid, integer) to service_role;

-- One tip payment row per PaymentIntent (the browser and the webhook both record it).
create unique index if not exists idx_payments_tip_payment_intent
  on public.payments(stripe_payment_intent_id) where is_tip;
