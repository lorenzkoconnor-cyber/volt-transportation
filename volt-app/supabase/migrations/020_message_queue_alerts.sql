-- ─── Message queue, contact messages, staff alerts ──────────────────────────
-- • notifications becomes the single outbox for every customer/staff text and
--   email: a row is written first (status 'pending'), then sent right away and,
--   if that fails, retried by the cron worker (/api/cron/reminders) with
--   backoff until MAX_ATTEMPTS (see src/lib/notifications/queue.ts).
-- • contact_messages keeps every Contact-page message (also emailed to support).
-- • staff_alert_subscriptions says which employees get which staff alert, by
--   text and/or email (owner/manager edit it under Dashboard → Settings).

-- Staff alerts and contact-form emails aren't about a reservation.
alter table public.notifications alter column reservation_id drop not null;

alter table public.notifications
  add column if not exists subject         text,
  add column if not exists html            text,
  add column if not exists reply_to        text,
  add column if not exists audience        text not null default 'customer',
  add column if not exists attempts        integer not null default 0,
  add column if not exists next_attempt_at timestamptz not null default now(),
  add column if not exists last_error      text,
  add column if not exists created_at      timestamptz not null default now(),
  add column if not exists dedupe_key      text;

do $$ begin
  alter table public.notifications
    add constraint notifications_audience_check check (audience in ('customer', 'staff', 'support'));
exception when duplicate_object then null; end $$;

-- One row per dedupe key (e.g. one "hold expiring" alert per payment per person).
create unique index if not exists idx_notifications_dedupe
  on public.notifications(dedupe_key) where dedupe_key is not null;
create index if not exists idx_notifications_due
  on public.notifications(next_attempt_at) where status = 'pending';

-- ── Contact page messages ─────────────────────────────────────────────────────
create table if not exists public.contact_messages (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  email       text not null,
  phone       text,
  subject     text,
  message     text not null,
  created_at  timestamptz not null default now()
);
alter table public.contact_messages enable row level security;

drop policy if exists contact_messages_staff_read on public.contact_messages;
create policy contact_messages_staff_read on public.contact_messages
  for select to authenticated
  using (is_employee_with_roles(array['owner', 'manager', 'office_staff']));
-- Inserts only happen through the service-role /api/contact route.

-- ── Staff alert subscriptions ─────────────────────────────────────────────────
create table if not exists public.staff_alert_subscriptions (
  employee_id uuid not null references public.employees(id) on delete cascade,
  alert_type  text not null check (alert_type in (
    'short_notice_booking', 'online_cancellation', 'hold_expiring',
    'payment_without_reservation', 'van_capacity', 'message_failed'
  )),
  via_sms     boolean not null default true,
  via_email   boolean not null default true,
  updated_at  timestamptz not null default now(),
  primary key (employee_id, alert_type)
);
alter table public.staff_alert_subscriptions enable row level security;

drop policy if exists staff_alert_subscriptions_manage on public.staff_alert_subscriptions;
create policy staff_alert_subscriptions_manage on public.staff_alert_subscriptions
  for all to authenticated
  using (is_employee_with_roles(array['owner', 'manager']))
  with check (is_employee_with_roles(array['owner', 'manager']));

-- ── Booking rules (owner/manager edit under Dashboard → Settings) ─────────────
--   online_booking_cutoff_minutes — website booking closes this long before a
--     departure (staff can still book).
--   short_notice_hours — a booking whose first ride leaves within this many
--     hours raises the short-notice staff alert.
--   cancellation_fee_cents — kept from every cancellation's refund.
alter table public.booking_settings
  add column if not exists online_booking_cutoff_minutes integer not null default 120
    check (online_booking_cutoff_minutes between 0 and 1440),
  add column if not exists short_notice_hours integer not null default 6
    check (short_notice_hours between 0 and 72),
  add column if not exists cancellation_fee_cents integer not null default 1500
    check (cancellation_fee_cents between 0 and 100000);

-- Start with every active owner subscribed to every alert by text + email.
insert into public.staff_alert_subscriptions (employee_id, alert_type)
select e.id, a.t
from public.employees e
cross join unnest(array[
  'short_notice_booking', 'online_cancellation', 'hold_expiring',
  'payment_without_reservation', 'van_capacity', 'message_failed'
]) as a(t)
where e.role = 'owner' and e.is_active
on conflict do nothing;
