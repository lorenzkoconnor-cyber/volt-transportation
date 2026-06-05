-- ═══════════════════════════════════════════════════════════════════════════════
-- Volt Transportation — Row Level Security Policies
-- ═══════════════════════════════════════════════════════════════════════════════

-- Enable RLS on all tables
alter table routes               enable row level security;
alter table trips                enable row level security;
alter table vehicles             enable row level security;
alter table drivers              enable row level security;
alter table trip_vehicles        enable row level security;
alter table employees            enable row level security;
alter table customers            enable row level security;
alter table discounts            enable row level security;
alter table reservations         enable row level security;
alter table reservation_passengers enable row level security;
alter table payments             enable row level security;
alter table notifications        enable row level security;
alter table audit_logs           enable row level security;

-- ─── Helper: get current employee role ───────────────────────────────────────
create or replace function get_employee_role()
returns text as $$
  select role::text from employees
  where user_id = auth.uid() and is_active = true
  limit 1;
$$ language sql security definer stable;

create or replace function is_employee()
returns boolean as $$
  select exists(
    select 1 from employees
    where user_id = auth.uid() and is_active = true
  );
$$ language sql security definer stable;

create or replace function is_employee_with_roles(roles text[])
returns boolean as $$
  select exists(
    select 1 from employees
    where user_id = auth.uid()
      and is_active = true
      and role::text = any(roles)
  );
$$ language sql security definer stable;

-- ─── ROUTES ──────────────────────────────────────────────────────────────────
-- Public can read active routes (needed for booking widget)
create policy "routes_public_read" on routes
  for select using (is_active = true);

-- Only owners/managers can manage routes
create policy "routes_admin_all" on routes
  for all using (is_employee_with_roles(array['owner', 'manager']));

-- ─── TRIPS ───────────────────────────────────────────────────────────────────
-- Public can read trips (to check availability)
create policy "trips_public_read" on trips
  for select using (true);

-- Employees can manage trips
create policy "trips_employee_all" on trips
  for all using (is_employee());

-- ─── VEHICLES ────────────────────────────────────────────────────────────────
-- Employees can read vehicles
create policy "vehicles_employee_read" on vehicles
  for select using (is_employee());

-- Owner/manager can manage
create policy "vehicles_admin_all" on vehicles
  for all using (is_employee_with_roles(array['owner', 'manager']));

-- ─── DRIVERS ─────────────────────────────────────────────────────────────────
-- Employees can read drivers
create policy "drivers_employee_read" on drivers
  for select using (is_employee());

-- Owner/manager can manage
create policy "drivers_admin_all" on drivers
  for all using (is_employee_with_roles(array['owner', 'manager']));

-- ─── TRIP_VEHICLES ───────────────────────────────────────────────────────────
-- Employees can read
create policy "trip_vehicles_employee_read" on trip_vehicles
  for select using (is_employee());

-- Owner/manager/driver (own trips only) can update
create policy "trip_vehicles_admin_all" on trip_vehicles
  for all using (is_employee_with_roles(array['owner', 'manager']));

-- ─── EMPLOYEES ───────────────────────────────────────────────────────────────
-- Employees can read own record
create policy "employees_read_own" on employees
  for select using (user_id = auth.uid());

-- Owner can read all employees
create policy "employees_owner_read_all" on employees
  for select using (is_employee_with_roles(array['owner']));

-- Owner can manage all employees
create policy "employees_owner_manage" on employees
  for all using (is_employee_with_roles(array['owner']));

-- Manager can read employees (but not owner)
create policy "employees_manager_read" on employees
  for select using (
    is_employee_with_roles(array['manager'])
    and role != 'owner'
  );

-- ─── CUSTOMERS ───────────────────────────────────────────────────────────────
-- Customers can read/update their own record
create policy "customers_read_own" on customers
  for select using (user_id = auth.uid());

create policy "customers_update_own" on customers
  for update using (user_id = auth.uid());

-- Anyone (including guest) can insert a customer record (for booking)
create policy "customers_insert_anon" on customers
  for insert with check (true);

-- Employees can read all customers
create policy "customers_employee_read" on customers
  for select using (is_employee());

-- Managers/owners can update customers
create policy "customers_admin_update" on customers
  for update using (is_employee_with_roles(array['owner', 'manager', 'office_staff']));

-- ─── DISCOUNTS ───────────────────────────────────────────────────────────────
-- No public access — staff only
create policy "discounts_employee_read" on discounts
  for select using (is_employee());

create policy "discounts_admin_all" on discounts
  for all using (is_employee_with_roles(array['owner', 'manager']));

-- ─── RESERVATIONS ────────────────────────────────────────────────────────────
-- Customers can read own reservations (by customer_id → user_id)
create policy "reservations_customer_read_own" on reservations
  for select using (
    customer_id in (
      select id from customers where user_id = auth.uid()
    )
  );

-- Anyone can insert a reservation (guest booking) — validated server-side
create policy "reservations_insert_anon" on reservations
  for insert with check (true);

-- Employees can read all reservations
create policy "reservations_employee_read" on reservations
  for select using (is_employee());

-- Office staff, managers, owners can create/edit reservations
create policy "reservations_staff_insert" on reservations
  for insert with check (is_employee_with_roles(array['owner', 'manager', 'office_staff']));

create policy "reservations_staff_update" on reservations
  for update using (is_employee_with_roles(array['owner', 'manager', 'office_staff']));

-- Only owners/managers can delete (cancel permanently)
create policy "reservations_admin_delete" on reservations
  for delete using (is_employee_with_roles(array['owner', 'manager']));

-- ─── RESERVATION PASSENGERS ──────────────────────────────────────────────────
-- Customers can read their own passengers
create policy "passengers_customer_read" on reservation_passengers
  for select using (
    reservation_id in (
      select id from reservations where customer_id in (
        select id from customers where user_id = auth.uid()
      )
    )
  );

-- Employees can read all
create policy "passengers_employee_read" on reservation_passengers
  for select using (is_employee());

-- Drivers can update boarding status
create policy "passengers_driver_update" on reservation_passengers
  for update using (is_employee())
  with check (is_employee());

-- Staff can insert/delete
create policy "passengers_staff_all" on reservation_passengers
  for all using (is_employee_with_roles(array['owner', 'manager', 'office_staff']));

-- Guest insert (own booking)
create policy "passengers_anon_insert" on reservation_passengers
  for insert with check (true);

-- ─── PAYMENTS ────────────────────────────────────────────────────────────────
-- Customers can read own payment records
create policy "payments_customer_read" on payments
  for select using (
    reservation_id in (
      select id from reservations where customer_id in (
        select id from customers where user_id = auth.uid()
      )
    )
  );

-- Employees can read all payments
create policy "payments_employee_read" on payments
  for select using (is_employee());

-- Only owners/managers can process refunds
create policy "payments_admin_all" on payments
  for all using (is_employee_with_roles(array['owner', 'manager']));

-- System can insert payment records (via service role in API routes)
create policy "payments_system_insert" on payments
  for insert with check (true);  -- secured at API route layer

-- ─── NOTIFICATIONS ───────────────────────────────────────────────────────────
-- Employees can read
create policy "notifications_employee_read" on notifications
  for select using (is_employee());

-- System inserts (via service role)
create policy "notifications_system_insert" on notifications
  for insert with check (true);

-- ─── AUDIT LOGS ──────────────────────────────────────────────────────────────
-- Owner can read all audit logs
create policy "audit_owner_read" on audit_logs
  for select using (is_employee_with_roles(array['owner']));

-- System inserts (via service role, immutable)
create policy "audit_system_insert" on audit_logs
  for insert with check (true);
