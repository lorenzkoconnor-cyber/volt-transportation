-- ═══════════════════════════════════════════════════════════════════════════════
-- Volt Transportation — Unique departure slots
-- Applied to production 2026-08-26 (Supabase migration: trips_unique_slot)
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- The seed (003) and generate_future_trips() (004) both rely on
-- `on conflict do nothing` to avoid re-creating existing departure slots, but the
-- trips table had no matching unique constraint, so re-running either one silently
-- inserted duplicate slots (the same route/date/time twice). This adds the
-- constraint that makes those upserts actually idempotent.

alter table trips
  add constraint trips_route_date_time_unique
  unique (route_id, departure_date, departure_time);
