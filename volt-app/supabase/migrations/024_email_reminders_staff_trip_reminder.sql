-- 024 — Trip reminders by email too, and a staff trip reminder alert.
--
--   • due_trip_reminders(p_sms, p_email) returns one row per reminder per
--     channel. Text reminders keep kind 'reminder_24h:<trip>' / 'reminder_2h:<trip>';
--     email reminders use the same kind + ':email', so the one-per-leg unique
--     index (kind like 'reminder_%') covers both. Calling it with no arguments
--     behaves exactly as before (texts only).
--   • New staff alert 'trip_reminder': subscribed staff get a heads-up before
--     each departure that has riders. Owners start subscribed by email only.

drop function if exists public.due_trip_reminders();

create or replace function public.due_trip_reminders(p_sms boolean default true, p_email boolean default false)
returns table (
  reservation_id      uuid,
  kind                text,
  leg                 text,
  trip_id             uuid,
  phone               text,
  first_name          text,
  confirmation_number text,
  departure_date      date,
  departure_time      time,
  origin_label        text,
  destination_label   text,
  channel             text,
  email               text
)
language sql stable security definer set search_path = public, pg_temp
as $$
  with s as (
    select coalesce(reminder_first_enabled, true)  as first_on,
           make_interval(hours => coalesce(reminder_first_hours, 24))  as first_h,
           coalesce(reminder_second_enabled, true) as second_on,
           make_interval(hours => coalesce(reminder_second_hours, 2))  as second_h
    from booking_settings limit 1
  ),
  legs as (
    select r.id as rid, r.confirmation_number, r.created_at, c.phone, c.email, c.first_name,
           'outbound'::text as leg, r.trip_id as tid
    from reservations r join customers c on c.id = r.customer_id
    where r.status = 'confirmed'
    union all
    select r.id, r.confirmation_number, r.created_at, c.phone, c.email, c.first_name,
           'return', r.return_trip_id
    from reservations r join customers c on c.id = r.customer_id
    where r.status = 'confirmed' and r.is_round_trip and r.return_trip_id is not null
  ),
  timed as (
    select l.*, t.departure_date, t.departure_time, ro.origin_label, ro.destination_label,
           ((t.departure_date + t.departure_time) at time zone 'America/New_York') as departs_at
    from legs l
    join trips t on t.id = l.tid
    join routes ro on ro.id = t.route_id
    where t.status in ('scheduled', 'boarding')
      and t.departure_date between current_date - 1 and current_date + 4
  ),
  due as (
    select timed.*, 'reminder_24h:' || tid as k from timed, s
    where s.first_on
      and departs_at - now() <= s.first_h
      and departs_at - now() > (case when s.second_on then s.second_h + interval '15 minutes' else interval '20 minutes' end)
      and departs_at - created_at > s.first_h
    union all
    select timed.*, 'reminder_2h:' || tid from timed, s
    where s.second_on
      and departs_at - now() <= s.second_h
      and departs_at - now() > interval '20 minutes'
      and departs_at - created_at > s.second_h
  ),
  by_channel as (
    select d.*, 'sms'::text as ch, d.k as ck from due d
    where p_sms and coalesce(d.phone, '') <> ''
    union all
    select d.*, 'email', d.k || ':email' from due d
    where p_email
      and d.email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'
      and d.email !~* '@(guest|walkin)\.volt$'
  )
  select b.rid, b.ck, b.leg, b.tid, b.phone, b.first_name, b.confirmation_number,
         b.departure_date, b.departure_time, b.origin_label, b.destination_label, b.ch, b.email
  from by_channel b
  where not exists (
    select 1 from notifications n where n.reservation_id = b.rid and n.kind = b.ck
  );
$$;

revoke execute on function public.due_trip_reminders(boolean, boolean) from public, anon, authenticated;
grant  execute on function public.due_trip_reminders(boolean, boolean) to service_role;

-- ── Staff trip reminder alert ─────────────────────────────────────────────────
alter table public.staff_alert_subscriptions drop constraint if exists staff_alert_subscriptions_alert_type_check;
alter table public.staff_alert_subscriptions add constraint staff_alert_subscriptions_alert_type_check
  check (alert_type in (
    'short_notice_booking', 'online_cancellation', 'hold_expiring',
    'payment_without_reservation', 'van_capacity', 'message_failed', 'service_pause',
    'trip_reminder'
  ));
insert into public.staff_alert_subscriptions (employee_id, alert_type, via_sms, via_email)
select e.id, 'trip_reminder', false, true from public.employees e
where e.role = 'owner' and e.is_active
on conflict do nothing;
