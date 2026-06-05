-- ═══════════════════════════════════════════════════════════════════════════════
-- Volt Transportation — Seed Data
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── ROUTES ──────────────────────────────────────────────────────────────────
insert into routes (id, name, origin_label, origin_key, destination_label, destination_key, duration_minutes, is_active)
values
  -- Columbus → ATL
  ('11111111-1111-1111-1111-111111111111',
   'Columbus → ATL Airport',
   'Columbus, GA', 'columbus',
   'ATL Airport',  'atl',
   150, true),

  -- ATL → Columbus (return route)
  ('22222222-2222-2222-2222-222222222222',
   'ATL Airport → Columbus',
   'ATL Airport',  'atl',
   'Columbus, GA', 'columbus',
   150, true);

-- ─── VEHICLES ────────────────────────────────────────────────────────────────
insert into vehicles (name, license_plate, make, model, year, capacity, status)
values
  ('Sprinter 01', 'VOLT-001', 'Mercedes', 'Sprinter 2500', 2023, 8, 'active'),
  ('Sprinter 02', 'VOLT-002', 'Mercedes', 'Sprinter 2500', 2024, 8, 'active');

-- ─── DISCOUNTS ───────────────────────────────────────────────────────────────
insert into discounts (code, name, type, value, is_active)
values
  -- Military discount — no code, staff-applied only
  (null, 'Military Discount', 'percent', 15, true),
  -- Example promo (can be activated/deactivated as needed)
  ('VOLT10', 'New Customer Promo', 'fixed', 10, false);

-- ─── GENERATE TRIP SLOTS ─────────────────────────────────────────────────────
-- This generates hourly trips for both routes for the next 90 days.
-- In production, run this via a scheduled Supabase Edge Function or cron job.
-- For initial setup, this covers the launch period.

do $$
declare
  d date;
  h integer;
  route_id uuid;
  route_ids uuid[] := array[
    '11111111-1111-1111-1111-111111111111'::uuid,
    '22222222-2222-2222-2222-222222222222'::uuid
  ];
begin
  foreach route_id in array route_ids loop
    for d in select generate_series(current_date, current_date + interval '90 days', interval '1 day')::date loop
      for h in 0..23 loop
        insert into trips (route_id, departure_date, departure_time, total_capacity, seats_booked, status)
        values (
          route_id,
          d,
          make_time(h, 0, 0),
          8,
          0,
          'scheduled'
        )
        on conflict do nothing;
      end loop;
    end loop;
  end loop;
end $$;

-- ─── OWNER ACCOUNT SETUP INSTRUCTIONS ────────────────────────────────────────
-- After running this migration:
-- 1. Create an account via Supabase Auth (Dashboard → Authentication → Users → Add User)
--    OR via your /emp-login page after launch
-- 2. Insert an employee record for the owner:
--
-- insert into employees (user_id, role, first_name, last_name, email)
-- values (
--   'USER-UUID-FROM-AUTH-TABLE',  -- replace with actual auth.users id
--   'owner',
--   'Your First Name',
--   'Your Last Name',
--   'your@email.com'
-- );
