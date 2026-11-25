import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/staff-booking";
import { driverForEmployee } from "@/lib/driver-runs-server";
import { easternToday } from "@/lib/format";
import { shareKeyOf, tipShares, type TipShare } from "@/lib/driver-tips";

/* eslint-disable @typescript-eslint/no-explicit-any */

// GET  /api/driver-tips             → tip shares + what's owed per driver
//      Owners/managers see every driver; a driver sees only their own.
// POST { action: "pay", driverId, expectedCents, keys? }
//                                   → owner/manager: mark what's owed to that driver (or just `keys`) as paid
// POST { action: "undo", batchId }  → owner/manager: undo a "mark paid"
// POST { action: "fee", percent }   → owner/manager: card fee taken out of card tips

const MANAGERS = ["owner", "manager"];
const UUID_RE = /^[0-9a-f-]{36}$/i;

const LEG_TRIP =
  "id, departure_date, departure_time, status, route:routes(name), " +
  "trip_vehicles(driver:drivers(id, first_name, last_name))";

async function loadAll(sb: any) {
  const [settingsRes, resvRes, payoutRes] = await Promise.all([
    sb.from("booking_settings").select("tip_card_fee_percent").maybeSingle(),
    sb.from("reservations")
      .select(
        "id, confirmation_number, status, tip_cents, is_round_trip, deleted_at, " +
        "customer:customers(first_name, last_name), " +
        "payments(method, status, amount_cents, refund_amount_cents, is_tip), " +
        `trip:trips!reservations_trip_id_fkey(${LEG_TRIP}), ` +
        `return_trip:trips!reservations_return_trip_id_fkey(${LEG_TRIP})`,
      )
      .gt("tip_cents", 0)
      .is("deleted_at", null)
      .limit(10000),
    sb.from("driver_tip_payouts")
      .select("id, batch_id, driver_id, share_key, amount_cents, paid_by_name, created_at, driver:drivers(first_name, last_name)")
      .order("created_at", { ascending: false })
      .limit(10000),
  ]);
  if (resvRes.error) throw resvRes.error;
  // Before migration 041 the payout table doesn't exist yet: show tips, nothing paid.
  const ledgerMissing = !!payoutRes.error && ["42P01", "PGRST205"].includes(payoutRes.error.code);
  if (payoutRes.error && !ledgerMissing) throw payoutRes.error;
  const feePercent = Number(settingsRes.data?.tip_card_fee_percent ?? 2.9);
  const paid: Record<string, number> = {};
  for (const p of payoutRes.data ?? []) {
    const k = `${p.share_key}|${p.driver_id}`;
    paid[k] = (paid[k] ?? 0) + p.amount_cents;
  }
  const shares = tipShares(resvRes.data ?? [], { feePercent, today: easternToday(), paid });
  return { feePercent, shares, payouts: payoutRes.data ?? [], ledgerMissing };
}

function summarize(shares: TipShare[]) {
  const by: Record<string, { driverId: string | null; name: string; earnedCents: number; paidCents: number; owedCents: number }> = {};
  for (const s of shares) {
    const k = s.driverId ?? "none";
    const row = by[k] ?? (by[k] = { driverId: s.driverId, name: s.driverName, earnedCents: 0, paidCents: 0, owedCents: 0 });
    row.earnedCents += s.netCents;
    row.paidCents += s.paidCents;
    row.owedCents += s.owedCents;
  }
  return Object.values(by).sort((a, b) => (a.driverId ? 0 : 1) - (b.driverId ? 0 : 1) || b.owedCents - a.owedCents);
}

function batches(payouts: any[]) {
  const by: Record<string, any> = {};
  for (const p of payouts) {
    const b = by[p.batch_id] ?? (by[p.batch_id] = {
      batchId: p.batch_id, driverId: p.driver_id,
      driverName: p.driver ? `${p.driver.first_name} ${p.driver.last_name ?? ""}`.trim() : "Driver",
      amountCents: 0, tips: 0, paidBy: p.paid_by_name ?? "", paidAt: p.created_at,
    });
    b.amountCents += p.amount_cents;
    b.tips += 1;
  }
  return Object.values(by).sort((a: any, b: any) => (a.paidAt < b.paidAt ? 1 : -1));
}

