-- 029 — Square Terminal for walk-in (in-person) card payments.
--   • payment_method gains 'square': a card tapped/dipped on the counter
--     Square Terminal. Online bookings and phone cards stay on Stripe.
--   • Each Square payment row keeps the Square order (itemized cart shown on
--     the Terminal), the Terminal checkout sent to the device, and the Square
--     payment it produced (used for refunds).
--   • square_devices: the paired Terminals staff can send a checkout to.
--     Managed by owners/managers in Dashboard → Settings → Payments; only the
--     service-role API routes read or write it.

alter type payment_method add value if not exists 'square';

alter table public.payments
  add column if not exists square_order_id    text,
  add column if not exists square_checkout_id text unique,
  add column if not exists square_payment_id  text unique;

create table if not exists public.square_devices (
  id              uuid primary key default uuid_generate_v4(),
  name            text not null,
  device_id       text not null unique,
  device_code_id  text,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

drop trigger if exists set_square_devices_updated_at on public.square_devices;
create trigger set_square_devices_updated_at before update on public.square_devices
  for each row execute function set_updated_at();

-- Service-role API routes only; no anon/authenticated access.
alter table public.square_devices enable row level security;
