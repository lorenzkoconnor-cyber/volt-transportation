"use client";

// Dashboard → Settings (owners & managers). Everything here is saved through
// /api/settings, which validates it and records it in the Change History.

import { useCallback, useEffect, useState } from "react";
import {
  Settings, Loader2, DollarSign, CalendarClock, Tag, UserCog, Plane, Clock, Building2, BellRing, Bus, Star,
} from "lucide-react";
import StaffAlertsCard from "@/components/admin/StaffAlertsCard";
import { FieldsCard, inputClass } from "@/components/admin/settings/shared";
import { ScheduleCard, BlackoutsCard } from "@/components/admin/settings/ScheduleCards";
import { BannerCard } from "@/components/admin/settings/WebsiteCards";
import { TemplatesCard, HealthCard, HistoryCard } from "@/components/admin/settings/MessageCards";
import { SquareTerminalsCard } from "@/components/admin/settings/PaymentCards";
import { formatDuration, displayTime12h } from "@/lib/booking";

/* eslint-disable @typescript-eslint/no-explicit-any */

const TABS = [
  { key: "pricing", label: "Prices & Rules" },
  { key: "schedule", label: "Schedule & Service" },
  { key: "messages", label: "Messages" },
  { key: "payments", label: "Payments" },
  { key: "website", label: "Website & Contact" },
  { key: "alerts", label: "Staff Alerts" },
  { key: "history", label: "History" },
] as const;
type Tab = (typeof TABS)[number]["key"];

const hrs = (n: unknown) => (Number.isFinite(Number(n)) ? formatDuration(Number(n) * 60) : "");