export async function GET() {
  const ctx = await requireStaff([...MANAGERS, "driver"]);
  if (ctx instanceof NextResponse) return ctx;
  try {
    const isDriver = ctx.employee.role === "driver";
    const me = isDriver ? await driverForEmployee(ctx.sb, ctx.employee.id) : null;
    if (isDriver && !me) {
      return NextResponse.json({
        role: ctx.employee.role, shares: [], drivers: [], batches: [], feePercent: null,
        notLinked: "Your login isn't connected to a driver profile yet. Ask the owner or a manager to link it on the Drivers page.",
      });
    }
    const { feePercent, shares, payouts, ledgerMissing } = await loadAll(ctx.sb);
    const mine = isDriver ? shares.filter((s) => s.driverId === me.id) : shares;
    const myPayouts = isDriver ? payouts.filter((p: any) => p.driver_id === me.id) : payouts;
    return NextResponse.json({
      role: ctx.employee.role,
      feePercent,
      shares: mine,
      drivers: summarize(mine),
      batches: batches(myPayouts),
      ledgerMissing,
    });
  } catch (err) {
    console.error("[driver-tips] load", err);
    return NextResponse.json({ error: "Couldn't load driver tips." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const ctx = await requireStaff(MANAGERS);
  if (ctx instanceof NextResponse) return ctx;
  const body = await request.json().catch(() => ({}));
  try {
    if (body.action === "fee") {
      const pct = Number(body.percent);
      if (!(pct >= 0 && pct <= 20)) return NextResponse.json({ error: "Enter a fee between 0% and 20%." }, { status: 400 });
      const { error } = await ctx.sb.from("booking_settings").update({ tip_card_fee_percent: Math.round(pct * 100) / 100 }).eq("id", true);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    if (body.action === "undo") {
      if (!UUID_RE.test(body.batchId ?? "")) return NextResponse.json({ error: "Payout not found." }, { status: 404 });
      const { error } = await ctx.sb.from("driver_tip_payouts").delete().eq("batch_id", body.batchId);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    if (body.action === "pay") {
      if (!UUID_RE.test(body.driverId ?? "")) return NextResponse.json({ error: "Pick a driver." }, { status: 400 });
      const { shares } = await loadAll(ctx.sb);
      // Optional `keys`: only these tips (a single row's "Mark paid"); else everything owed.
      const only: Set<string> | null = Array.isArray(body.keys) ? new Set(body.keys.map(String)) : null;
      const owed = shares.filter((s) => s.driverId === body.driverId && s.owedCents !== 0 && (!only || only.has(s.key)));
      const total = owed.reduce((n, s) => n + s.owedCents, 0);
      // The page shows the amount it's marking paid — refuse if it changed meanwhile.
      if (Number.isFinite(Number(body.expectedCents)) && Number(body.expectedCents) !== total) {
        return NextResponse.json({ error: "The amount owed just changed. Refresh and check it again." }, { status: 409 });
      }
      if (!owed.length || total <= 0) return NextResponse.json({ error: "Nothing is owed to this driver." }, { status: 400 });
      const batchId = crypto.randomUUID();
      const rows = owed.map((s) => ({
        batch_id: batchId, driver_id: s.driverId, share_key: shareKeyOf(s.key), reservation_id: s.reservationId,
        amount_cents: s.owedCents, paid_by: ctx.employee.id, paid_by_name: ctx.employee.name,
      }));
      const { error } = await ctx.sb.from("driver_tip_payouts").insert(rows);
      if (error) throw error;
      return NextResponse.json({ ok: true, batchId, paidCents: total, tips: rows.length });
    }

    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (err) {
    console.error("[driver-tips] action", err);
    return NextResponse.json({ error: "That didn't save. Try again." }, { status: 500 });
  }
}
