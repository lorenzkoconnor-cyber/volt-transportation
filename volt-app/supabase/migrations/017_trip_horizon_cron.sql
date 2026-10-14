-- Keep every day bookable a full year out.
-- Trips only exist once generated, and the daily cron from 004 was never
-- enabled, so the horizon stopped moving and dates past it showed
-- "no scheduled departures".

create extension if not exists pg_cron;

create or replace function generate_future_trips()
returns void as $$
begin
  perform generate_trips_for_range(current_date, current_date + 365);
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

revoke execute on function public.generate_future_trips() from public, anon, authenticated;
grant  execute on function public.generate_future_trips() to service_role;

-- Fill the gap now.
select generate_future_trips();

-- Roll the horizon forward daily (05:00 UTC ≈ midnight Eastern).
select cron.unschedule(jobid) from cron.job where jobname = 'generate-trips-daily';
select cron.schedule('generate-trips-daily', '0 5 * * *', 'select public.generate_future_trips()');