export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>("pricing");
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");
  // Bumped after every save so cards re-read what the server stored.
  const [version, setVersion] = useState(0);

  const load = useCallback(async () => {
    const res = await fetch("/api/settings");
    const d = await res.json().catch(() => ({}));
    if (!res.ok) setError(d.error ?? "Couldn't load settings.");
    else { setData(d); setVersion((v) => v + 1); }
  }, []);
  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);

  const s = data?.settings ?? {};

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Settings className="w-6 h-6 text-[#FCC300]" /> Settings
        </h1>
        <p className="text-[#A1A1AA] text-sm mt-0.5">
          Prices, schedule, messages and how Volt runs. Changes apply right away and are recorded in History.
        </p>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded-xl text-sm border whitespace-nowrap ${
              tab === t.key ? "bg-[#FCC300]/15 border-[#FCC300]/40 text-[#FCC300]" : "bg-white/5 border-white/10 text-[#A1A1AA] hover:text-white"
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {error ? (
        <div className="glass rounded-2xl p-6 text-red-400 text-sm">{error}</div>
      ) : !data ? (
        <div className="glass rounded-2xl p-12 flex justify-center"><Loader2 className="w-6 h-6 text-[#FCC300] animate-spin" /></div>
      ) : (
        <div key={`${tab}-${version}`} className="space-y-6">
          {tab === "pricing" && (
            <>
              <FieldsCard icon={DollarSign} title="Prices" settings={s} onSaved={load}
                description="One-way prices (round trips are doubled). New bookings use them right away; existing bookings keep the price they were booked at."
                rows={[
                  { column: "price_adult_cents", title: "Adult", suffix: "per seat" },
                  { column: "price_child_cents", title: "Child (ages 2–12)", suffix: "per seat" },
                  { column: "price_pet_cents", title: "Pet", suffix: "per pet" },
                  { column: "price_extra_bag_cents", title: "Extra bag", suffix: "per bag" },
                  { column: "door_pickup_fee_cents", title: "Door pickup", step: 1,
                    help: "Team Portal only: picking a rider up at their address.", suffix: "per reservation" },
                  { column: "door_dropoff_fee_cents", title: "Door drop-off", step: 1,
                    help: "Team Portal only: dropping a rider off at their address.", suffix: "per reservation" },
                ]} />
              <FieldsCard icon={CalendarClock} title="Booking Rules" settings={s} onSaved={load}
                description="All times are Eastern. Staff can always book and cancel from the Team Portal."
                rows={[
                  { column: "online_booking_cutoff_minutes", title: "Online booking closes", step: 15,
                    help: "How long before a departure the website stops selling seats on it. Riders are asked to call instead.",
                    suffix: `min before departure · ${formatDuration(Number(s.online_booking_cutoff_minutes) || 0)}` },
                  { column: "short_notice_hours", title: "Short-notice window",
                    help: "A booking whose first ride leaves within this many hours alerts staff.", suffix: "hours" },
                  { column: "cancellation_fee_cents", title: "Cancellation fee", step: 1,
                    help: "Kept from the refund on every cancelled reservation. Owners and managers can waive it.", suffix: "per reservation" },
                  { column: "arrive_early_minutes", title: "Arrive early",
                    help: "Shown on the website, receipts and in texts (\"Please arrive 20 minutes early\").", suffix: "minutes before departure" },
                ]} />
              <FieldsCard icon={Tag} title="Discounts" settings={s} onSaved={load}
                description="Switching the Military Discount off hides it at checkout and on the website; bookings already made keep their discount."
                rows={[
                  { column: "military_discount_enabled", title: "Military Discount" },
                  { column: "military_discount_amount_cents", title: "Military Discount amount", step: 1,
                    help: "Taken off every verified military booking (once per reservation, round trip or not). Volt donates the same amount to Warrior Outreach Ranch for each one.",
                    suffix: "off each booking" },
                  { column: "discount_code_valid_days", title: "New discount codes last", suffix: "days" },
                ]} />
              <FieldsCard icon={UserCog} title="Staff Edit Windows" settings={s} onSaved={load}
                description="When reservations lock for editing. Owners and managers can still change a booking until the outbound departs, then the return trip only."
                rows={[
                  { column: "staff_edit_cutoff_hours", title: "Office staff can edit until",
                    suffix: `hours before departure${hrs(s.staff_edit_cutoff_hours) ? ` · ${hrs(s.staff_edit_cutoff_hours)}` : ""}` },
                  { column: "return_edit_cutoff_hours", title: "Return trip locks", suffix: "hours before the return departure" },
                ]} />
            </>
          )}

          {tab === "schedule" && (
            <>
              <ScheduleCard routes={data.routes} onSaved={load} />
              <BlackoutsCard blackouts={data.blackouts} onSaved={load} />
              <VanSizeCard settings={s} onSaved={load} />
              <RouteTimingCard settings={s} routes={data.routes} onSaved={load} />
            </>
          )}

          {tab === "messages" && (
            <>
              <HealthCard />
              <FieldsCard icon={BellRing} title="Trip Reminders" settings={s} onSaved={load}
                description="Texts sent before every departure. A rider who books inside a reminder's window doesn't get that one."
                rows={[
                  { column: "reminder_first_enabled", title: "First reminder" },
                  { column: "reminder_first_hours", title: "Send the first reminder", suffix: "hours before departure" },
                  { column: "reminder_second_enabled", title: "Second reminder" },
                  { column: "reminder_second_hours", title: "Send the second reminder", suffix: "hours before departure" },
                ]} />
              <FieldsCard icon={Star} title="Reviews" settings={s} onSaved={load}
                description="Customers are emailed a review link 2 hours after their first trip leg arrives (once per booking). Reviews show on the homepage; manage them under Dashboard → Reviews. Edit the email's wording below (Review request)."
                rows={[
                  { column: "review_requests_enabled", title: "Send review request emails" },
                  {
                    column: "google_review_url", title: "Google review link",
                    help: "Shown after a customer submits a review (\"Post on Google\"). Get it from Google: search Volt Transportation while signed in to your Business Profile → Ask for reviews → copy the link. Leave blank to hide the button.",
                  },
                ]} />
              <TemplatesCard overrides={data.templates} onSaved={load} />
            </>
          )}

          {tab === "website" && (
            <>
              <FieldsCard icon={Building2} title="Business Info" settings={s} onSaved={load}
                description="Shown across the website (footer, Contact, Locations, FAQ), on receipts and in customer texts and emails."
                rows={[
                  { column: "business_phone", title: "Phone number" },
                  { column: "business_email", title: "Email address" },
                  { column: "business_street", title: "Street address" },
                  { column: "business_city_line", title: "City, state & ZIP", help: "Format: Columbus, GA 31909" },
                  { column: "business_hours", title: "Business hours", help: "As shown on the Contact page." },
                ]} />
              <BannerCard announcements={data.announcements} onSaved={load} />
            </>
          )}

          {tab === "payments" && <SquareTerminalsCard />}
          {tab === "alerts" && <StaffAlertsCard />}
          {tab === "history" && <HistoryCard history={data.history} />}
        </div>
      )}
    </div>
  );
}

