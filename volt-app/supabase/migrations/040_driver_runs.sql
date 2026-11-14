-- 040 — Driver runs: drivers run their own trips from "My Trips" (owner, 2026-11-13).
--
-- Office staff still pick the driver and van for each departure (trip_vehicles).
-- The driver then works the trip from their phone:
--   ATL → Columbus:  pre-trip check · "On the way to ATL" · "Arrived at <terminal>"
--                    (one stop per terminal riders are at) · board / no-show ·
--                    "Heading to Columbus" · "Back at Volt"
--   Columbus → ATL:  pre-trip check · board at Volt · "Leaving Volt" ·
--                    "Dropped off at <terminal>" per stop · "Back at Volt"
--
-- Every tap is a row in trip_run_events (one run = one trip_vehicles row), so
-- where a van is, what's next, and the on-time report are all worked out from
-- the events (src/lib/driver-run.ts). Riders follow along on /track/<token>
-- and can tell the driver "I'm outside", "my flight is late", "I'm at another
-- terminal", … (trip_rider_updates). All writes go through service-role API
-- routes; employees can read.

-- ── Driver photo (shown to riders on the tracking page) ─────────────────────
alter table public.drivers add column if not exists photo_url text;

-- Public bucket for team photos and ATL pickup-spot photos (meant to be seen
-- by riders). Uploads go through /api/driver-runs/photo with the service role.
insert into storage.buckets (id, name, public)
  values ('team-photos', 'team-photos', true)
  on conflict (id) do nothing;

-- ── Rider tracking link ─────────────────────────────────────────────────────
alter table public.reservations add column if not exists track_token uuid;
update public.reservations set track_token = gen_random_uuid() where track_token is null;
alter table public.reservations alter column track_token set default gen_random_uuid();
alter table public.reservations alter column track_token set not null;
create unique index if not exists idx_reservations_track_token on public.reservations(track_token);

-- ── Settings: ATL wait, pickup spots, shift length ──────────────────────────
alter table public.booking_settings
  add column if not exists atl_wait_minutes        integer not null default 20,
  add column if not exists atl_wait_max_minutes    integer not null default 25,
  add column if not exists driver_max_shift_hours  integer not null default 10,
  add column if not exists atl_spot_domestic_south text not null default
    'Commercial shuttle pickup (Ground Transportation), Domestic Terminal South side, lower level. Follow the "Ground Transportation" signs from baggage claim.',
  add column if not exists atl_spot_domestic_north text not null default
    'Commercial shuttle pickup (Ground Transportation), Domestic Terminal North side, lower level. Follow the "Ground Transportation" signs from baggage claim.',
  add column if not exists atl_spot_international  text not null default
    'Commercial shuttle pickup, International Terminal (Concourse F), arrivals level. Follow the "Ground Transportation" signs.',
  add column if not exists atl_spot_domestic_south_photo text,
  add column if not exists atl_spot_domestic_north_photo text,
  add column if not exists atl_spot_international_photo  text;

-- ── Run events ──────────────────────────────────────────────────────────────
create table if not exists public.trip_run_events (
  id               uuid primary key default gen_random_uuid(),
  trip_vehicle_id  uuid not null references public.trip_vehicles(id) on delete cascade,
  trip_id          uuid not null references public.trips(id) on delete cascade,
  driver_id        uuid references public.drivers(id) on delete set null,
  kind             text not null check (kind in (
                     'left_volt',        -- pulled out of Volt
                     'arrived_stop',     -- at a terminal (pickup or drop-off)
                     'stop_done',        -- finished at that terminal
                     'heading_home',     -- all ATL stops done, driving back
                     'run_completed',    -- back at Volt, run over
                     'stop_reopened',    -- office/driver undid an arrival
                     'boarded', 'unboarded', 'no_show', 'spot_note'
                   )),
  terminal         text,
  reservation_id   uuid references public.reservations(id) on delete set null,
  note             text,
  actor            text not null default 'driver' check (actor in ('driver', 'office')),
  actor_employee_id uuid references public.employees(id) on delete set null,
  client_id        text,                -- the phone's id for the tap, so a retried tap isn't saved twice
  happened_at      timestamptz not null default now(),   -- when the driver tapped (may be earlier if offline)
  created_at       timestamptz not null default now()
);

