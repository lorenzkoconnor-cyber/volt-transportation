-- 032 — Ad attribution on online bookings.
--   • When a visitor lands on the site from a tagged link (utm_source=facebook,
--     utm_content=a_skip_drive, …), the browser remembers the tags for 30 days
--     and sends them with checkout (src/lib/attribution.ts).
--   • They're copied onto the reservation so bookings can be credited to an ad
--     (e.g. Facebook A/B test version A vs B). Nothing personal is stored.
--   • Staff and walk-in bookings leave these empty.

alter table public.reservations
  add column if not exists utm_source   text,
  add column if not exists utm_medium   text,
  add column if not exists utm_campaign text,
  add column if not exists utm_content  text,
  add column if not exists landing_path text;

create index if not exists reservations_utm_source_idx
  on public.reservations (utm_source, utm_content)
  where utm_source is not null;
