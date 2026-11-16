"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { formatCents, formatDateShort, formatTime12h, formatEasternDateTime } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { AlertTriangle, CheckCircle2, HandCoins, Loader2, Undo2 } from "lucide-react";
import type { TipShare } from "@/lib/driver-tips";

/* eslint-disable @typescript-eslint/no-explicit-any */

// Driver Tips: what each driver has earned in tips and what's still owed.
// Owners/managers mark tips paid once the driver has been handed the money;
// a tip stays unpaid until then. Drivers see only their own.

interface DriverRow { driverId: string | null; name: string; earnedCents: number; paidCents: number; owedCents: number }
interface Batch { batchId: string; driverId: string; driverName: string; amountCents: number; tips: number; paidBy: string; paidAt: string }

type Show = "unpaid" | "paid" | "all";

async function post(body: unknown) {
  const res = await fetch("/api/driver-tips", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "That didn't save.");
  return data;
}

export default function DriverTipsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [role, setRole] = useState<string>("");
  const [notLinked, setNotLinked] = useState("");
  const [ledgerMissing, setLedgerMissing] = useState(false);
  const [feePercent, setFeePercent] = useState<number | null>(null);
  const [feeInput, setFeeInput] = useState("");
  const [shares, setShares] = useState<TipShare[]>([]);
  const [drivers, setDrivers] = useState<DriverRow[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [show, setShow] = useState<Show>("unpaid");
  const [driverFilter, setDriverFilter] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  // Inline confirm: { driverId, keys?, cents, label }
  const [confirm, setConfirm] = useState<{ driverId: string; keys?: string[]; cents: number; label: string } | null>(null);

  const isManager = role === "owner" || role === "manager";
  const canPay = isManager && !ledgerMissing;

  const load = useCallback(async () => {
    setError("");
    try {
      const res = await fetch("/api/driver-tips", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Couldn't load driver tips.");
      setRole(data.role ?? "");
      setNotLinked(data.notLinked ?? "");
      setLedgerMissing(!!data.ledgerMissing);
      setFeePercent(data.feePercent);
      setFeeInput(data.feePercent != null ? String(data.feePercent) : "");
      setShares(data.shares ?? []);
      setDrivers(data.drivers ?? []);
      setBatches(data.batches ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load driver tips.");
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const visible = useMemo(() => shares.filter((s) => {
    if (driverFilter !== "all" && (s.driverId ?? "none") !== driverFilter) return false;
    if (from && s.date < from) return false;
    if (to && s.date > to) return false;
    if (show === "unpaid") return s.owedCents !== 0 || !s.driverId;
    if (show === "paid") return s.driverId && s.owedCents === 0;
    return true;
  }), [shares, driverFilter, from, to, show]);

  const totals = visible.reduce((t, s) => ({ gross: t.gross + s.grossCents, fee: t.fee + s.feeCents, net: t.net + s.netCents }), { gross: 0, fee: 0, net: 0 });

  const doPay = async () => {
    if (!confirm) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const d = await post({ action: "pay", driverId: confirm.driverId, keys: confirm.keys, expectedCents: confirm.cents });
      setNotice(`Marked ${formatCents(d.paidCents)} paid to ${confirm.label} (${d.tips} tip${d.tips === 1 ? "" : "s"}).`);
      setConfirm(null);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "That didn't save."); }
    setBusy(false);
  };

  const undo = async (b: Batch) => {
    if (!window.confirm(`Undo the ${formatCents(b.amountCents)} payout to ${b.driverName}? Those tips will show as unpaid again.`)) return;
    setBusy(true); setError(""); setNotice("");
    try { await post({ action: "undo", batchId: b.batchId }); setNotice("Payout undone — those tips are unpaid again."); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : "That didn't save."); }
    setBusy(false);
  };

  const saveFee = async () => {
    setBusy(true); setError(""); setNotice("");
    try { await post({ action: "fee", percent: parseFloat(feeInput) }); setNotice("Card fee saved."); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : "That didn't save."); }
    setBusy(false);
  };

  if (loading) {
    return <div className="flex justify-center py-24"><Loader2 className="w-6 h-6 text-[#FCC300] animate-spin" /></div>;
  }

  const ready = !!role && !notLinked;   // loaded, and (for a driver) linked to a driver profile
  const unassigned = drivers.find((d) => !d.driverId);
  const named = drivers.filter((d) => d.driverId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2"><HandCoins className="w-6 h-6 text-[#FCC300]" />{isManager ? "Driver Tips" : "My Tips"}</h1>
        <p className="text-[#A1A1AA] text-sm mt-1 max-w-3xl">
          Each tip goes to the driver of the trip the rider took. Round trips are split evenly between the outbound and return drivers.
          Card tips pay the driver the tip minus the {feePercent ?? "—"}% card fee. A tip counts once the trip has run and the booking is paid,
          and it stays <span className="text-white">unpaid</span> until {isManager ? "you mark it paid" : "the owner or a manager marks it paid"}.
        </p>
      </div>

      {ledgerMissing && isManager && (
        <div className="bg-orange-500/10 border border-orange-400/30 rounded-xl px-4 py-3 text-orange-300 text-sm">
          Preview: the database update for tip payouts (migration 041) isn&apos;t applied yet, so tips can&apos;t be marked paid and the card fee is fixed at 2.9%.
        </div>
      )}
      {notLinked && <div className="glass rounded-xl p-4 text-[#A1A1AA] text-sm">{notLinked}</div>}
      {error && <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-red-400 text-sm">{error}</div>}
      {notice && <div className="bg-green-500/10 border border-green-500/20 rounded-xl px-4 py-3 text-green-400 text-sm flex items-center gap-2"><CheckCircle2 className="w-4 h-4" />{notice}</div>}

      {/* Owed per driver */}
      {ready && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {named.length === 0 && <div className="glass rounded-xl p-5 text-[#A1A1AA] text-sm">No tips earned yet.</div>}
          {named.map((d) => (
            <div key={d.driverId} className="glass rounded-xl p-5">
              <div className="text-white font-semibold">{d.name}</div>
              <div className="mt-2 text-3xl font-bold tabular-nums text-[#FCC300]">{formatCents(d.owedCents)}</div>
              <div className="text-[#A1A1AA] text-xs">owed · {formatCents(d.earnedCents)} earned · {formatCents(d.paidCents)} paid</div>
              {canPay && d.owedCents > 0 && (
                confirm && confirm.driverId === d.driverId && !confirm.keys ? (
                  <ConfirmBox text={`Mark ${formatCents(confirm.cents)} as paid to ${d.name}? Only do this once they have the money.`}
                    busy={busy} onYes={doPay} onNo={() => setConfirm(null)} />
                ) : (
                  <Button size="sm" disabled={busy} onClick={() => setConfirm({ driverId: d.driverId!, cents: d.owedCents, label: d.name })}
                    className="mt-3 bg-[#FCC300] hover:bg-[#FFD54A] text-[#0A0A0A] font-semibold">
                    Mark {formatCents(d.owedCents)} paid
                  </Button>
                )
              )}
            </div>
          ))}
          {isManager && unassigned && (
            <div className="rounded-xl p-5 border border-orange-400/40 bg-orange-500/10">
              <div className="text-orange-300 font-semibold flex items-center gap-1.5"><AlertTriangle className="w-4 h-4" />No driver assigned</div>
              <div className="mt-2 text-2xl font-bold tabular-nums text-white">{formatCents(unassigned.earnedCents)}</div>
              <div className="text-[#D4D4D8] text-xs">in tips on trips with no driver on the van. Assign the driver on Dispatch (pick that date) and the tips move to them.</div>
            </div>
          )}
        </div>
      )}

      {/* Filters */}
      {ready && (
        <div className="flex flex-wrap items-end gap-3">
          <div className="inline-flex rounded-xl border border-white/10 bg-white/5 p-1 gap-1">
            {(["unpaid", "paid", "all"] as Show[]).map((k) => (
              <button key={k} onClick={() => setShow(k)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium capitalize ${show === k ? "bg-[#FCC300] text-[#0A0A0A]" : "text-[#A1A1AA] hover:text-white"}`}>
                {k}
              </button>
            ))}
          </div>
          {isManager && (
            <select value={driverFilter} onChange={(e) => setDriverFilter(e.target.value)}
              className="h-9 bg-white/5 border border-white/10 text-white rounded-xl px-3 text-sm focus:outline-none focus:border-[#FCC300]">
              <option value="all" className="bg-[#171717]">All drivers</option>
              {drivers.map((d) => <option key={d.driverId ?? "none"} value={d.driverId ?? "none"} className="bg-[#171717]">{d.name}</option>)}
            </select>
          )}
          <label className="text-[#A1A1AA] text-xs">From
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
              className="ml-1.5 h-9 rounded-xl bg-white/5 border border-white/10 text-white px-2 text-sm [color-scheme:dark]" />
          </label>
          <label className="text-[#A1A1AA] text-xs">To
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
              className="ml-1.5 h-9 rounded-xl bg-white/5 border border-white/10 text-white px-2 text-sm [color-scheme:dark]" />
          </label>
          {(from || to) && <button onClick={() => { setFrom(""); setTo(""); }} className="text-[#A1A1AA] hover:text-white text-xs pb-2">Clear dates</button>}
        </div>
      )}

      {/* Tip list */}
      {ready && (
        <div className="glass rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="text-[#A1A1AA] text-xs uppercase tracking-wider border-b border-white/8">
                  <th className="text-left font-medium px-4 py-3">Trip</th>
                  <th className="text-left font-medium px-4 py-3">Booking</th>
                  {isManager && <th className="text-left font-medium px-4 py-3">Driver</th>}
                  <th className="text-right font-medium px-4 py-3">Tip</th>
                  <th className="text-right font-medium px-4 py-3">Card fee</th>
                  <th className="text-right font-medium px-4 py-3">Driver gets</th>
                  <th className="text-left font-medium px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {visible.length === 0 && (
                  <tr><td colSpan={7} className="px-4 py-10 text-center text-[#A1A1AA]">
                    {show === "unpaid" ? "Nothing unpaid — all caught up." : "No tips match."}
                  </td></tr>
                )}
                {visible.map((s) => (
                  <tr key={s.key} className="align-top">
                    <td className="px-4 py-3">
                      <div className="text-white">{formatDateShort(s.date)} · {formatTime12h(s.time)}</div>
                      <div className="text-[#A1A1AA] text-xs">{s.route}{s.roundTrip ? ` · ${s.leg === "out" ? "outbound" : "return"} half` : ""}</div>
                    </td>
                    <td className="px-4 py-3">
                      {isManager
                        ? <Link href={`/dashboard/reservations/${s.reservationId}`} className="text-[#FCC300] font-mono text-xs hover:underline">{s.confirmation}</Link>
                        : <span className="text-[#FCC300] font-mono text-xs">{s.confirmation}</span>}
                      <div className="text-[#A1A1AA] text-xs">{s.customer}</div>
                    </td>
                    {isManager && <td className={`px-4 py-3 ${s.driverId ? "text-white" : "text-orange-300"}`}>{s.driverName}</td>}
                    <td className="px-4 py-3 text-right tabular-nums text-white">{formatCents(s.grossCents)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-[#A1A1AA]">{s.feeCents ? `−${formatCents(s.feeCents)}` : "—"}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-white font-semibold">{formatCents(s.netCents)}</td>
                    <td className="px-4 py-3">
                      {!s.driverId ? <span className="text-orange-300 text-xs">Assign a driver</span>
                        : s.owedCents === 0 ? <span className="text-green-400 text-xs font-medium">Paid</span>
                        : (
                          <div className="space-y-1.5">
                            <span className="text-yellow-300 text-xs font-medium">
                              Unpaid{s.paidCents ? ` (${formatCents(s.owedCents)} left)` : ""}
                            </span>
                            {canPay && s.owedCents > 0 && (
                              confirm?.keys?.[0] === s.key ? (
                                <ConfirmBox text={`Mark ${formatCents(s.owedCents)} paid to ${s.driverName}?`} busy={busy} onYes={doPay} onNo={() => setConfirm(null)} />
                              ) : (
                                <button disabled={busy} onClick={() => setConfirm({ driverId: s.driverId!, keys: [s.key], cents: s.owedCents, label: s.driverName })}
                                  className="block text-[#FCC300] hover:text-[#FFD54A] text-xs font-medium">
                                  Mark paid
                                </button>
                              )
                            )}
                          </div>
                        )}
                    </td>
                  </tr>
                ))}
              </tbody>
              {visible.length > 0 && (
                <tfoot>
                  <tr className="border-t border-white/10 text-white font-semibold">
                    <td className="px-4 py-3" colSpan={isManager ? 3 : 2}>{visible.length} tip{visible.length === 1 ? "" : "s"}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatCents(totals.gross)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-[#A1A1AA]">−{formatCents(totals.fee)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatCents(totals.net)}</td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      {/* Payout history */}
      {batches.length > 0 && (
        <div className="glass rounded-2xl p-5">
          <h2 className="text-white font-semibold mb-3">Payouts</h2>
          <ul className="divide-y divide-white/5">
            {batches.map((b) => {
              const at = formatEasternDateTime(b.paidAt);
              return (
                <li key={b.batchId} className="py-2.5 flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span className="text-white">
                    {formatCents(b.amountCents)} to {b.driverName}
                    <span className="text-[#A1A1AA]"> · {b.tips} tip{b.tips === 1 ? "" : "s"} · {at.date} {at.time}{b.paidBy ? ` · by ${b.paidBy}` : ""}</span>
                  </span>
                  {isManager && (
                    <button disabled={busy} onClick={() => undo(b)} className="text-[#A1A1AA] hover:text-white text-xs flex items-center gap-1">
                      <Undo2 className="w-3.5 h-3.5" />Undo
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Card fee setting */}
      {canPay && (
        <div className="glass rounded-2xl p-5 flex flex-wrap items-end gap-3">
          <div>
            <label className="text-[#A1A1AA] text-xs mb-1.5 block">Card fee taken out of card tips (%)</label>
            <input type="number" min={0} max={20} step="0.1" value={feeInput} onChange={(e) => setFeeInput(e.target.value)}
              className="w-28 h-10 rounded-xl bg-white/5 border border-white/10 text-white px-3 text-sm focus:outline-none focus:border-[#FCC300]" />
          </div>
          <Button size="sm" disabled={busy || feeInput === String(feePercent)} onClick={saveFee}
            className="bg-white/10 hover:bg-white/15 text-white h-10">Save</Button>
          <p className="text-[#71717A] text-xs max-w-md">Stripe charges about 2.9% online; Square Terminal about 2.6%. Cash tips are never reduced. A change applies to every tip; money already handed to a driver is never taken back.</p>
        </div>
      )}
    </div>
  );
}

function ConfirmBox({ text, busy, onYes, onNo }: { text: string; busy: boolean; onYes: () => void; onNo: () => void }) {
  return (
    <div className="mt-3 rounded-lg border border-[#FCC300]/40 bg-[#FCC300]/10 p-3 space-y-2">
      <p className="text-white text-xs">{text}</p>
      <div className="flex gap-2">
        <Button size="sm" disabled={busy} onClick={onYes} className="bg-[#FCC300] hover:bg-[#FFD54A] text-[#0A0A0A] text-xs font-semibold h-8">
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Yes, mark paid"}
        </Button>
        <Button size="sm" variant="outline" disabled={busy} onClick={onNo} className="border-white/15 text-white hover:bg-white/5 text-xs h-8">Cancel</Button>
      </div>
    </div>
  );
}
