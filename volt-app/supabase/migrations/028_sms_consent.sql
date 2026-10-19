-- 028 — Text-message (SMS) opt-in, required for 10DLC carrier approval.
--   • reservations.sms_consent: the rider ticked the optional "text me about
--     this booking" box online, or told staff yes over the phone/in person.
--     Texting is never a condition of booking, so it defaults to false.
--   • Customer texts (confirmations, changes, reminders) are only sent when it
--     is true — enforced in the app's message queue and, for reminders, here.
--   • Existing reservations stay false: they were booked under the old implied
--     ("by giving your number…") wording, which carriers don't accept.

alter table public.reservations
  add column if not exists sms_consent boolean not null default false,
  add column if not exists sms_consent_at timestamptz,
  add column if not exists sms_consent_source text
    check (sms_consent_source in ('online', 'verbal'));

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
    select r.id as rid, r.confirmation_number, r.created_at, r.sms_consent, c.phone, c.email, c.first_name,
           'outbound'::text as leg, r.trip_id as tid
    from reservations r join customers c on c.id = r.customer_id
    where r.status = 'confirmed'
    union all
    select r.id, r.confirmation_number, r.created_at, r.sms_consent, c.phone, c.email, c.first_name,
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
    where p_sms and d.sms_consent and coalesce(d.phone, '') <> ''
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