create index if not exists idx_trip_run_events_trip on public.trip_run_events(trip_id, happened_at);
create index if not exists idx_trip_run_events_tv   on public.trip_run_events(trip_vehicle_id, happened_at);
create unique index if not exists idx_trip_run_events_client on public.trip_run_events(trip_vehicle_id, client_id) where client_id is not null;

alter table public.trip_run_events enable row level security;
drop policy if exists trip_run_events_employee_read on public.trip_run_events;
create policy trip_run_events_employee_read on public.trip_run_events for select using (is_employee());

-- ── What riders tell us from the tracking page ──────────────────────────────
create table if not exists public.trip_rider_updates (
  trip_id          uuid not null references public.trips(id) on delete cascade,
  reservation_id   uuid not null references public.reservations(id) on delete cascade,
  status           text check (status in ('outside', 'baggage', 'delayed', 'cant_make_it')),
  delay_minutes    integer,             -- baggage: 10 / 20 / 30
  new_landing_time time,                -- delayed flight
  terminal         text,                -- "I'm at a different terminal"
  updated_at       timestamptz not null default now(),
  primary key (trip_id, reservation_id)
);

alter table public.trip_rider_updates enable row level security;
drop policy if exists trip_rider_updates_employee_read on public.trip_rider_updates;
create policy trip_rider_updates_employee_read on public.trip_rider_updates for select using (is_employee());

-- ── Pre-trip vehicle checks ─────────────────────────────────────────────────
create table if not exists public.vehicle_checks (
  id               uuid primary key default gen_random_uuid(),
  vehicle_id       uuid not null references public.vehicles(id) on delete cascade,
  driver_id        uuid references public.drivers(id) on delete set null,
  trip_vehicle_id  uuid references public.trip_vehicles(id) on delete set null,
  items            jsonb not null default '{}'::jsonb,   -- { tires: true, lights: true, … }
  mileage          integer,
  fuel_level       text check (fuel_level in ('full', '3/4', '1/2', '1/4', 'low')),
  notes            text,
  checked_at       timestamptz not null default now()
);

create index if not exists idx_vehicle_checks_vehicle on public.vehicle_checks(vehicle_id, checked_at desc);

alter table public.vehicle_checks enable row level security;
drop policy if exists vehicle_checks_employee_read on public.vehicle_checks;
create policy vehicle_checks_employee_read on public.vehicle_checks for select using (is_employee());

-- ── Staff alert: problems on a run ──────────────────────────────────────────
alter table public.staff_alert_subscriptions drop constraint if exists staff_alert_subscriptions_alert_type_check;
alter table public.staff_alert_subscriptions add constraint staff_alert_subscriptions_alert_type_check
  check (alert_type in ('short_notice_booking', 'online_cancellation', 'hold_expiring', 'payment_without_reservation',
                        'van_capacity', 'message_failed', 'service_pause', 'trip_reminder', 'driver_run'));

