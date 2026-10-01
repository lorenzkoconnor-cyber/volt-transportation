-- ═══════════════════════════════════════════════════════════════════════════════
-- One-time discount codes
-- Created by an owner/manager for a customer who needs more than the standard
-- discount. Each code: percent OR fixed amount, usable ONCE, expires 3 days
-- after creation. Can make a booking free (booked as a comp, no card).
-- All access goes through service-role API routes (owner/manager checks there).
-- ═══════════════════════════════════════════════════════════════════════════════

create table if not exists discount_codes (
  id                    uuid primary key default uuid_generate_v4(),
  code                  text not null unique,          -- normalized: uppercase, no dashes
  discount_type         text not null check (discount_type in ('percent', 'fixed')),
  value                 integer not null,              -- percent: 1–100 · fixed: cents
  note                  text not null,                 -- who it's for / why
  created_by            uuid references employees(id) on delete set null,
  created_at            timestamptz not null default now(),
  expires_at            timestamptz not null,
  revoked_at            timestamptz,
  revoked_by            uuid references employees(id) on delete set null,
  -- A checkout holds the code briefly while the rider pays, so two people
  -- can't both spend it at once.
  reserved_checkout_id  uuid references booking_checkouts(id) on delete set null,
  reserved_until        timestamptz,
  -- Spent: set once, never cleared.
  used_at               timestamptz,
  used_checkout_id      uuid references booking_checkouts(id) on delete set null,
  used_reservation_id   uuid references reservations(id) on delete set null,
  constraint discount_codes_value_range check (
    (discount_type = 'percent' and value between 1 and 100) or
    (discount_type = 'fixed' and value >= 100)
  )
);

create index if not exists idx_discount_codes_created on discount_codes(created_at desc);

alter table discount_codes enable row level security;

alter table booking_checkouts
  add column if not exists discount_code_id uuid references discount_codes(id) on delete set null;

alter table reservations
  add column if not exists discount_code_id uuid references discount_codes(id) on delete set null;
