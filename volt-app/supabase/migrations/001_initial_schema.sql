-- ═══════════════════════════════════════════════════════════════════════════════
-- Volt Transportation — Initial Database Schema
-- Run in: Supabase Dashboard → SQL Editor
-- ═══════════════════════════════════════════════════════════════════════════════

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ─── ENUM TYPES ──────────────────────────────────────────────────────────────

create type employee_role as enum ('owner', 'manager', 'office_staff', 'driver');
create type reservation_status as enum ('pending', 'confirmed', 'cancelled', 'no_show', 'completed');
create type payment_method as enum ('stripe', 'cash', 'comp');
create type payment_status as enum ('pending', 'paid', 'refunded', 'failed');
create type vehicle_status as enum ('active', 'maintenance', 'retired');
create type notification_type as enum ('sms', 'email');
create type trip_status as enum ('scheduled', 'boarding', 'in_progress', 'completed', 'cancelled');
create type discount_type as enum ('percent', 'fixed');
create type notification_status as enum ('sent', 'failed', 'pending');

-- ─── ROUTES ──────────────────────────────────────────────────────────────────
create table routes (
  id                  uuid primary key default uuid_generate_v4(),
  name                text not null,
  origin_label        text not null,
  origin_key          text not null,
  destination_label   text not null,
  destination_key     text not null,
  duration_minutes    integer not null default 150,
  is_active           boolean not null default true,
  created_at          timestamptz not null default now()
);

-- ─── TRIPS (Scheduled Departures) ────────────────────────────────────────────
create table trips (
  id                  uuid primary key default uuid_generate_v4(),
  route_id            uuid not null references routes(id) on delete restrict,
  departure_date      date not null,
  departure_time      time not null,
  total_capacity      integer not null default 8,
  seats_booked        integer not null default 0,
  status              trip_status not null default 'scheduled',
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint seats_non_negative check (seats_booked >= 0),
  constraint seats_within_capacity check (seats_booked <= total_capacity)
);

create index idx_trips_route_date on trips(route_id, departure_date);
create index idx_trips_date on trips(departure_date);

