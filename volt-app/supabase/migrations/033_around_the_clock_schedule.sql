-- ═══════════════════════════════════════════════════════════════════════════════
-- Volt Transportation — departures around the clock (24/7)
-- ═══════════════════════════════════════════════════════════════════════════════
-- Vans now leave every 2 hours, all day and night, 7 days a week, both ways:
--   12:00 AM, 2:00 AM, 4:00 AM … 10:00 PM  (12 departures a day each direction)
-- Office hours (booking_settings.business_hours) are unchanged.
-- Every existing departure time is still on the schedule, so nothing is removed;
-- apply_route_schedule() (023) just fills in the new overnight slots.

alter table routes alter column first_departure_time set default '00:00';
alter table routes alter column last_departure_time  set default '22:00';

update routes
set first_departure_time = '00:00',
    last_departure_time = '22:00',
    departure_interval_minutes = 120;

select * from apply_route_schedule();

-- Staff get a "short-notice booking" alert for any booking whose first ride
-- leaves within 36 hours (was 6). Editable in Settings → Prices & Rules.
alter table booking_settings alter column short_notice_hours set default 36;
update booking_settings set short_notice_hours = 36;
