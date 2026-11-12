-- 038 — Departures move through their statuses on their own (owner, 2026-11-12):
--   • 30 minutes before departure      scheduled            → boarding
--   • at the departure time            scheduled / boarding → in_progress ("Departed")
--   • at drop-off (departure + route   scheduled / boarding / in_progress → completed
--     time, routes.duration_minutes)
-- Drivers can still tap "Mark Trip Departed" / "Mark Trip Completed" early on
-- the Boarding List; this only catches up trips nobody moved. Cancelled trips
-- are never touched. Completing a trip fires trips_complete_reservations
-- (migration 037), which only completes bookings with a rider tapped Boarded
-- — untapped bookings stay "Booked" for staff to sort out (owner's choice).
--
-- Runs every minute from pg_cron, in Eastern time like everything else. Only
-- looks at departures from the last 2 days, so old history isn't rewritten.

create or replace function advance_trip_statuses()
returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_now      timestamptz := now();
  v_boarding integer;
  v_departed integer;
  v_done     integer;
begin
  -- Drop-off time reached → completed.
  update trips t
     set status = 'completed'
    from routes ro
   where ro.id = t.route_id
     and t.status in ('scheduled', 'boarding', 'in_progress')
     and t.departure_date between (v_now at time zone 'America/New_York')::date - 2
                              and (v_now at time zone 'America/New_York')::date
     and ((t.departure_date + t.departure_time) at time zone 'America/New_York')
         + make_interval(mins => coalesce(ro.duration_minutes, 120)) <= v_now;
  get diagnostics v_done = row_count;

  -- Departure time reached → in progress ("Departed").
  update trips t
     set status = 'in_progress'
   where t.status in ('scheduled', 'boarding')
     and t.departure_date between (v_now at time zone 'America/New_York')::date - 2
                              and (v_now at time zone 'America/New_York')::date
     and ((t.departure_date + t.departure_time) at time zone 'America/New_York') <= v_now;
  get diagnostics v_departed = row_count;

  -- 30 minutes before departure → boarding.
  update trips t
     set status = 'boarding'
   where t.status = 'scheduled'
     and t.departure_date between (v_now at time zone 'America/New_York')::date - 1
                              and (v_now at time zone 'America/New_York')::date + 1
     and ((t.departure_date + t.departure_time) at time zone 'America/New_York')
         <= v_now + interval '30 minutes';
  get diagnostics v_boarding = row_count;

  return jsonb_build_object('boarding', v_boarding, 'departed', v_departed, 'completed', v_done);
end;
$$;

revoke all on function advance_trip_statuses() from public, anon, authenticated;

select cron.unschedule(jobid) from cron.job where jobname = 'advance-trip-statuses';
select cron.schedule('advance-trip-statuses', '* * * * *', 'select public.advance_trip_statuses()');

-- ── Thank-you message (tip + review), email AND text ─────────────────────────
-- Same timing as due_review_requests() (migration 030): 2 hours after the
-- first leg's drop-off, legs from the last 7 days, someone in the party not a
-- no-show, no review yet. Each channel goes once per booking:
--   email_due — a real email address and no 'review_request' email yet;
--   sms_due   — the rider agreed to texts (reservations.sms_consent, 028),
--               a phone on file and no 'review_request_sms' text yet (and
--               not emailed over an hour ago — no catch-up texts at launch).
-- A new name so the app can fall back to due_review_requests() until this runs.
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
  arrived as (
    select distinct l.rid
    from legs l
    join trips t on t.id = l.tid
    join routes ro on ro.id = t.route_id
    where t.status <> 'cancelled'
      and ((t.departure_date + t.departure_time) at time zone 'America/New_York')
          + make_interval(mins => coalesce(ro.duration_minutes, 120) + p_delay_minutes)
          between now() - interval '7 days' and now()
      and exists (
        select 1 from reservation_passengers p
        where p.reservation_id = l.rid
          and not (case when l.is_return then p.return_is_no_show else p.is_no_show end)
      )
  ),
  candidates as (
    select r.id, c.email, c.phone, c.first_name, r.confirmation_number, r.review_token,
      coalesce(c.email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' and c.email !~* '@(guest|walkin)\.volt$'
        and not exists (select 1 from notifications n where n.reservation_id = r.id and n.kind = 'review_request'), false) as email_due,
      coalesce(r.sms_consent and coalesce(c.phone, '') <> ''
        and not exists (select 1 from notifications n where n.reservation_id = r.id and n.kind = 'review_request_sms')
        -- No catch-up texts to riders already emailed before texts started.
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
