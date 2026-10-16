-- ═══════════════════════════════════════════════════════════════════════════════
-- Settings expansion — everything owners/managers can change in Dashboard → Settings
-- ═══════════════════════════════════════════════════════════════════════════════
-- All saves go through /api/settings (server-validated, logged in settings_changes).

-- ── booking_settings: prices, business info, timing, discounts ──────────────────
alter table public.booking_settings
  add column if not exists price_adult_cents      integer not null default 5900 check (price_adult_cents between 0 and 100000),
  add column if not exists price_child_cents      integer not null default 4900 check (price_child_cents between 0 and 100000),
  add column if not exists price_pet_cents        integer not null default 2500 check (price_pet_cents between 0 and 100000),
  add column if not exists price_extra_bag_cents  integer not null default 1000 check (price_extra_bag_cents between 0 and 100000),
  add column if not exists default_van_capacity   integer not null default 8    check (default_van_capacity between 1 and 60),
  add column if not exists arrive_early_minutes   integer not null default 20   check (arrive_early_minutes between 0 and 120),
  add column if not exists reminder_first_enabled boolean not null default true,
  add column if not exists reminder_first_hours   integer not null default 24   check (reminder_first_hours between 2 and 72),
  add column if not exists reminder_second_enabled boolean not null default true,
  add column if not exists reminder_second_hours  integer not null default 2    check (reminder_second_hours between 1 and 24),
  add column if not exists staff_edit_cutoff_hours  integer not null default 24 check (staff_edit_cutoff_hours between 0 and 168),
  add column if not exists return_edit_cutoff_hours integer not null default 2  check (return_edit_cutoff_hours between 0 and 48),
  add column if not exists military_discount_enabled boolean not null default true,
  add column if not exists military_discount_percent integer not null default 10 check (military_discount_percent between 1 and 50),
  add column if not exists discount_code_valid_days  integer not null default 3  check (discount_code_valid_days between 1 and 365),
  add column if not exists business_phone      text not null default '(706) 530-5896',
  add column if not exists business_email      text not null default 'support@contactvolt.com',
  add column if not exists business_street     text not null default '3885 Miller Road, Suite C',
  add column if not exists business_city_line  text not null default 'Columbus, GA 31909',
  add column if not exists business_hours      text not null default 'Daily · 4:00 AM – 12:00 AM';

-- ── Price snapshot: what a booking was priced at (receipts, edits, holds) ──────
alter table public.reservations      add column if not exists pricing_snapshot jsonb;
alter table public.booking_checkouts add column if not exists pricing_snapshot jsonb;

-- ── New trips use the default van size ──────────────────────────────────────────
create or replace function generate_trips_for_range(p_start date, p_end date)
returns void as $$
declare
  v_capacity integer := coalesce((select default_van_capacity from booking_settings limit 1), 8);
begin
  insert into trips (route_id, departure_date, departure_time, total_capacity, seats_booked, status)
  select r.id, d::date, s::time, v_capacity, 0, 'scheduled'
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
revoke execute on function generate_trips_for_range(date, date) from public, anon, authenticated;

-- ── Apply an edited daily schedule ─────────────────────────────────────────────
-- Removes upcoming EMPTY trips that are no longer on a route's schedule (never
-- one a booking, flight or blackout points at), then fills in every new slot.
-- Returns how many were removed/added and how many off-schedule trips were kept
-- because riders are on them.
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

-- ── Blackout dates / service pauses ────────────────────────────────────────────
create table if not exists public.service_blackouts (
  id            uuid primary key default gen_random_uuid(),
  starts_at     timestamptz not null,
  ends_at       timestamptz not null,
  direction     text not null default 'both' check (direction in ('both', 'to_atl', 'from_atl')),
  reason        text not null,
  cancel_bookings boolean not null default false,
  created_by    uuid references public.employees(id) on delete set null,
  created_by_name text,
  created_at    timestamptz not null default now(),
  removed_at    timestamptz,
  removed_by_name text,
  affected      jsonb,
  check (ends_at > starts_at)
);
alter table public.service_blackouts enable row level security;
drop policy if exists service_blackouts_staff_read on public.service_blackouts;
create policy service_blackouts_staff_read on public.service_blackouts
  for select to authenticated using (is_employee());

alter table public.trips add column if not exists blackout_id uuid references public.service_blackouts(id) on delete set null;