function VanSizeCard({ settings, onSaved }: { settings: any; onSaved: () => void }) {
  const [apply, setApply] = useState(true);
  return (
    <FieldsCard icon={Bus} title="Seats Per Van" settings={settings} onSaved={onSaved}
      description="How many seats new departures get. Change a single departure in Dispatch."
      rows={[{ column: "default_van_capacity", title: "Seats on each new departure", suffix: "seats" }]}
      extraPayload={() => ({ applyCapacityToUpcoming: apply })}>
      {() => (
        <label className="flex items-center gap-2 text-sm text-[#A1A1AA] cursor-pointer">
          <input type="checkbox" checked={apply} onChange={(e) => setApply(e.target.checked)} className="accent-[#FCC300]" />
          Also update upcoming departures still at the old size (never below the riders already booked)
        </label>
      )}
    </FieldsCard>
  );
}

// Drive time per direction + the flight-matching windows.
function RouteTimingCard({ settings, routes, onSaved }: { settings: any; routes: any[]; onSaved: () => void }) {
  const [durations, setDurations] = useState<Record<string, number>>(
    () => Object.fromEntries(routes.map((r) => [r.id, r.duration_minutes])));
  const toAtl = routes.find((r) => r.origin_key !== "atl");
  const toAtlMinutes = toAtl ? durations[toAtl.id] : 0;
  const example = toAtl && toAtlMinutes < 270
    ? `Example: 10:30 AM flight → 6:00 AM Volt departure → ${displayTime12h(
        `${String(6 + Math.floor(toAtlMinutes / 60)).padStart(2, "0")}:${String(toAtlMinutes % 60).padStart(2, "0")}`,
      )} ATL arrival → ${formatDuration(270 - toAtlMinutes)} before the flight`
    : "";
  return (
    <FieldsCard icon={Plane} title="Drive Time & Flight Matching" settings={settings} onSaved={onSaved}
      description="Drive time sets estimated arrival times. The windows decide which departures customers are offered when they book with a flight."
      rows={[
        { column: "depart_min_buffer_minutes", title: "Flying out of ATL — reach ATL at least", suffix: "min before the flight", step: 5 },
        { column: "depart_max_buffer_minutes", title: "Flying out of ATL — reach ATL at most", suffix: "min before the flight", step: 5 },
        { column: "arrive_min_wait_minutes", title: "Landing at ATL — leave ATL at least", suffix: "min after landing", step: 5 },
        { column: "arrive_max_wait_minutes", title: "Landing at ATL — leave ATL at most", suffix: "min after landing", step: 5 },
      ]}
      extraPayload={() => ({ routeDurations: Object.entries(durations).map(([id, duration_minutes]) => ({ id, duration_minutes })) })}>
      {() => (
        <div className="space-y-3 border-t border-white/8 pt-4">
          <div className="text-white text-sm font-medium flex items-center gap-2"><Clock className="w-4 h-4 text-[#FCC300]" /> Drive time</div>
          {routes.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-4">
              <span className="text-white text-sm">{r.name}</span>
              <div className="flex items-center gap-2">
                <input type="number" min={30} max={300} step={5} value={durations[r.id]}
                  onChange={(e) => setDurations((p) => ({ ...p, [r.id]: Number(e.target.value) }))} className={inputClass} />
                <span className="text-[#A1A1AA] text-xs w-24">min · {formatDuration(durations[r.id] || 0)}</span>
              </div>
            </div>
          ))}
          {example && <p className="text-[#FFE08A] text-xs bg-[#FCC300]/10 rounded-lg px-3 py-2">{example}</p>}
        </div>
      )}
    </FieldsCard>
  );
}
