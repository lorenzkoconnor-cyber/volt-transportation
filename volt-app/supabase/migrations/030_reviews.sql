-- 030 — Customer reviews.
--   • After a rider completes at least one leg, the reminder worker emails a
--     review request (2 hours after arrival). The link opens /review/<token>.
--   • Reviews publish on the website right away. Ones with links, phone
--     numbers, emails or profanity are HELD for an owner/manager to approve.
--     Staff may hide a review only for content reasons (never for its rating —
--     the FTC's 2024 review rule bans suppressing negative reviews).
--   • The thank-you screen offers a button to also post on Google
--     (booking_settings.google_review_url).

create table if not exists public.reviews (
  id                        uuid primary key default uuid_generate_v4(),
  reservation_id            uuid unique references public.reservations(id) on delete set null,
  customer_id               uuid references public.customers(id) on delete set null,
  display_name              text not null check (char_length(display_name) between 1 and 40),
  rating                    smallint not null check (rating between 1 and 5),
  body                      text not null check (char_length(body) between 1 and 1000),
  trip_label                text,
  status                    text not null default 'published' check (status in ('published', 'held', 'hidden')),
  hold_reason               text,
  source                    text not null default 'volt' check (source in ('volt', 'google')),
  google_clicked_at         timestamptz,
  moderated_by_employee_id  uuid references public.employees(id) on delete set null,
  moderated_at              timestamptz,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

create index if not exists idx_reviews_status_created on public.reviews(status, created_at desc);

drop trigger if exists set_reviews_updated_at on public.reviews;
create trigger set_reviews_updated_at before update on public.reviews
  for each row execute function set_updated_at();

-- Service-role API routes only (the website reads published reviews on the server).
alter table public.reviews enable row level security;

-- Unguessable id for the "Leave a review" link.
alter table public.reservations
  add column if not exists review_token uuid not null default gen_random_uuid();
create unique index if not exists idx_reservations_review_token on public.reservations(review_token);

alter table public.booking_settings
  add column if not exists review_requests_enabled boolean not null default true,
  add column if not exists google_review_url text;

-- Reservations owed a review request: at least one leg arrived p_delay_minutes
-- ago (not all of its riders were no-shows, trip not cancelled), within the
-- last 7 days so launching this never emails old bookings. One per booking.
create or replace function public.due_review_requests(p_delay_minutes integer default 120)
returns table (
  reservation_id      uuid,
  email               text,
  first_name          text,
  confirmation_number text,
  review_token        uuid
)
language sql stable security definer set search_path = public, pg_temp
as $$
  with legs as (
    select r.id as rid, r.trip_id as tid, false as is_return
    from reservations r
    where r.status in ('confirmed', 'completed') and r.deleted_at is null
    union all
    select r.id, r.return_trip_id, true
    from reservations r
    where r.status in ('confirmed', 'completed') and r.deleted_at is null
      and r.is_round_trip and r.return_trip_id is not null
  ),
  arrived as (
    select l.rid
    from legs l
    join trips t on t.id = l.tid
    join routes ro on ro.id = t.route_id
    where t.status <> 'cancelled'
      and ((t.departure_date + t.departure_time) at time zone 'America/New_York')
          + make_interval(mins => coalesce(ro.duration_minutes, 120) + p_delay_minutes)
          between now() - interval '7 days' and now()
      and exists (
        select 1 from reservation_passengers p
        where p.reservation_id = l.rid
          and not (case when l.is_return then p.return_is_no_show else p.is_no_show end)
      )
  )
  select distinct r.id, c.email, c.first_name, r.confirmation_number, r.review_token
  from arrived a
  join reservations r on r.id = a.rid
  join customers c on c.id = r.customer_id
  where c.email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'
    and c.email !~* '@(guest|walkin)\.volt$'
    and not exists (select 1 from reviews v where v.reservation_id = r.id)
    and not exists (
      select 1 from notifications n where n.reservation_id = r.id and n.kind = 'review_request'
    );
$$;

revoke execute on function public.due_review_requests(integer) from public, anon, authenticated;
grant  execute on function public.due_review_requests(integer) to service_role;
