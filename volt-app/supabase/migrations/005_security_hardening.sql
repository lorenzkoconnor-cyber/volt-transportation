-- ═══════════════════════════════════════════════════════════════════════════════
-- Volt Transportation — Pre-Launch Security Hardening
-- Applied to production 2026-07-22 (Supabase migration: security_hardening_pre_launch)
-- ═══════════════════════════════════════════════════════════════════════════════

-- 1. Recreate reservation_details as SECURITY INVOKER so RLS applies to the
--    querying user (it joins customer PII; employees still read it via their
--    employee_read policies, but anon/customers no longer bypass RLS through it).
drop view if exists reservation_details;
create view reservation_details
with (security_invoker = true) as
select
  r.id,
  r.confirmation_number,
  r.status,
  c.first_name  as customer_first_name,
  c.last_name   as customer_last_name,
  c.email       as customer_email,
  c.phone       as customer_phone,
  t.departure_date  as trip_date,
  t.departure_time  as trip_time,
  ro.name       as route_name,
  ro.origin_label,
  ro.destination_label,
  r.adults,
  r.children,
  r.pets,
  r.extra_bags,
  r.total_cents,
  p.status      as payment_status,
  r.is_round_trip,
  r.created_at
from reservations r
join customers c on c.id = r.customer_id
join trips t on t.id = r.trip_id
join routes ro on ro.id = t.route_id
left join payments p on p.reservation_id = r.id;

-- 2. Pin search_path on all functions (prevents search_path injection).
alter function set_updated_at()                         set search_path = public, pg_temp;
alter function get_trip_availability(uuid, date)        set search_path = public, pg_temp;
alter function get_employee_role()                      set search_path = public, pg_temp;
alter function is_employee()                            set search_path = public, pg_temp;
alter function is_employee_with_roles(text[])           set search_path = public, pg_temp;
alter function increment_seats_booked(uuid, integer)    set search_path = public, pg_temp;
alter function decrement_seats_booked(uuid, integer)    set search_path = public, pg_temp;
alter function generate_future_trips()                  set search_path = public, pg_temp;

-- 3. Seat mutation + trip generation must never be callable directly by the
--    public. Guest bookings go through the service-role API route (which
--    bypasses these grants), and employees act through the same routes or the
--    authenticated dashboard. Revoke direct anon access to close the griefing
--    vector where anyone could inflate/deflate seat counts via the REST API.
revoke execute on function increment_seats_booked(uuid, integer) from anon;
revoke execute on function decrement_seats_booked(uuid, integer) from anon;
revoke execute on function generate_future_trips()               from anon;
