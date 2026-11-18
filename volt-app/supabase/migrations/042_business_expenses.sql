-- 042: Business expenses for the Reports → Profit Calculator
--   • One row (id = 1) holding the owner's saved ("permanent") cost figures as
--     JSON: monthly fixed costs, fuel per van trip, card-processing rate, and
--     any custom monthly line items. The calculator reads it as the defaults;
--     what-if edits on the page are never written here unless saved.
--   • Kept out of booking_settings on purpose — that table is read by the
--     public booking site; company costs are owner/manager only.

create table if not exists public.business_expenses (
  id               integer primary key default 1 check (id = 1),
  costs            jsonb not null default '{}'::jsonb,
  updated_by       uuid references public.employees(id) on delete set null,
  updated_by_name  text,
  updated_at       timestamptz not null default now()
);

alter table public.business_expenses enable row level security;

drop policy if exists business_expenses_admin_read on public.business_expenses;
create policy business_expenses_admin_read on public.business_expenses
  for select using (is_employee_with_roles(array['owner', 'manager']));

drop policy if exists business_expenses_admin_insert on public.business_expenses;
create policy business_expenses_admin_insert on public.business_expenses
  for insert with check (is_employee_with_roles(array['owner', 'manager']));

drop policy if exists business_expenses_admin_update on public.business_expenses;
create policy business_expenses_admin_update on public.business_expenses
  for update using (is_employee_with_roles(array['owner', 'manager']))
  with check (is_employee_with_roles(array['owner', 'manager']));

insert into public.business_expenses (id) values (1) on conflict (id) do nothing;
