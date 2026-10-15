-- Reservation editing, receipts, and trip reminders.
--
--   • reservation_changes — who did what to a booking (created / edited /
--     refund / text sent). An edit that costs more waits here
--     ("awaiting_payment") until the extra charge is paid; only then is it
--     applied. Staff (owner, manager, office staff) can read it; all writes go
--     through service-role API routes.
--   • payments.reservation_change_id — the payment that paid for an edit.
--   • reservations.receipt_token — unguessable id for the public receipt link
--     (/receipt/<token>) that staff print or text to the customer.
--   • reservations.terms_accepted_at / terms_acceptance — 'online' (checkbox
--     at checkout) or 'verbal' (customer agreed to staff at the counter/phone).
--   • notifications.kind — what a text was ('confirmation', 'reminder_24h:<trip_id>',
--     …). Reminders are unique per reservation + kind, so each goes out once
--     per leg (and again if an edit moves the booking to a different trip).
--   • due_trip_reminders() — the 24-hour and 2-hour reminders due right now.

alter table public.reservations
  add column if not exists receipt_token uuid not null default gen_random_uuid(),
  add column if not exists terms_accepted_at timestamptz,
  add column if not exists terms_acceptance text check (terms_acceptance in ('online', 'verbal')),
  add column if not exists updated_by_employee_id uuid references public.employees(id) on delete set null;

create unique index if not exists idx_reservations_receipt_token on public.reservations(receipt_token);

alter table public.notifications add column if not exists kind text;
-- Only reminders are one-per-leg; confirmations/receipts may be resent.
create unique index if not exists idx_notifications_reminder_once
  on public.notifications(reservation_id, kind) where kind like 'reminder_%';

create table if not exists public.reservation_changes (
  id                  uuid primary key default gen_random_uuid(),
  reservation_id      uuid not null references public.reservations(id) on delete cascade,
  employee_id         uuid references public.employees(id) on delete set null,
  employee_name       text,
  action              text not null check (action in ('created', 'edited', 'refund', 'text_sent')),
  status              text not null default 'applied'
                        check (status in ('awaiting_payment', 'applied', 'abandoned', 'failed')),
  summary             text[] not null default '{}',
  old_data            jsonb,
  new_data            jsonb,
  price_change_cents  integer not null default 0,
  amount_cents        integer,
  error               text,
  created_at          timestamptz not null default now(),
  applied_at          timestamptz
);

create index if not exists idx_reservation_changes_reservation
  on public.reservation_changes(reservation_id, created_at desc);

alter table public.reservation_changes enable row level security;

drop policy if exists reservation_changes_staff_read on public.reservation_changes;
create policy reservation_changes_staff_read on public.reservation_changes
  for select using (is_employee_with_roles(array['owner', 'manager', 'office_staff']));

alter table public.payments
  add column if not exists reservation_change_id uuid references public.reservation_changes(id) on delete set null;

-- ── Reminders due now ────────────────────────────────────────────────────────
-- Departure times are local (Eastern). A leg gets:
--   • the 24-hour reminder when it departs within 24 h (but more than 2¼ h
--     away) and was booked more than 24 h ahead;
--   • the 2-hour reminder when it departs within 2 h (more than 20 min away)
--     and was booked more than 2 h ahead.
-- Already-sent reminders (notifications.kind) are skipped.
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
  with legs as (
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
      and t.departure_date between current_date - 1 and current_date + 2
      and coalesce(l.phone, '') <> ''
  ),
  due as (
    select timed.*, 'reminder_24h:' || tid as k from timed
    where departs_at - now() <= interval '24 hours'
      and departs_at - now() > interval '2 hours 15 minutes'
      and departs_at - created_at > interval '24 hours'
    union all
    select timed.*, 'reminder_2h:' || tid from timed
    where departs_at - now() <= interval '2 hours'
      and departs_at - now() > interval '20 minutes'
      and departs_at - created_at > interval '2 hours'
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
