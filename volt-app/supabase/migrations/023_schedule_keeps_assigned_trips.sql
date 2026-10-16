-- Editing the daily schedule must never delete a departure that already has a
-- van/driver assigned (trip_vehicles would cascade away). Same as 022, plus
-- that check.
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
    using routes r
    where r.id = t.route_id
      and (t.departure_date + t.departure_time) > v_now
      and t.status = 'scheduled'
      and t.seats_booked = 0
      and (
        t.departure_time < r.first_departure_time
        or t.departure_time > r.last_departure_time
        or mod((extract(epoch from (t.departure_time - r.first_departure_time)) / 60)::int,
               r.departure_interval_minutes) <> 0
      )
      and not exists (select 1 from reservations x where x.trip_id = t.id or x.return_trip_id = t.id)
      and not exists (select 1 from reservation_flights f where f.trip_id = t.id)
      and not exists (select 1 from trip_vehicles v where v.trip_id = t.id)
    returning 1
  )
  select count(*) into v_removed from gone;

  select count(*) into v_before from trips where departure_date >= current_date;
  perform generate_trips_for_range(
    current_date,
    greatest(current_date + 365, coalesce((select max(departure_date) from trips), current_date))
  );
  select count(*) into v_after from trips where departure_date >= current_date;

  select count(*) into v_kept
  from trips t join routes r on r.id = t.route_id
  where (t.departure_date + t.departure_time) > v_now
    and t.status <> 'cancelled'
    and (
      t.departure_time < r.first_departure_time
      or t.departure_time > r.last_departure_time
      or mod((extract(epoch from (t.departure_time - r.first_departure_time)) / 60)::int,
             r.departure_interval_minutes) <> 0
    );

  return query select v_removed, v_after - v_before, v_kept;
end;
$$;
revoke execute on function apply_route_schedule() from public, anon, authenticated;
grant  execute on function apply_route_schedule() to service_role;
