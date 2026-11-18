"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { formatCents, formatDateShort, localDateString } from "@/lib/format";
import { snapshotPricing } from "@/lib/settings";
import { Calculator, Loader2, Plus, RotateCcw, Save, Trash2, FlaskConical } from "lucide-react";

/* eslint-disable @typescript-eslint/no-explicit-any */

// ─── Profit calculator (bottom of Reports) ──────────────────────────────────
// Real side: revenue, riders, bookings and van trips from the database for the
// chosen period, minus the owner's saved costs (business_expenses, migration
// 042). Monthly costs are prorated to the period's length.
// What-if side: starts as a copy of the real numbers. Anything typed there —
// and any unsaved cost edits — lives only in this page's memory, so "Reset",
// changing the period, or leaving the page puts the real numbers back.

type Period = "this_month" | "last_month" | "30d" | "90d";
const PERIOD_LABEL: Record<Period, string> = {
  this_month: "This month",
  last_month: "Last month",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
};

const FIXED_FIELDS = [
  { key: "building",    label: "Building payment" },
  { key: "vans",        label: "Van payments" },
  { key: "insurance",   label: "Insurance" },
  { key: "payroll",     label: "Employees (payroll)" },
  { key: "marketing",   label: "Marketing / advertising" },
  { key: "utilities",   label: "Utilities (power, water, internet, phone)" },
  { key: "software",    label: "Software & subscriptions" },
  { key: "maintenance", label: "Van maintenance & repairs" },
] as const;
type FixedKey = (typeof FIXED_FIELDS)[number]["key"];

interface CustomLine { id: string; label: string; amount: string }
interface CostForm {
  fixed: Record<FixedKey, string>;
  custom: CustomLine[];
  fuelPerTrip: string;   // dollars, per van per one-way trip
  cardPercent: string;   // e.g. 2.9
  cardFlat: string;      // dollars per card payment, e.g. 0.30
}

const DEFAULT_FORM: CostForm = {
  fixed: Object.fromEntries(FIXED_FIELDS.map((f) => [f.key, ""])) as Record<FixedKey, string>,
  custom: [],
  fuelPerTrip: "25",
  cardPercent: "2.9",
  cardFlat: "0.30",
};

const DAYS_PER_MONTH = 365 / 12;
const num = (s: string | number | null | undefined) => {
  const n = typeof s === "number" ? s : parseFloat(String(s ?? "").replace(/[$,\s]/g, ""));
  return Number.isFinite(n) ? n : 0;
};
const str = (n: unknown) => (n === null || n === undefined || n === "" ? "" : String(n));

function formFromJson(j: any): CostForm {
  const fixed = { ...DEFAULT_FORM.fixed };
  for (const f of FIXED_FIELDS) fixed[f.key] = str(j?.fixed?.[f.key]);
  return {
    fixed,
    custom: Array.isArray(j?.custom)
      ? j.custom.map((c: any, i: number) => ({ id: `c${i}-${Date.now()}`, label: String(c.label ?? ""), amount: str(c.amount) }))
      : [],
    fuelPerTrip: j?.fuelPerTrip === undefined ? DEFAULT_FORM.fuelPerTrip : str(j.fuelPerTrip),
    cardPercent: j?.cardPercent === undefined ? DEFAULT_FORM.cardPercent : str(j.cardPercent),
    cardFlat: j?.cardFlat === undefined ? DEFAULT_FORM.cardFlat : str(j.cardFlat),
  };
}

function jsonFromForm(f: CostForm) {
  return {
    fixed: Object.fromEntries(FIXED_FIELDS.map((x) => [x.key, num(f.fixed[x.key])])),
    custom: f.custom.filter((c) => c.label.trim() || num(c.amount)).map((c) => ({ label: c.label.trim(), amount: num(c.amount) })),
    fuelPerTrip: num(f.fuelPerTrip),
    cardPercent: num(f.cardPercent),
    cardFlat: num(f.cardFlat),
  };
}

