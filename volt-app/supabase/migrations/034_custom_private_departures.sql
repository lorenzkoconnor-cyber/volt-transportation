-- ═══════════════════════════════════════════════════════════════════════════════
-- Volt Transportation — custom & private departures (owners/managers only)
-- ═══════════════════════════════════════════════════════════════════════════════
-- Riders online only ever see the regular schedule (every 2 hours). Owners and
-- managers can book a rider on any half-hour (a custom departure), make a van
-- private (no other riders), set any fare and change door-service fees.
--
--   trips.is_custom    — off the route schedule. Set automatically from the
--                        time; never shown or sold online.
--   trips.is_private   — one booking only; never shown or sold online. A
--                        regular departure goes back to public once empty.
--   reservations.custom_fare — the fare (subtotal_cents) was typed in by an
--                        owner/manager instead of priced per seat.
--
-- Only owners and managers (or the server) may add/delete departures or change
-- a departure's time, route, seats, custom or private flag. Office staff and
-- drivers can still change status and assign vans in Dispatch.

alter table trips
  add column if not exists is_custom  boolean not null default false,
  add column if not exists is_private boolean not null default false;

alter table reservations
  add column if not exists custom_fare boolean not null default false;

-- Is `p_time` one of this route's scheduled departure times?
create or replace function trip_on_schedule(p_route_id uuid, p_time time)
returns boolean
language sql stable set search_path = public, pg_temp
as $$
  select exists (
    select 1 from routes r
    where r.id = p_route_id
      and p_time >= r.first_departure_time
      and p_time <= r.last_departure_time
      and mod((extract(epoch from (p_time - r.first_departure_time)) / 60)::int, r.departure_interval_minutes) = 0
  );
$$;

create or replace function trips_guard()
returns trigger
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  -- Signed-in employees below manager can't reshape the schedule. (The server
  -- and cron run without auth.uid() and are trusted.)
  if auth.uid() is not null and coalesce(get_employee_role(), '') not in ('owner', 'manager') then
    if tg_op in ('INSERT', 'DELETE') then
      raise exception 'Only an owner or manager can add or remove departures.';
    end if;
    if new.departure_date is distinct from old.departure_date
      or new.departure_time is distinct from old.departure_time
      or new.route_id is distinct from old.route_id
      or new.total_capacity is distinct from old.total_capacity
      or new.is_custom is distinct from old.is_custom
      or new.is_private is distinct from old.is_private then
      raise exception 'Only an owner or manager can change a departure''s time, seats or privacy.';
    end if;
  end if;

  if tg_op = 'DELETE' then return old; end if;

  if tg_op = 'INSERT' or new.departure_time is distinct from old.departure_time or new.route_id is distinct from old.route_id then
    new.is_custom := not trip_on_schedule(new.route_id, new.departure_time);
  end if;
  -- A private regular departure opens back up once its booking moves or cancels.
  if tg_op = 'UPDATE' and new.is_private and not new.is_custom and new.seats_booked = 0 and old.seats_booked > 0 then
    new.is_private := false;
  end if;
  return new;
end;
$$;

drop trigger if exists trips_guard on trips;
create trigger trips_guard
  before insert or update or delete on trips
  for each row execute function trips_guard();

-- Existing departures: anything off the schedule is custom (staff only).
update trips set is_custom = not trip_on_schedule(route_id, departure_time)
where is_custom is distinct from (not trip_on_schedule(route_id, departure_time));

-- Schedule edits (023) never remove custom departures, and anything left off
-- the new schedule becomes custom (staff only) instead of staying on sale.
create or replace function apply_route_schedule()
returns table (removed integer, added integer, kept_with_riders integer)
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_removed integer;
  v_before  integer;
  v_after   integer;
  v_kept    integer;
  v_now     timestamp := (now() at time zone 'America/New_York');
begin
  with gone as (
    delete from trips t
    where (t.departure_date + t.departure_time) > v_now
      and t.status = 'scheduled'
      and t.seats_booked = 0
      and not t.is_custom
      and not trip_on_schedule(t.route_id, t.departure_time)
      and not exists (select 1 from reservations x where x.trip_id = t.id or x.return_trip_id = t.id)
      and not exists (select 1 from reservation_flights f where f.trip_id = t.id)
      and not exists (select 1 from trip_vehicles v where v.trip_id = t.id)
    returning 1
  )
  select count(*) into v_removed from gone;

  select count(*) into v_kept
  from trips t
  where (t.departure_date + t.departure_time) > v_now
    and t.status <> 'cancelled'
    and not t.is_custom
    and not trip_on_schedule(t.route_id, t.departure_time);

  select count(*) into v_before from trips where departure_date >= current_date;
  perform generate_trips_for_range(
    current_date,
    greatest(current_date + 365, coalesce((select max(departure_date) from trips), current_date))
  );
  select count(*) into v_after from trips where departure_date >= current_date;

  update trips t set is_custom = not trip_on_schedule(t.route_id, t.departure_time)
  where (t.departure_date + t.departure_time) > v_now
    and t.is_custom is distinct from (not trip_on_schedule(t.route_id, t.departure_time));

  return query select v_removed, v_after - v_before, v_kept;
end;
$$;
revoke execute on function apply_route_schedule() from public, anon, authenticated;
grant  execute on function apply_route_schedule() to service_role;
