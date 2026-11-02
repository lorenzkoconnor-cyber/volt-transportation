-- 035 — "How did you hear about us?" on online bookings.
--   • Optional one-tap answer at checkout (src/lib/heard-from.ts), copied onto
--     the reservation. Null = rider skipped it, or a staff/walk-in booking.
--   • "Other" can come with an optional typed detail (heard_from_other).

alter table public.reservations
  add column if not exists heard_from text
    check (heard_from in ('google', 'facebook_instagram', 'friend_family', 'saw_volt', 'other')),
  add column if not exists heard_from_other text
    check (char_length(heard_from_other) <= 200);
