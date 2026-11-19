-- 043: Employee schedules + hours worked (Team Portal → Schedule)
--   • employee_shifts: one row per shift. kind = 'scheduled' (planned ahead)
--     or 'worked' (actual times, entered by an owner/manager). Times are
--     Eastern wall-clock on shift_date; an end time at or before the start
--     time means the shift ran past midnight (Volt runs 24/7). Hours count
--     toward the Mon–Sun week of shift_date.
--   • employee_pay_rates: hourly rate per employee, for estimated pay
--     (1.5× over 40 worked hours a week). Owner/manager only — kept off the
--     employees table so staff can't read each other's pay.
--   • Owners/managers manage everything; every employee can read their own
--     shifts (My Schedule).

create table if not exists public.employee_shifts (
  id               uuid primary key default gen_random_uuid(),
  employee_id      uuid not null references public.employees(id) on delete cascade,
  kind             text not null check (kind in ('scheduled', 'worked')),
  shift_date       date not null,
  start_time       time not null,
  end_time         time not null,
  break_minutes    integer not null default 0 check (break_minutes >= 0 and break_minutes < 1440),
  notes            text,
  created_by       uuid references public.employees(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists idx_employee_shifts_date on public.employee_shifts(shift_date);
create index if not exists idx_employee_shifts_employee on public.employee_shifts(employee_id, shift_date);

drop trigger if exists set_employee_shifts_updated_at on public.employee_shifts;
create trigger set_employee_shifts_updated_at before update on public.employee_shifts
  for each row execute function set_updated_at();

alter table public.employee_shifts enable row level security;

drop policy if exists employee_shifts_admin_all on public.employee_shifts;
create policy employee_shifts_admin_all on public.employee_shifts
  for all using (is_employee_with_roles(array['owner', 'manager']))
  with check (is_employee_with_roles(array['owner', 'manager']));

drop policy if exists employee_shifts_read_own on public.employee_shifts;
create policy employee_shifts_read_own on public.employee_shifts
  for select using (
    employee_id in (select e.id from public.employees e where e.user_id = auth.uid() and e.is_active)
  );

create table if not exists public.employee_pay_rates (
  employee_id        uuid primary key references public.employees(id) on delete cascade,
  hourly_rate_cents  integer not null check (hourly_rate_cents >= 0),
  updated_by         uuid references public.employees(id) on delete set null,
  updated_at         timestamptz not null default now()
);

alter table public.employee_pay_rates enable row level security;

drop policy if exists employee_pay_rates_admin_all on public.employee_pay_rates;
create policy employee_pay_rates_admin_all on public.employee_pay_rates
  for all using (is_employee_with_roles(array['owner', 'manager']))
  with check (is_employee_with_roles(array['owner', 'manager']));
