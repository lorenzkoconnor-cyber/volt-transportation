-- ═══════════════════════════════════════════════════════════════════════════════
-- Military Discount policy change (2026-09-29)
--   • Rate 5% → 10% (enforced in code: MILITARY_DISCOUNT_RATE in src/lib/booking.ts)
--   • Eligibility narrowed to active-duty + retired military; first responders
--     and non-retired former members no longer qualify. New uploads use
--     military_category 'active_duty' | 'retired'; older rows keep their
--     legacy 'military' / 'first_responder' values for the record.
--   • Donations are now 10% of Volt's profits to Warrior Outreach Ranch — no
--     longer tied to discount savings (nothing stored in the DB for this).
-- ═══════════════════════════════════════════════════════════════════════════════

-- Keep the reference row in `discounts` in sync with the live rate.
update discounts
   set value = 10
 where name = 'Military Discount' and type = 'percent';
