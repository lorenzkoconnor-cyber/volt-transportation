-- 037 — Reservations switch from "Booked" (status 'confirmed') to 'completed'
-- automatically once the rider has finished their last ride:
--   • one way:    the trip is marked completed and someone in the party
--                 was marked boarded on it;
--   • round trip: the RETURN trip is marked completed and someone in the
--                 party was marked boarded on the return leg.
-- Runs in the database (security definer) because drivers mark trips
-- completed and board riders from the manifest, but can't update
-- reservations themselves. It only ever moves 'confirmed' → 'completed';
-- staff can still change the status by hand afterwards.

create or replace function complete_finished_reservations(p_trip_id uuid)
returns integer
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_count integer;
begin
  if p_trip_id is null then return 0; end if;
  if not exists (select 1 from trips where id = p_trip_id and status = 'completed') then
    return 0;
  end if;

  update reservations r
     set status = 'completed'
   where r.status = 'confirmed'
     and r.deleted_at is null
     and (
       -- One way (or no return booked): this trip is the last ride.
       (r.trip_id = p_trip_id and r.return_trip_id is null
         and exists (select 1 from reservation_passengers p where p.reservation_id = r.id and p.is_boarded))
       or
       -- Round trip: this is the return ride.
       (r.return_trip_id = p_trip_id
         and exists (select 1 from reservation_passengers p where p.reservation_id = r.id and p.return_is_boarded))
     );
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function complete_finished_reservations(uuid) from public, anon, authenticated;

-- When a trip is marked completed.
create or replace function trips_complete_reservations()
returns trigger
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  perform complete_finished_reservations(new.id);
  return null;
end;
$$;

drop trigger if exists trips_complete_reservations on trips;
create trigger trips_complete_reservations
  after update of status on trips
  for each row
  when (new.status = 'completed' and old.status is distinct from 'completed')
  execute function trips_complete_reservations();

-- When a rider is marked boarded after their trip was already completed.
create or replace function passengers_complete_reservations()
returns trigger
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_trip uuid;
  v_return uuid;
begin
  select trip_id, return_trip_id into v_trip, v_return from reservations where id = new.reservation_id;
  if new.is_boarded and not old.is_boarded then
    perform complete_finished_reservations(v_trip);
  end if;
  if new.return_is_boarded and not old.return_is_boarded then
    perform complete_finished_reservations(v_return);
  end if;
  return null;
end;
$$;

drop trigger if exists passengers_complete_reservations on reservation_passengers;
create trigger passengers_complete_reservations
  after update of is_boarded, return_is_boarded on reservation_passengers
  for each row
  when ((new.is_boarded and not old.is_boarded) or (new.return_is_boarded and not old.return_is_boarded))
  execute function passengers_complete_reservations();
