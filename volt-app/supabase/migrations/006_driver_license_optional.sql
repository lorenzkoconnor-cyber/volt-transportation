-- ═══════════════════════════════════════════════════════════════════════════════
-- Volt Transportation — Driver license number optional
-- Applied to production 2026-07-22 (Supabase migration: driver_license_optional)
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Drivers are assigned to a different vehicle each day (per-trip, via the
-- trip_vehicles table in dispatch), so a permanent license number on the driver
-- record is not meaningful. Make the column optional.

alter table drivers alter column license_number drop not null;
