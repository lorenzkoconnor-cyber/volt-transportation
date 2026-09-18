-- ═══════════════════════════════════════════════════════════════════════════════
-- Military & First Responder verification + discount tracking
-- Applied to production 2026-09-18 (Supabase migration: 008_military_verification)
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── Customers: verification state ──────────────────────────────────────────────
-- military_status drives all logic; is_military stays as a convenience "approved"
-- flag (set true on approval) so existing reads keep working.
alter table customers
  add column if not exists military_status text not null default 'none'
    check (military_status in ('none','pending','approved','rejected')),
  add column if not exists military_category text,        -- 'military' | 'first_responder'
  add column if not exists military_id_path text,         -- storage object path (private bucket)
  add column if not exists military_submitted_at timestamptz,
  add column if not exists military_reviewed_at timestamptz,
  add column if not exists military_reviewed_by uuid references employees(id) on delete set null;

create index if not exists idx_customers_military_status
  on customers(military_status) where military_status = 'pending';

-- ── Reservations: program markers ──────────────────────────────────────────────
-- is_military: this booking is part of the Military/First-Responder program.
-- military_discount_pending: full price was charged; the 5% is owed as a refund
--   once the customer's verification is approved.
alter table reservations
  add column if not exists is_military boolean not null default false,
  add column if not exists military_discount_pending boolean not null default false;

create index if not exists idx_reservations_military
  on reservations(is_military) where is_military = true;
create index if not exists idx_reservations_military_pending
  on reservations(military_discount_pending) where military_discount_pending = true;

-- ── Private storage bucket for uploaded IDs ────────────────────────────────────
-- All reads/writes go through service-role API routes, so no public access and
-- no anon/authenticated storage policies are granted (default deny stands).
insert into storage.buckets (id, name, public)
  values ('military-ids', 'military-ids', false)
  on conflict (id) do nothing;
