-- 039 — Always-bookable departures (owner, 2026-11-12). Online booking
-- normally closes online_booking_cutoff_minutes (24 h) before departure; these
-- Columbus → ATL departure times stay bookable on the website until
-- always_open_cutoff_minutes before they leave. Staff still get the
-- short-notice alert (short_notice_hours) for bookings made inside that window.
-- Edited in Settings → Prices & Booking → Booking Rules.

alter table booking_settings
  add column if not exists always_open_times text[] not null
    default array['06:00', '08:00', '10:00', '12:00', '14:00', '16:00', '18:00', '20:00'],
  add column if not exists always_open_cutoff_minutes integer not null default 60
    check (always_open_cutoff_minutes between 0 and 1440);