-- ── Thank-you message timing uses the real drop-off when the driver logged one ─
-- Same as migration 038, except a leg counts as finished at the run's
-- 'run_completed' tap (or, Columbus → ATL, the drop-off at the rider's stop)
-- when there is one, instead of departure + drive time.
create or replace function public.due_post_trip_messages(p_delay_minutes integer default 120)
returns table (
  reservation_id      uuid,
  email               text,
  phone               text,
  first_name          text,
  confirmation_number text,
  review_token        uuid,
  email_due           boolean,
  sms_due             boolean
)
language sql stable security definer set search_path = public, pg_temp
as $$
  with legs as (
    select r.id as rid, r.trip_id as tid, false as is_return
    from reservations r
    where r.status in ('confirmed', 'completed') and r.deleted_at is null
    union all
    select r.id, r.return_trip_id, true
    from reservations r
    where r.status in ('confirmed', 'completed') and r.deleted_at is null
      and r.is_round_trip and r.return_trip_id is not null
  ),
  finished as (
    select l.rid, l.is_return,
      coalesce(
        (select min(e.happened_at) from trip_run_events e
          where e.trip_id = t.id and e.kind in ('stop_done', 'run_completed')
            and (e.kind = 'run_completed' or ro.origin_key = 'columbus')
            and (e.kind = 'run_completed' or e.terminal = (
                  select f.terminal from reservation_flights f where f.reservation_id = l.rid and f.trip_id = t.id limit 1))),
        ((t.departure_date + t.departure_time) at time zone 'America/New_York')
          + make_interval(mins => coalesce(ro.duration_minutes, 120))
      ) as done_at
    from legs l
    join trips t on t.id = l.tid
    join routes ro on ro.id = t.route_id
    where t.status <> 'cancelled'
  ),
  arrived as (
    select distinct f.rid
    from finished f
    where f.done_at + make_interval(mins => p_delay_minutes) between now() - interval '7 days' and now()
      and exists (
        select 1 from reservation_passengers p
        where p.reservation_id = f.rid
          and not (case when f.is_return then p.return_is_no_show else p.is_no_show end)
      )
  ),
  candidates as (
    select r.id, c.email, c.phone, c.first_name, r.confirmation_number, r.review_token,
      coalesce(c.email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' and c.email !~* '@(guest|walkin)\.volt$'
        and not exists (select 1 from notifications n where n.reservation_id = r.id and n.kind = 'review_request'), false) as email_due,
      coalesce(r.sms_consent and coalesce(c.phone, '') <> ''
        and not exists (select 1 from notifications n where n.reservation_id = r.id and n.kind = 'review_request_sms')
        and not exists (select 1 from notifications n where n.reservation_id = r.id and n.kind = 'review_request'
                          and n.created_at < now() - interval '1 hour'), false) as sms_due
    from arrived a
    join reservations r on r.id = a.rid
    join customers c on c.id = r.customer_id
    where not exists (select 1 from reviews v where v.reservation_id = r.id)
  )
  select id, case when email_due then email end, case when sms_due then phone end,
         first_name, confirmation_number, review_token, email_due, sms_due
  from candidates
  where email_due or sms_due;
$$;

revoke execute on function public.due_post_trip_messages(integer) from public, anon, authenticated;
grant  execute on function public.due_post_trip_messages(integer) to service_role;

-- ── Office staff assign drivers and vans too (owner, 2026-11-13) ────────────
drop policy if exists trip_vehicles_office_all on public.trip_vehicles;
create policy trip_vehicles_office_all on public.trip_vehicles
  for all using (is_employee_with_roles(array['owner', 'manager', 'office_staff']))
  with check (is_employee_with_roles(array['owner', 'manager', 'office_staff']));

-- ── Rider ↔ driver messages (tracking page ↔ My Trips) ──────────────────────
-- Riders type a short note on /track/<token>; drivers answer with quick
-- replies, which show on the rider's page (and are texted if they agreed).
create table if not exists public.trip_messages (
  id               uuid primary key default gen_random_uuid(),
  trip_id          uuid not null references public.trips(id) on delete cascade,
  reservation_id   uuid not null references public.reservations(id) on delete cascade,
  sender           text not null check (sender in ('rider', 'driver', 'office')),
  body             text not null check (char_length(body) between 1 and 300),
  employee_id      uuid references public.employees(id) on delete set null,
  created_at       timestamptz not null default now()
);

create index if not exists idx_trip_messages_trip on public.trip_messages(trip_id, created_at);

alter table public.trip_messages enable row level security;
drop policy if exists trip_messages_employee_read on public.trip_messages;
create policy trip_messages_employee_read on public.trip_messages for select using (is_employee());
