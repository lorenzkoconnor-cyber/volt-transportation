-- ═══════════════════════════════════════════════════════════════════════════════
-- Volt Transportation — Helper Functions
-- ═══════════════════════════════════════════════════════════════════════════════

-- Safely increment seats_booked on a trip (prevents race conditions)
create or replace function increment_seats_booked(p_trip_id uuid, p_count integer)
returns void as $$
begin
  update trips
  set seats_booked = seats_booked + p_count
  where id = p_trip_id
    and (seats_booked + p_count) <= total_capacity;

  if not found then
    raise exception 'Trip % is full or does not exist', p_trip_id;
  end if;
end;
$$ language plpgsql security definer;

-- Safely decrement seats_booked (for cancellations)
create or replace function decrement_seats_booked(p_trip_id uuid, p_count integer)
returns void as $$
begin
  update trips
  set seats_booked = greatest(0, seats_booked - p_count)
  where id = p_trip_id;
end;
$$ language plpgsql security definer;

-- Auto-generate trip slots 90 days out (run via pg_cron daily)
create or replace function generate_future_trips()
returns void as $$
declare
  route_rec record;
  target_date date;
  h integer;
begin
  for route_rec in select id from routes where is_active = true loop
    -- Generate 1 day ahead (called daily by cron)
    target_date := current_date + interval '90 days';
    for h in 0..23 loop
      insert into trips (route_id, departure_date, departure_time, total_capacity, seats_booked, status)
      values (
        route_rec.id,
        target_date,
        make_time(h, 0, 0),
        8,
        0,
        'scheduled'
      )
      on conflict do nothing;
    end loop;
  end loop;
end;
$$ language plpgsql security definer;

-- Schedule trip generation to run daily (requires pg_cron extension)
-- Uncomment after enabling pg_cron in Supabase Dashboard → Database → Extensions
-- select cron.schedule('generate-trips-daily', '0 0 * * *', 'select generate_future_trips()');
