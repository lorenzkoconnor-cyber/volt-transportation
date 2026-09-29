-- ═══════════════════════════════════════════════════════════════════════════════
-- Volt Transportation — 2-hour departure schedule + 2-hour route time
-- ═══════════════════════════════════════════════════════════════════════════════
-- 7 days a week:
--   Columbus → ATL: first van 4:00 AM, last van 8:00 PM, every 2 hours
--   ATL → Columbus: first van 6:00 AM, last van 10:00 PM, every 2 hours
--                   (each van turns around on arrival at ATL)
-- Route time is now 2 hours each way (was 1 hr 45 min).

-- ── Route time ────────────────────────────────────────────────────────────────
alter table routes alter column duration_minutes set default 120;
update routes set duration_minutes = 120;

-- ── Per-route departure schedule ─────────────────────────────────────────────
alter table routes
  add column if not exists first_departure_time       time    not null default '04:00',
  add column if not exists last_departure_time        time    not null default '20:00',
  add column if not exists departure_interval_minutes integer not null default 120
    check (departure_interval_minutes between 15 and 1440);

update routes set first_departure_time = '04:00', last_departure_time = '20:00', departure_interval_minutes = 120
  where origin_key = 'columbus';
update routes set first_departure_time = '06:00', last_departure_time = '22:00', departure_interval_minutes = 120
  where origin_key = 'atl';

-- ── Trip generation follows each route's schedule ────────────────────────────
-- Idempotent (UNIQUE route/date/time from 007), so it also fills any gaps.
create or replace function generate_trips_for_range(p_start date, p_end date)
returns void as $$
begin
  insert into trips (route_id, departure_date, departure_time, total_capacity, seats_booked, status)
  select r.id, d::date, s::time, 8, 0, 'scheduled'
  from routes r
  cross join generate_series(p_start, p_end, interval '1 day') d
  cross join lateral generate_series(
    timestamp '2000-01-01' + r.first_departure_time,
    timestamp '2000-01-01' + r.last_departure_time,
    make_interval(mins => r.departure_interval_minutes)
  ) s
  where r.is_active = true
  on conflict do nothing;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

create or replace function generate_future_trips()
returns void as $$
begin
  perform generate_trips_for_range(current_date, current_date + 90);
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

revoke execute on function generate_trips_for_range(date, date) from anon, public;
revoke execute on function generate_future_trips()             from anon, public;

-- ── Remove upcoming trips that are no longer on the schedule ─────────────────
-- Only empty trips: anything a reservation or flight points at is kept so no
-- booking is lost (staff can move those riders in Dispatch).
delete from trips t
using routes r
where r.id = t.route_id
  and t.departure_date >= current_date
  and (
    t.departure_time < r.first_departure_time
    or t.departure_time > r.last_departure_time
    or mod((extract(epoch from (t.departure_time - r.first_departure_time)) / 60)::int,
           r.departure_interval_minutes) <> 0
  )
  and not exists (select 1 from reservations x where x.trip_id = t.id or x.return_trip_id = t.id)
  and not exists (select 1 from reservation_flights f where f.trip_id = t.id);

-- Make sure every on-schedule slot exists through the current horizon.
select generate_trips_for_range(
  current_date,
  greatest(current_date + 90, (select max(departure_date) from trips))
);