function periodRange(p: Period): { start: string; end: string; days: number; months: number } {
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const dayDiff = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / 86_400_000) + 1;
  if (p === "this_month") {
    const s = new Date(today.getFullYear(), today.getMonth(), 1, 12);
    const inMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    const days = dayDiff(s, today);
    return { start: localDateString(s), end: localDateString(today), days, months: days / inMonth };
  }
  if (p === "last_month") {
    const s = new Date(today.getFullYear(), today.getMonth() - 1, 1, 12);
    const e = new Date(today.getFullYear(), today.getMonth(), 0, 12);
    return { start: localDateString(s), end: localDateString(e), days: e.getDate(), months: 1 };
  }
  const days = p === "30d" ? 30 : 90;
  const s = new Date(today);
  s.setDate(s.getDate() - (days - 1));
  return { start: localDateString(s), end: localDateString(today), days, months: days / DAYS_PER_MONTH };
}

interface Real {
  revenueCents: number;     // fares + fees − refunds, tips excluded
  grossCents: number;
  refundCents: number;
  tipCents: number;
  riders: number;
  bookings: number;
  customers: number;
  trips: number;
  vanTrips: number;
  cardVolumeCents: number;
  cardPayments: number;
  militaryBookings: number;
  donationCents: number;
}

interface Inputs {
  revenueCents: number;
  riders: number;
  bookings: number;
  vanTrips: number;
  cardShare: number;          // fraction of revenue paid by card
  cardPaymentsPerBooking: number;
  donationCents: number;
}

function calc(i: Inputs, f: CostForm, months: number) {
  const monthlyFixed =
    FIXED_FIELDS.reduce((s, x) => s + num(f.fixed[x.key]), 0) + f.custom.reduce((s, c) => s + num(c.amount), 0);
  const fixedCents = Math.round(monthlyFixed * 100 * months);
  const pct = num(f.cardPercent) / 100;
  const flatCents = num(f.cardFlat) * 100;
  const feeCents = Math.round(i.revenueCents * i.cardShare * pct + i.bookings * i.cardPaymentsPerBooking * flatCents);
  const fuelCents = Math.round(i.vanTrips * num(f.fuelPerTrip) * 100);
  const expenseCents = fixedCents + feeCents + fuelCents + i.donationCents;
  const profitCents = i.revenueCents - expenseCents;

  // Break-even: riders needed to cover fixed costs, given what each rider
  // brings in after their share of card fees, fuel and donations.
  let breakEven: number | null = null;
  if (i.riders > 0) {
    const perRider =
      (i.revenueCents - feeCents - fuelCents - i.donationCents) / i.riders;
    breakEven = perRider > 0 ? Math.ceil(fixedCents / perRider) : null;
  }
  return {
    monthlyFixedCents: Math.round(monthlyFixed * 100),
    fixedCents, feeCents, fuelCents, expenseCents, profitCents,
    margin: i.revenueCents > 0 ? profitCents / i.revenueCents : null,
    perRider: i.riders > 0 ? profitCents / i.riders : null,
    perMonth: months > 0 ? profitCents / months : profitCents,
    breakEven,
  };
}

const money = (c: number) => (c < 0 ? "−" : "") + formatCents(Math.round(Math.abs(c) / 100) * 100);
const moneyExact = (c: number) => (c < 0 ? "−" : "") + formatCents(Math.round(Math.abs(c)));

const inputCls =
  "w-full rounded-lg bg-white/5 border border-white/12 px-3 py-2 text-white text-sm focus:outline-none focus:border-[#FCC300]/60";

