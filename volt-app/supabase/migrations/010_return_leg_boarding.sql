-- ═══════════════════════════════════════════════════════════════════════════════
-- Per-leg boarding status
-- Round-trip riders appear on both their outbound and return trip manifests.
-- is_boarded / is_no_show track the outbound leg; these track the return leg so
-- boarding someone on the way out doesn't mark them boarded on the way back.
-- ═══════════════════════════════════════════════════════════════════════════════

alter table reservation_passengers
  add column if not exists return_is_boarded boolean not null default false,
  add column if not exists return_is_no_show boolean not null default false;
