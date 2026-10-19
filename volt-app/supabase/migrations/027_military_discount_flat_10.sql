-- ═══════════════════════════════════════════════════════════════════════════════
-- Military Discount policy change (2026-10-19)
--   • A flat $10 off every verified military booking (once per reservation —
--     round trip or not, any party size), instead of 10%. Never more than the fare.
--   • Volt donates the same $10 to Warrior Outreach Ranch for every military
--     booking that gets the discount. This replaces "10% of profits".
--   • Owners/managers set the amount in Dashboard → Settings. Each booking's
--     pricing_snapshot stores it as military_amount_cents so later changes never
--     alter an existing booking (receipts, card-hold capture, donation totals).
-- ═══════════════════════════════════════════════════════════════════════════════

alter table public.booking_settings
  add column if not exists military_discount_amount_cents integer not null default 1000
    check (military_discount_amount_cents between 100 and 10000);

comment on column public.booking_settings.military_discount_percent is
  'Unused since 2026-10-19 — replaced by military_discount_amount_cents (flat $ per booking).';

-- Keep the reference row in `discounts` in sync with the live policy.
update discounts
   set type = 'fixed', value = 10
 where name = 'Military Discount';