-- ── Website announcement banner ────────────────────────────────────────────────
create table if not exists public.site_announcements (
  id          uuid primary key default gen_random_uuid(),
  message     text not null check (char_length(message) between 1 and 300),
  link_url    text,
  link_label  text,
  starts_at   timestamptz not null default now(),
  ends_at     timestamptz,
  is_active   boolean not null default true,
  created_by_name text,
  created_at  timestamptz not null default now()
);
alter table public.site_announcements enable row level security;
drop policy if exists site_announcements_staff_read on public.site_announcements;
create policy site_announcements_staff_read on public.site_announcements
  for select to authenticated using (is_employee());
-- The public site reads the live banner through the server (service role).

-- ── Editable message wording ───────────────────────────────────────────────────
create table if not exists public.message_templates (
  key            text primary key check (key in ('confirmation', 'reminder_first', 'reminder_second', 'updated', 'cancelled', 'receipt')),
  sms_body       text,
  email_subject  text,
  email_body     text,
  updated_at     timestamptz not null default now(),
  updated_by_name text
);
alter table public.message_templates enable row level security;
drop policy if exists message_templates_staff_read on public.message_templates;
create policy message_templates_staff_read on public.message_templates
  for select to authenticated using (is_employee_with_roles(array['owner', 'manager']));

-- ── Settings change history ────────────────────────────────────────────────────
create table if not exists public.settings_changes (
  id            uuid primary key default gen_random_uuid(),
  employee_id   uuid references public.employees(id) on delete set null,
  employee_name text,
  area          text not null,
  summary       text[] not null,
  created_at    timestamptz not null default now()
);
alter table public.settings_changes enable row level security;
drop policy if exists settings_changes_read on public.settings_changes;
create policy settings_changes_read on public.settings_changes
  for select to authenticated using (is_employee_with_roles(array['owner', 'manager']));
create index if not exists idx_settings_changes_created on public.settings_changes(created_at desc);

-- ── Background worker heartbeat ────────────────────────────────────────────────
create table if not exists public.system_status (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.system_status enable row level security;
drop policy if exists system_status_staff_read on public.system_status;
create policy system_status_staff_read on public.system_status
  for select to authenticated using (is_employee_with_roles(array['owner', 'manager']));

-- What Supabase got back the last few times it called the worker (e.g. 401 =
-- CRON_SECRET mismatch on Hostinger). Service role only.
create or replace function worker_call_history()
returns table (called_at timestamptz, status_code integer, error text)
language sql security definer set search_path = public, net, pg_temp
as $$
  select r.created, r.status_code, r.error_msg
  from net._http_response r
  order by r.created desc
  limit 5;
$$;
revoke execute on function worker_call_history() from public, anon, authenticated;
grant  execute on function worker_call_history() to service_role;

-- ── New staff alert: service pause affected booked riders ──────────────────────
alter table public.staff_alert_subscriptions drop constraint if exists staff_alert_subscriptions_alert_type_check;
alter table public.staff_alert_subscriptions add constraint staff_alert_subscriptions_alert_type_check
  check (alert_type in (
    'short_notice_booking', 'online_cancellation', 'hold_expiring',
    'payment_without_reservation', 'van_capacity', 'message_failed', 'service_pause'
  ));
insert into public.staff_alert_subscriptions (employee_id, alert_type)
select e.id, 'service_pause' from public.employees e
where e.role = 'owner' and e.is_active
on conflict do nothing;

-- ── Reminders follow the settings ──────────────────────────────────────────────
-- kind names stay 'reminder_24h:' (first) / 'reminder_2h:' (second) so reminders
-- already sent are still recognised.
create or replace function public.due_trip_reminders()
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
  destination_label   text
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
    select r.id as rid, r.confirmation_number, r.created_at, c.phone, c.first_name,
           'outbound'::text as leg, r.trip_id as tid
    from reservations r join customers c on c.id = r.customer_id
    where r.status = 'confirmed'
    union all
    select r.id, r.confirmation_number, r.created_at, c.phone, c.first_name,
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
      and coalesce(l.phone, '') <> ''
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
  )
  select d.rid, d.k, d.leg, d.tid, d.phone, d.first_name, d.confirmation_number,
         d.departure_date, d.departure_time, d.origin_label, d.destination_label
  from due d
  where not exists (
    select 1 from notifications n where n.reservation_id = d.rid and n.kind = d.k
  );
$$;
revoke execute on function public.due_trip_reminders() from public, anon, authenticated;
grant  execute on function public.due_trip_reminders() to service_role;
