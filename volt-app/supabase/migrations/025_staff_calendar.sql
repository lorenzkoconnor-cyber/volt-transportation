-- 025 — Staff calendar.
--
--   • calendar_events: things owners/managers put on the team calendar
--     ("Clean the lobby", "Clean Van #2", meetings…). Bookings are NOT stored
--     here — the calendar reads them live from trips.
--   • Every active employee can read; only owners/managers can add, change
--     or delete (enforced by RLS, not just the UI).
--   • Repeating events are separate rows sharing a series_id, so one day can
--     be changed or deleted without touching the rest.
--   • calendar_events, trips and trip_vehicles are added to the realtime
--     publication so open calendars refresh when anything changes.

create table if not exists calendar_events (
  id              uuid primary key default uuid_generate_v4(),
  title           text not null check (char_length(title) between 1 and 120),
  notes           text check (notes is null or char_length(notes) <= 1000),
  category        text not null default 'task'
                    check (category in ('cleaning', 'maintenance', 'meeting', 'task', 'other')),
  event_date      date not null,
  start_time      time,            -- null = all day
  end_time        time,
  series_id       uuid,
  created_by      uuid default auth.uid() references auth.users(id) on delete set null,
  created_by_name text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (end_time is null or (start_time is not null and end_time > start_time))
);

create index if not exists idx_calendar_events_date on calendar_events(event_date);
create index if not exists idx_calendar_events_series on calendar_events(series_id) where series_id is not null;

create trigger set_calendar_events_updated_at before update on calendar_events
  for each row execute function set_updated_at();

alter table calendar_events enable row level security;

create policy "calendar_events_employee_read" on calendar_events
  for select to authenticated using (is_employee());

create policy "calendar_events_admin_insert" on calendar_events
  for insert to authenticated with check (is_employee_with_roles(array['owner', 'manager']));

create policy "calendar_events_admin_update" on calendar_events
  for update to authenticated
  using (is_employee_with_roles(array['owner', 'manager']))
  with check (is_employee_with_roles(array['owner', 'manager']));

create policy "calendar_events_admin_delete" on calendar_events
  for delete to authenticated using (is_employee_with_roles(array['owner', 'manager']));

revoke all on calendar_events from anon;

do $$
declare t text;
begin
  foreach t in array array['calendar_events', 'trips', 'trip_vehicles'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