-- ─── VEHICLES ────────────────────────────────────────────────────────────────
create table vehicles (
  id                  uuid primary key default uuid_generate_v4(),
  name                text not null,
  license_plate       text not null unique,
  make                text not null default 'Mercedes',
  model               text not null default 'Sprinter',
  year                integer not null,
  capacity            integer not null default 8,
  status              vehicle_status not null default 'active',
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- ─── DRIVERS ─────────────────────────────────────────────────────────────────
create table drivers (
  id                  uuid primary key default uuid_generate_v4(),
  employee_id         uuid,                -- linked after employees table created
  first_name          text not null,
  last_name           text not null,
  phone               text not null,
  email               text,
  license_number      text not null,
  is_active           boolean not null default true,
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- ─── TRIP ↔ VEHICLE ASSIGNMENTS ──────────────────────────────────────────────
create table trip_vehicles (
  id                  uuid primary key default uuid_generate_v4(),
  trip_id             uuid not null references trips(id) on delete cascade,
  vehicle_id          uuid not null references vehicles(id) on delete restrict,
  driver_id           uuid references drivers(id) on delete set null,
  created_at          timestamptz not null default now(),
  unique(trip_id, vehicle_id)
);

-- ─── EMPLOYEES ───────────────────────────────────────────────────────────────
create table employees (
  id                  uuid primary key default uuid_generate_v4(),
  user_id             uuid not null references auth.users(id) on delete cascade unique,
  role                employee_role not null,
  first_name          text not null,
  last_name           text not null,
  email               text not null unique,
  phone               text,
  is_active           boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- Back-fill the driver→employee FK now that employees exists
alter table drivers
  add constraint fk_drivers_employees
  foreign key (employee_id) references employees(id) on delete set null;

-- ─── CUSTOMERS ───────────────────────────────────────────────────────────────
create table customers (
  id                    uuid primary key default uuid_generate_v4(),
  user_id               uuid references auth.users(id) on delete set null,  -- null = guest
  first_name            text not null,
  last_name             text not null,
  email                 text not null,
  phone                 text not null,
  is_military           boolean not null default false,
  stripe_customer_id    text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index idx_customers_email on customers(email);
create index idx_customers_phone on customers(phone);
create index idx_customers_user_id on customers(user_id);

-- ─── DISCOUNTS ───────────────────────────────────────────────────────────────
create table discounts (
  id                  uuid primary key default uuid_generate_v4(),
  code                text unique,               -- null = staff-applied, no code needed
  name                text not null,
  type                discount_type not null,
  value               numeric(10,2) not null,
  is_active           boolean not null default true,
  usage_count         integer not null default 0,
  max_usage           integer,                   -- null = unlimited
  expires_at          timestamptz,
  created_at          timestamptz not null default now()
);

-- ─── RESERVATIONS ────────────────────────────────────────────────────────────
create table reservations (
  id                          uuid primary key default uuid_generate_v4(),
  confirmation_number         text not null unique,
  customer_id                 uuid not null references customers(id) on delete restrict,
  trip_id                     uuid not null references trips(id) on delete restrict,
  return_trip_id              uuid references trips(id) on delete restrict,
  status                      reservation_status not null default 'confirmed',
  adults                      integer not null default 1,
  children                    integer not null default 0,
  pets                        integer not null default 0,
  extra_bags                  integer not null default 0,
  is_round_trip               boolean not null default false,
  special_notes               text,
  discount_id                 uuid references discounts(id) on delete set null,
  subtotal_cents              integer not null,
  discount_cents              integer not null default 0,
  total_cents                 integer not null,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  cancelled_at                timestamptz,
  created_by_employee_id      uuid references employees(id) on delete set null,
  constraint adults_positive check (adults >= 0),
  constraint children_non_negative check (children >= 0),
  constraint pets_non_negative check (pets >= 0),
  constraint bags_non_negative check (extra_bags >= 0),
  constraint total_non_negative check (total_cents >= 0)
);

create index idx_reservations_confirmation on reservations(confirmation_number);
create index idx_reservations_customer on reservations(customer_id);
create index idx_reservations_trip on reservations(trip_id);
create index idx_reservations_status on reservations(status);
create index idx_reservations_created on reservations(created_at desc);

-- ─── RESERVATION PASSENGERS (Manifest) ───────────────────────────────────────
create table reservation_passengers (
  id                  uuid primary key default uuid_generate_v4(),
  reservation_id      uuid not null references reservations(id) on delete cascade,
  name                text not null,
  is_primary          boolean not null default false,
  is_boarded          boolean not null default false,
  is_no_show          boolean not null default false,
  created_at          timestamptz not null default now()
);

create index idx_passengers_reservation on reservation_passengers(reservation_id);

-- ─── PAYMENTS ────────────────────────────────────────────────────────────────
create table payments (
  id                          uuid primary key default uuid_generate_v4(),
  reservation_id              uuid not null references reservations(id) on delete restrict,
  method                      payment_method not null default 'stripe',
  status                      payment_status not null default 'pending',
  amount_cents                integer not null,
  stripe_payment_intent_id    text unique,
  stripe_charge_id            text,
  refund_amount_cents         integer not null default 0,
  refunded_at                 timestamptz,
  refunded_by_employee_id     uuid references employees(id) on delete set null,
  notes                       text,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

create index idx_payments_reservation on payments(reservation_id);
create index idx_payments_stripe_pi on payments(stripe_payment_intent_id);

-- ─── NOTIFICATIONS ───────────────────────────────────────────────────────────
create table notifications (
  id                  uuid primary key default uuid_generate_v4(),
  reservation_id      uuid not null references reservations(id) on delete cascade,
  type                notification_type not null,
  recipient           text not null,
  message             text not null,
  sent_at             timestamptz not null default now(),
  status              notification_status not null default 'pending',
  provider_id         text          -- Twilio SID or similar
);

create index idx_notifications_reservation on notifications(reservation_id);

-- ─── AUDIT LOGS ──────────────────────────────────────────────────────────────
create table audit_logs (
  id                  uuid primary key default uuid_generate_v4(),
  actor_id            text,                -- user_id or 'system'
  actor_role          text,
  action              text not null,       -- e.g. 'reservation.cancelled'
  table_name          text not null,
  record_id           text not null,
  old_data            jsonb,
  new_data            jsonb,
  ip_address          inet,
  created_at          timestamptz not null default now()
);

create index idx_audit_logs_record on audit_logs(table_name, record_id);
create index idx_audit_logs_actor on audit_logs(actor_id);
create index idx_audit_logs_created on audit_logs(created_at desc);

-- ─── UPDATED_AT TRIGGER ──────────────────────────────────────────────────────
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger set_trips_updated_at before update on trips
  for each row execute function set_updated_at();
create trigger set_vehicles_updated_at before update on vehicles
  for each row execute function set_updated_at();
create trigger set_drivers_updated_at before update on drivers
  for each row execute function set_updated_at();
create trigger set_employees_updated_at before update on employees
  for each row execute function set_updated_at();
create trigger set_customers_updated_at before update on customers
  for each row execute function set_updated_at();
create trigger set_reservations_updated_at before update on reservations
  for each row execute function set_updated_at();
create trigger set_payments_updated_at before update on payments
  for each row execute function set_updated_at();

-- ─── TRIP AVAILABILITY FUNCTION ──────────────────────────────────────────────
create or replace function get_trip_availability(p_route_id uuid, p_date date)
returns table (
  trip_id         uuid,
  departure_time  time,
  seats_available integer,
  total_capacity  integer
) as $$
begin
  return query
  select
    t.id,
    t.departure_time,
    (t.total_capacity - t.seats_booked) as seats_available,
    t.total_capacity
  from trips t
  where
    t.route_id = p_route_id
    and t.departure_date = p_date
    and t.status = 'scheduled'
  order by t.departure_time;
end;
$$ language plpgsql security definer;

-- ─── RESERVATION DETAILS VIEW ────────────────────────────────────────────────
create or replace view reservation_details as
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
