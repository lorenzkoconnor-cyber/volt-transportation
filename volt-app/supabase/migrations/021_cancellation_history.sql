-- Cancellations (online or staff) are recorded in reservation_changes, with the
-- cancellation fee kept and what was refunded (src/lib/cancellation.ts).
alter table public.reservation_changes drop constraint if exists reservation_changes_action_check;
alter table public.reservation_changes add constraint reservation_changes_action_check
  check (action in ('created', 'edited', 'refund', 'text_sent', 'cancelled'));
