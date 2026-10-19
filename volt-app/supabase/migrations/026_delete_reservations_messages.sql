-- 026 — Owners/managers can delete reservations and messages.
--
--   • Reservations are HIDDEN, not erased (owner decision): deleted_at is set and
--     the dashboard, Boarding List, calendar, customer portal and manage-booking
--     lookup all skip the row. Payments stay so Payments/Reports still match
--     Stripe and the bank. Only past or cancelled reservations can be deleted —
--     upcoming ones must be cancelled first (enforced in DELETE /api/reservations/[id]).
--   • Contact-page messages and Outbox (notifications) rows are deleted for real.

alter table public.reservations
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by_employee_id uuid references public.employees(id) on delete set null;

drop policy if exists contact_messages_admin_delete on public.contact_messages;
create policy contact_messages_admin_delete on public.contact_messages
  for delete to authenticated
  using (is_employee_with_roles(array['owner', 'manager']));

drop policy if exists notifications_admin_delete on public.notifications;
create policy notifications_admin_delete on public.notifications
  for delete to authenticated
  using (is_employee_with_roles(array['owner', 'manager']));
