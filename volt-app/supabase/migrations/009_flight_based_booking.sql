-- ═══════════════════════════════════════════════════════════════════════════════
-- Flight-based booking
-- Riders can tell us about their flight; the booking flow then offers only the
-- shuttle departures that fit it. Route time and the fit windows are owner/
-- manager-adjustable settings (Dashboard → Settings), not hard-coded.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── Standard scheduled route time: 1 hr 45 min ─────────────────────────────────
-- Apple Maps estimates Volt → ATL at ~1 hr 30 min; 105 min adds a 15-min
-- operational buffer. Stored per direction on routes.duration_minutes.
alter table routes alter column duration_minutes set default 105;
update routes set duration_minutes = 105 where duration_minutes = 150;

-- ── Flight-fit windows (single-row settings table) ─────────────────────────────
create table if not exists booking_settings (
  id                          boolean primary key default true check (id),
  -- Flying OUT of ATL: offer shuttles that reach ATL this long before the flight
  depart_min_buffer_minutes   integer not null default 60,
  depart_max_buffer_minutes   integer not null default 240,
  -- Flying INTO ATL: offer shuttles leaving ATL this long after landing
  arrive_min_wait_minutes     integer not null default 30,
  arrive_max_wait_minutes     integer not null default 180,
  updated_at                  timestamptz not null default now(),
  updated_by                  uuid references employees(id) on delete set null,
  constraint depart_window_valid check (depart_min_buffer_minutes >= 0 and depart_max_buffer_minutes > depart_min_buffer_minutes),
  constraint arrive_window_valid check (arrive_min_wait_minutes >= 0 and arrive_max_wait_minutes > arrive_min_wait_minutes)
);

insert into booking_settings (id) values (true) on conflict (id) do nothing;

alter table booking_settings enable row level security;

create policy "booking_settings_public_read" on booking_settings
  for select using (true);

create policy "booking_settings_admin_update" on booking_settings
  for update using (is_employee_with_roles(array['owner', 'manager']));

create trigger set_booking_settings_updated_at before update on booking_settings
  for each row execute function set_updated_at();

-- ── Flight details per reservation leg ─────────────────────────────────────────
-- trip_id is the Volt departure this flight belongs to, so the manifest can show
-- a trip's flights directly (works for both outbound and return legs).
create table if not exists reservation_flights (
  id                  uuid primary key default uuid_generate_v4(),
  reservation_id      uuid not null references reservations(id) on delete cascade,
  trip_id             uuid not null references trips(id) on delete restrict,
  leg                 text not null check (leg in ('outbound', 'return')),
  direction           text not null check (direction in ('departing', 'arriving')), -- departing = flying out of ATL
  airline             text not null,
  flight_number       text not null,
  terminal            text not null,
  flight_date         date not null,
  flight_time         time not null,   -- departure time if departing, arrival time if arriving
  created_at          timestamptz not null default now(),
  unique (reservation_id, leg)
);

create index if not exists idx_reservation_flights_trip on reservation_flights(trip_id);
create index if not exists idx_reservation_flights_date on reservation_flights(flight_date);

alter table reservation_flights enable row level security;

-- Writes go through the service-role booking API; employees can read and fix.
create policy "reservation_flights_employee_all" on reservation_flights
  for all using (is_employee());

create policy "reservation_flights_customer_read" on reservation_flights
  for select using (
    exists (
      select 1 from reservations r
      join customers c on c.id = r.customer_id
      where r.id = reservation_flights.reservation_id
        and c.user_id = auth.uid()
    )
  );
