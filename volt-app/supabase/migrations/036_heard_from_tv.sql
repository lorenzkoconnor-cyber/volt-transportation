-- 036 — "TV commercial" answer for "How did you hear about us?" (WTVM spot).

alter table public.reservations
  drop constraint if exists reservations_heard_from_check,
  add constraint reservations_heard_from_check
    check (heard_from in ('google', 'facebook_instagram', 'tv', 'friend_family', 'saw_volt', 'other'));