function DollarInput({ value, onChange, placeholder = "0", suffix }: {
  value: string; onChange: (v: string) => void; placeholder?: string; suffix?: string;
}) {
  return (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#71717A] text-sm">$</span>
      <input onFocus={(e) => e.target.select()} inputMode="decimal" value={value} placeholder={placeholder}
        onChange={(e) => onChange(e.target.value.replace(/[^\d.,]/g, ""))}
        className={`${inputCls} pl-6 ${suffix ? "pr-14" : ""}`} />
      {suffix && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[#71717A] text-xs">{suffix}</span>}
    </div>
  );
}

export default function ProfitCalculatorCard() {
  const sb = createClient() as any;
  const { employee } = useAuth();

  const [period, setPeriod] = useState<Period>("this_month");
  const [loading, setLoading] = useState(true);
  const [real, setReal] = useState<Real | null>(null);

  const [saved, setSaved] = useState<CostForm>(DEFAULT_FORM);
  const [form, setForm] = useState<CostForm>(DEFAULT_FORM);
  const [savedMeta, setSavedMeta] = useState<{ by: string | null; at: string | null }>({ by: null, at: null });
  const [costsLoading, setCostsLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // What-if inputs (strings while typing). null = follow the real numbers.
  const [whatIf, setWhatIf] = useState<{ riders: string; avgFare: string; perTrip: string } | null>(null);

  const range = useMemo(() => periodRange(period), [period]);

  // ── Saved costs ────────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      const { data } = await sb.from("business_expenses").select("costs, updated_at, updated_by_name").eq("id", 1).maybeSingle();
      const f = formFromJson(data?.costs ?? {});
      setSaved(f);
      setForm(f);
      setSavedMeta({ by: data?.updated_by_name ?? null, at: data?.updated_at ?? null });
      setCostsLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Real numbers for the period ────────────────────────────────────────────
  // (Loading/what-if are reset in changePeriod, so a new period always starts
  // from the real numbers.)
  useEffect(() => {
    const { start, end } = range;
    (async () => {
      const [resvRes, tripsRes, vansRes] = await Promise.all([
        sb.from("reservations")
          .select(
            "customer_id, adults, children, total_cents, tip_cents, is_military, discount_cents, military_discount_pending, pricing_snapshot, " +
            "trip:trips!reservations_trip_id_fkey!inner(departure_date), payments(method, status, amount_cents, refund_amount_cents)"
          )
          .gte("trip.departure_date", start)
          .lte("trip.departure_date", end)
          .neq("status", "cancelled")
          .is("deleted_at", null),
        sb.from("trips").select("id")
          .gte("departure_date", start).lte("departure_date", end).gt("seats_booked", 0),
        sb.from("trip_vehicles")
          .select("trip_id, trip:trips!inner(departure_date, seats_booked)")
          .gte("trip.departure_date", start).lte("trip.departure_date", end).gt("trip.seats_booked", 0),
      ]);
      const rows: any[] = resvRes.data ?? [];
      const r: Real = {
        revenueCents: 0, grossCents: 0, refundCents: 0, tipCents: 0, riders: 0, bookings: rows.length,
        customers: new Set(rows.map((x) => x.customer_id).filter(Boolean)).size,
        trips: 0, vanTrips: 0, cardVolumeCents: 0, cardPayments: 0, militaryBookings: 0, donationCents: 0,
      };
      for (const x of rows) {
        r.grossCents += x.total_cents ?? 0;
        r.tipCents += x.tip_cents ?? 0;
        r.riders += (x.adults ?? 0) + (x.children ?? 0);
        for (const p of x.payments ?? []) {
          r.refundCents += p.refund_amount_cents ?? 0;
          if ((p.method === "stripe" || p.method === "square") && ["paid", "refunded", "partially_refunded"].includes(p.status)) {
            r.cardVolumeCents += p.amount_cents ?? 0;
            r.cardPayments += 1;
          }
        }
        if (x.is_military && (x.discount_cents ?? 0) > 0 && !x.military_discount_pending) {
          r.militaryBookings += 1;
          r.donationCents += Math.round(snapshotPricing(x.pricing_snapshot).militaryAmount * 100);
        }
      }
      r.revenueCents = r.grossCents - r.tipCents - r.refundCents;
      const tripIds: string[] = (tripsRes.data ?? []).map((t: any) => t.id);
      r.trips = tripIds.length;
      const vansPerTrip = new Map<string, number>();
      for (const v of vansRes.data ?? []) vansPerTrip.set(v.trip_id, (vansPerTrip.get(v.trip_id) ?? 0) + 1);
      // A trip with no van assigned yet still counts as one van trip.
      r.vanTrips = tripIds.reduce((s, id) => s + Math.max(1, vansPerTrip.get(id) ?? 0), 0);
      setReal(r);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range]);

  // ── Derived ────────────────────────────────────────────────────────────────
  const base = useMemo(() => {
    if (!real) return null;
    const avgFareCents = real.riders > 0 ? real.revenueCents / real.riders : 0;
    const perTrip = real.vanTrips > 0 ? real.riders / real.vanTrips : 0;
    const cardShare = real.grossCents > 0 ? Math.min(1, real.cardVolumeCents / real.grossCents) : 1;
    const cardPaymentsPerBooking = real.bookings > 0 ? real.cardPayments / real.bookings : 1;
    const inputs: Inputs = {
      revenueCents: real.revenueCents, riders: real.riders, bookings: real.bookings, vanTrips: real.vanTrips,
      cardShare, cardPaymentsPerBooking, donationCents: real.donationCents,
    };
    return { avgFareCents, perTrip, inputs };
  }, [real]);

  const realDefaults = () => ({
    riders: String(real?.riders ?? 0),
    avgFare: base ? (base.avgFareCents / 100).toFixed(2) : "0",
    perTrip: base && base.perTrip > 0 ? base.perTrip.toFixed(1) : "8",
  });

  const scenario = useMemo(() => {
    if (!base || !real) return null;
    if (!whatIf) return base.inputs;
    const riders = Math.max(0, Math.round(num(whatIf.riders)));
    const avgFareCents = num(whatIf.avgFare) * 100;
    const perTrip = Math.max(0.1, num(whatIf.perTrip));
    const bookingsPerRider = real.riders > 0 ? real.bookings / real.riders : 0.5;
    const donationPerRider = real.riders > 0 ? real.donationCents / real.riders : 0;
    return {
      ...base.inputs,
      revenueCents: Math.round(riders * avgFareCents),
      riders,
      bookings: Math.round(riders * bookingsPerRider),
      vanTrips: riders > 0 ? Math.ceil(riders / perTrip) : 0,
      donationCents: Math.round(riders * donationPerRider),
    } satisfies Inputs;
  }, [base, real, whatIf]);

  // Real column always uses the SAVED costs; the what-if column uses whatever
  // is on screen (saved or not), so cost changes can be tried before saving.
  const realResult = base ? calc(base.inputs, saved, range.months) : null;
  const ifResult = scenario ? calc(scenario, form, range.months) : null;
  const costsDirty = JSON.stringify(jsonFromForm(form)) !== JSON.stringify(jsonFromForm(saved));
  const isWhatIf = !!whatIf || costsDirty;

  const setFixed = (k: FixedKey, v: string) => setForm((f) => ({ ...f, fixed: { ...f.fixed, [k]: v } }));
  const editWhatIf = (patch: Partial<{ riders: string; avgFare: string; perTrip: string }>) =>
    setWhatIf((w) => ({ ...(w ?? realDefaults()), ...patch }));
  const scaleRiders = (factor: number) => {
    const cur = whatIf ? num(whatIf.riders) : real?.riders ?? 0;
    editWhatIf({ riders: String(Math.round(cur * factor)) });
  };
  const resetAll = () => { setWhatIf(null); setForm(saved); setSaveMsg(null); };

  const saveCosts = async () => {
    setSaving(true); setSaveMsg(null);
    const name = employee ? `${employee.firstName} ${employee.lastName}`.trim() : null;
    const { error } = await sb.from("business_expenses").upsert({
      id: 1, costs: jsonFromForm(form), updated_by: employee?.id ?? null, updated_by_name: name, updated_at: new Date().toISOString(),
    });
    setSaving(false);
    if (error) { setSaveMsg({ ok: false, text: "Couldn't save. Only owners and managers can change costs." }); return; }
    const clean = formFromJson(jsonFromForm(form));
    setSaved(clean); setForm(clean);
    setSavedMeta({ by: name, at: new Date().toISOString() });
    setSaveMsg({ ok: true, text: "Saved. These are now the permanent costs." });
  };

  const w = whatIf ?? realDefaults();
  const rangeLabel = `${formatDateShort(range.start)} – ${formatDateShort(range.end)}`;
  const monthsLabel = range.months === 1 ? "1 month" : `${range.days} days (${range.months.toFixed(2)} mo)`;

  type Row = { label: string; real: string; what: string; strong?: boolean; signed?: boolean; r?: number | null; w?: number | null; sub?: string };
  const profitTone = (v: number | null) => (v === null ? "text-white" : v >= 0 ? "text-green-400" : "text-red-400");
  const rows: Row[] = realResult && ifResult && real && scenario ? [
    { label: "Riders", real: String(real.riders), what: String(scenario.riders), sub: `${real.customers} customers · ${real.bookings} bookings` },
    { label: "Van trips (one way)", real: String(real.vanTrips), what: String(scenario.vanTrips) },
    { label: "Avg paid per rider", real: moneyExact(base!.avgFareCents), what: moneyExact(scenario.riders > 0 ? scenario.revenueCents / scenario.riders : 0) },
    { label: "Revenue", real: money(real.revenueCents), what: money(scenario.revenueCents), strong: true,
      sub: `Tips (${money(real.tipCents)}) go to drivers and are left out${real.refundCents ? ` · refunds ${money(real.refundCents)} taken off` : ""}` },
    { label: `Fixed costs (${monthsLabel})`, real: money(-realResult.fixedCents), what: money(-ifResult.fixedCents) },
    { label: "Fuel", real: money(-realResult.fuelCents), what: money(-ifResult.fuelCents) },
    { label: "Card processing fees", real: money(-realResult.feeCents), what: money(-ifResult.feeCents), sub: "Card payments only (Stripe + Square); cash has no fee" },
    { label: "Military donations", real: money(-real.donationCents), what: money(-scenario.donationCents), sub: `${real.militaryBookings} military booking${real.militaryBookings === 1 ? "" : "s"}` },
    { label: "Total expenses", real: money(-realResult.expenseCents), what: money(-ifResult.expenseCents), strong: true },
    { label: "Profit", real: money(realResult.profitCents), what: money(ifResult.profitCents), strong: true, signed: true, r: realResult.profitCents, w: ifResult.profitCents },
    { label: "Profit margin", real: realResult.margin === null ? "—" : `${Math.round(realResult.margin * 100)}%`, what: ifResult.margin === null ? "—" : `${Math.round(ifResult.margin * 100)}%`, signed: true, r: realResult.margin, w: ifResult.margin },
    { label: "Profit per rider", real: realResult.perRider === null ? "—" : moneyExact(realResult.perRider), what: ifResult.perRider === null ? "—" : moneyExact(ifResult.perRider), signed: true, r: realResult.perRider, w: ifResult.perRider },
    { label: "Profit per month", real: money(realResult.perMonth), what: money(ifResult.perMonth), signed: true, r: realResult.perMonth, w: ifResult.perMonth },
    { label: "Break-even riders", real: realResult.breakEven === null ? "—" : String(realResult.breakEven), what: ifResult.breakEven === null ? "—" : String(ifResult.breakEven), sub: "Riders needed in this period to cover costs" },
  ] : [];

  return (
    <div className="glass rounded-2xl overflow-hidden">
      <div className="px-4 sm:px-6 py-4 border-b border-white/8 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5">
          <Calculator className="w-5 h-5 text-[#FCC300] flex-shrink-0" />
          <div>
            <h2 className="text-white font-bold text-lg">Profit Calculator</h2>
            <p className="text-[#A1A1AA] text-xs">Real riders and revenue for {rangeLabel}, minus your costs. Try what-ifs on the right — they reset when you leave.</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {(Object.keys(PERIOD_LABEL) as Period[]).map((p) => (
            <button key={p} onClick={() => { if (p === period) return; setLoading(true); setWhatIf(null); setPeriod(p); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${period === p ? "bg-[#FCC300] text-[#0A0A0A]" : "bg-white/5 text-[#A1A1AA] hover:text-white"}`}>
              {PERIOD_LABEL[p]}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-px bg-white/6">
        {/* ── Costs ── */}
        <div className="bg-[#0F0F0F] p-4 sm:p-6 xl:col-span-2 space-y-5">
          <div>
            <h3 className="text-white font-semibold text-sm">Monthly costs</h3>
            <p className="text-[#71717A] text-xs mt-0.5">
              {costsLoading ? "Loading…" : savedMeta.at
                ? `Last saved ${formatDateShort(savedMeta.at)}${savedMeta.by ? ` by ${savedMeta.by}` : ""}.`
                : "Not saved yet — enter your costs and press Save."}
            </p>
          </div>
          <div className="space-y-2.5">
            {FIXED_FIELDS.map((f) => (
              <label key={f.key} className="grid grid-cols-[1fr_8.5rem] items-center gap-3">
                <span className="text-[#D4D4D8] text-sm">{f.label}</span>
                <DollarInput value={form.fixed[f.key]} onChange={(v) => setFixed(f.key, v)} />
              </label>
            ))}
            {form.custom.map((c) => (
              <div key={c.id} className="grid grid-cols-[1fr_8.5rem_2rem] items-center gap-2">
                <input value={c.label} placeholder="Expense name" maxLength={60}
                  onChange={(e) => setForm((f) => ({ ...f, custom: f.custom.map((x) => x.id === c.id ? { ...x, label: e.target.value } : x) }))}
                  className={inputCls} />
                <DollarInput value={c.amount}
                  onChange={(v) => setForm((f) => ({ ...f, custom: f.custom.map((x) => x.id === c.id ? { ...x, amount: v } : x) }))} />
                <button aria-label="Remove expense" onClick={() => setForm((f) => ({ ...f, custom: f.custom.filter((x) => x.id !== c.id) }))}
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-[#71717A] hover:text-red-400 hover:bg-red-500/10">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
            <button onClick={() => setForm((f) => ({ ...f, custom: [...f.custom, { id: `n${Date.now()}`, label: "", amount: "" }] }))}
              className="flex items-center gap-1.5 text-[#FCC300] text-xs font-medium hover:underline">
              <Plus className="w-3.5 h-3.5" /> Add another expense
            </button>
            {ifResult && (
              <div className="flex justify-between border-t border-white/8 pt-2.5 text-sm">
                <span className="text-[#A1A1AA]">Monthly total</span>
                <span className="text-white font-semibold">{money(ifResult.monthlyFixedCents)}</span>
              </div>
            )}
          </div>

          <div className="space-y-2.5">
            <h3 className="text-white font-semibold text-sm">Per trip &amp; per payment</h3>
            <label className="grid grid-cols-[1fr_8.5rem] items-center gap-3">
              <span className="text-[#D4D4D8] text-sm">Fuel per van, per one-way trip<span className="block text-[#71717A] text-xs">$50 round trip = $25</span></span>
              <DollarInput value={form.fuelPerTrip} onChange={(v) => setForm((f) => ({ ...f, fuelPerTrip: v }))} />
            </label>
            <label className="grid grid-cols-[1fr_8.5rem] items-center gap-3">
              <span className="text-[#D4D4D8] text-sm">Card processing rate</span>
              <div className="relative">
                <input onFocus={(e) => e.target.select()} inputMode="decimal" value={form.cardPercent}
                  onChange={(e) => setForm((f) => ({ ...f, cardPercent: e.target.value.replace(/[^\d.]/g, "") }))}
                  className={`${inputCls} pr-7`} />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[#71717A] text-sm">%</span>
              </div>
            </label>
            <label className="grid grid-cols-[1fr_8.5rem] items-center gap-3">
              <span className="text-[#D4D4D8] text-sm">Card fee per payment</span>
              <DollarInput value={form.cardFlat} onChange={(v) => setForm((f) => ({ ...f, cardFlat: v }))} />
            </label>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={saveCosts} disabled={!costsDirty || saving}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#FCC300] hover:bg-[#FFD54A] text-[#0A0A0A] text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save as permanent
            </button>
            {costsDirty && (
              <button onClick={() => { setForm(saved); setSaveMsg(null); }}
                className="px-3 py-2 rounded-lg text-sm text-[#A1A1AA] hover:text-white hover:bg-white/5">
                Undo cost changes
              </button>
            )}
          </div>
          {costsDirty && !saveMsg && (
            <p className="text-yellow-400 text-xs">Unsaved — these costs are only used in the What-if column until you save.</p>
          )}
          {saveMsg && <p className={`text-xs ${saveMsg.ok ? "text-green-400" : "text-red-400"}`}>{saveMsg.text}</p>}
        </div>

        {/* ── What-if + results ── */}
        <div className="bg-[#0F0F0F] p-4 sm:p-6 xl:col-span-3 space-y-5">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h3 className="text-white font-semibold text-sm flex items-center gap-1.5"><FlaskConical className="w-4 h-4 text-[#FCC300]" /> What if…</h3>
              <p className="text-[#71717A] text-xs mt-0.5">
                {isWhatIf ? "Playing with the numbers. Real figures are untouched." : "Starts with your real numbers. Change any box to try a scenario."}
              </p>
            </div>
            <button onClick={resetAll} disabled={!isWhatIf}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/15 text-white text-xs hover:bg-white/5 disabled:opacity-40 disabled:cursor-not-allowed">
              <RotateCcw className="w-3.5 h-3.5" /> Reset to real numbers
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label className="space-y-1">
              <span className="text-[#A1A1AA] text-xs">Riders</span>
              <input onFocus={(e) => e.target.select()} inputMode="numeric" value={w.riders} disabled={loading}
                onChange={(e) => editWhatIf({ riders: e.target.value.replace(/\D/g, "") })} className={inputCls} />
            </label>
            <label className="space-y-1">
              <span className="text-[#A1A1AA] text-xs">Avg paid per rider</span>
              <DollarInput value={w.avgFare} onChange={(v) => editWhatIf({ avgFare: v })} />
            </label>
            <label className="space-y-1">
              <span className="text-[#A1A1AA] text-xs">Riders per van trip</span>
              <input onFocus={(e) => e.target.select()} inputMode="decimal" value={w.perTrip} disabled={loading}
                onChange={(e) => editWhatIf({ perTrip: e.target.value.replace(/[^\d.]/g, "") })} className={inputCls} />
            </label>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[#71717A] text-xs mr-1">Riders:</span>
            {[["+10%", 1.1], ["+25%", 1.25], ["+50%", 1.5], ["×2", 2], ["−25%", 0.75]].map(([label, f]) => (
              <button key={label as string} onClick={() => scaleRiders(f as number)} disabled={loading}
                className="px-2.5 py-1 rounded-md bg-white/5 text-[#D4D4D8] text-xs hover:bg-white/10 disabled:opacity-40">{label}</button>
            ))}
          </div>

          {loading || !realResult ? (
            <div className="py-12 flex justify-center"><Loader2 className="w-6 h-6 text-[#FCC300] animate-spin" /></div>
          ) : (
            <div className="rounded-xl border border-white/8 overflow-hidden">
              <div className="grid grid-cols-[1fr_6.5rem_6.5rem] sm:grid-cols-[1fr_8rem_8rem] px-3 sm:px-4 py-2 bg-white/3 text-[#A1A1AA] text-[11px] font-medium uppercase tracking-wider">
                <div>{PERIOD_LABEL[period]}</div><div className="text-right">Real</div><div className="text-right text-[#FCC300]">What-if</div>
              </div>
              <div className="divide-y divide-white/6">
                {rows.map((row) => {
                  const toneR = row.signed ? profitTone(row.r ?? null) : row.strong ? "text-white" : "text-[#D4D4D8]";
                  const toneW = row.signed ? profitTone(row.w ?? null) : row.strong ? "text-white" : "text-[#D4D4D8]";
                  const changed = row.real !== row.what;
                  return (
                    <div key={row.label} className={`grid grid-cols-[1fr_6.5rem_6.5rem] sm:grid-cols-[1fr_8rem_8rem] px-3 sm:px-4 py-2.5 items-center ${row.label === "Profit" ? "bg-[#FCC300]/5" : ""}`}>
                      <div className="min-w-0">
                        <div className={`text-sm ${row.strong ? "text-white font-semibold" : "text-[#D4D4D8]"}`}>{row.label}</div>
                        {row.sub && <div className="text-[#71717A] text-[11px] leading-snug">{row.sub}</div>}
                      </div>
                      <div className={`text-right text-sm tabular-nums ${row.strong ? "font-bold" : ""} ${toneR}`}>{row.real}</div>
                      <div className={`text-right text-sm tabular-nums ${row.strong ? "font-bold" : ""} ${toneW} ${changed ? "" : "opacity-60"}`}>{row.what}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          <p className="text-[#71717A] text-[11px] leading-relaxed">
            Revenue counts bookings (not cancelled) with a departure in this period. Monthly costs are prorated to the period length.
            In What-if, bookings, card fees and military donations grow with riders at today&apos;s rates, and van trips = riders ÷ riders per van trip.
          </p>
        </div>
      </div>
    </div>
  );
}
