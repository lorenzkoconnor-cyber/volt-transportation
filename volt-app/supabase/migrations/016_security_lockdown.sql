-- 016: Security lockdown (2026-10-02)
--
-- Closes holes reachable with the PUBLIC anon key that ships in the website:
--   1. Seat counters callable by anyone (fill every trip / overbook vans).
--   2. Trip generator callable by any signed-in customer.
--   3. "Anyone may insert" policies on payments, reservations, passengers,
--      notifications and audit_logs (fake payments / bookings / audit entries).
--      All legitimate writes go through server routes using the service role,
--      which bypasses RLS, or through staff (who keep their own policies).
--   4. Customers could update their own row freely — including
--      military_status = 'approved' (self-granted Military Discount).
--   5. Anonymous inserts into customers with any user_id.

-- ─── 1. Seat counters: staff + server only, positive counts only ─────────────
create or replace function public.increment_seats_booked(p_trip_id uuid, p_count integer)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.role() in ('anon', 'authenticated') and not public.is_employee() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if p_count is null or p_count <= 0 then
    raise exception 'Seat count must be positive';
  end if;

  update trips
  set seats_booked = seats_booked + p_count
  where id = p_trip_id
    and (seats_booked + p_count) <= total_capacity;

  if not found then
    raise exception 'Trip % is full or does not exist', p_trip_id;
  end if;
end;
$$;

create or replace function public.decrement_seats_booked(p_trip_id uuid, p_count integer)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.role() in ('anon', 'authenticated') and not public.is_employee() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if p_count is null or p_count <= 0 then
    raise exception 'Seat count must be positive';
  end if;

  update trips
  set seats_booked = greatest(0, seats_booked - p_count)
  where id = p_trip_id;
end;
$$;

revoke execute on function public.increment_seats_booked(uuid, integer) from public, anon;
revoke execute on function public.decrement_seats_booked(uuid, integer) from public, anon;
grant  execute on function public.increment_seats_booked(uuid, integer) to authenticated, service_role;
grant  execute on function public.decrement_seats_booked(uuid, integer) to authenticated, service_role;

-- ─── 2. Trip generation / internal helpers: server + cron only ───────────────
revoke execute on function public.generate_trips_for_range(date, date) from public, anon, authenticated;
revoke execute on function public.generate_future_trips() from public, anon, authenticated;
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
grant  execute on function public.generate_trips_for_range(date, date) to service_role;
grant  execute on function public.generate_future_trips() to service_role;

-- ─── 3. Remove "anyone may insert" policies ──────────────────────────────────
drop policy if exists payments_system_insert      on public.payments;
drop policy if exists reservations_insert_anon    on public.reservations;
drop policy if exists passengers_anon_insert      on public.reservation_passengers;
drop policy if exists notifications_system_insert on public.notifications;
drop policy if exists audit_system_insert         on public.audit_logs;

-- Office staff record payments in the take-payment flow (owner/manager are
-- already covered by payments_admin_all).
drop policy if exists payments_staff_insert on public.payments;
create policy payments_staff_insert on public.payments
  for insert with check (public.is_employee_with_roles(array['owner', 'manager', 'office_staff']));

-- ─── 4. Customers can't grant themselves the Military Discount ───────────────
-- Riders may edit their name/phone. Verification, Stripe and identity fields
-- are only changed by staff or by server routes (service role).
create or replace function public.protect_customer_fields()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.role() is null or auth.role() = 'service_role' or public.is_employee() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.is_military            := false;
    new.military_status        := 'none';
    new.military_category      := null;
    new.military_id_path       := null;
    new.military_submitted_at  := null;
    new.military_reviewed_at   := null;
    new.military_reviewed_by   := null;
    new.stripe_customer_id     := null;
  else
    new.user_id                := old.user_id;
    new.email                  := old.email;
    new.is_military            := old.is_military;
    new.military_status        := old.military_status;
    new.military_category      := old.military_category;
    new.military_id_path       := old.military_id_path;
    new.military_submitted_at  := old.military_submitted_at;
    new.military_reviewed_at   := old.military_reviewed_at;
    new.military_reviewed_by   := old.military_reviewed_by;
    new.stripe_customer_id     := old.stripe_customer_id;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_customer_fields on public.customers;
create trigger protect_customer_fields
  before insert or update on public.customers
  for each row execute function public.protect_customer_fields();

-- ─── 5. Who may create a customer row from the browser ───────────────────────
-- Sign-up inserts the profile row right after auth.signUp, possibly before the
-- email is confirmed (no session yet → anon). Allow that only for a brand-new
-- auth user that has no profile yet; signed-in users only for themselves.
create or replace function public.can_create_customer_profile(p_user_id uuid)
returns boolean language sql stable security definer set search_path = public, auth as $$
  select p_user_id is not null
    and not exists (select 1 from public.customers where user_id = p_user_id)
    and (
      p_user_id = auth.uid()
      or (auth.uid() is null and exists (
        select 1 from auth.users
        where id = p_user_id and created_at > now() - interval '1 hour'
      ))
    );
$$;
revoke execute on function public.can_create_customer_profile(uuid) from public;
grant  execute on function public.can_create_customer_profile(uuid) to anon, authenticated, service_role;

drop policy if exists customers_insert_anon on public.customers;
create policy customers_insert_self on public.customers
  for insert with check (public.can_create_customer_profile(user_id));
create policy customers_staff_insert on public.customers
  for insert with check (public.is_employee_with_roles(array['owner', 'manager', 'office_staff']));

-- Trigger function only — not callable over the API.
revoke execute on function public.protect_customer_fields() from public, anon, authenticated;
