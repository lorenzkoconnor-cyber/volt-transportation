"use client";

import { useEffect, useState, useCallback } from "react";
import { formatDateShort } from "@/lib/format";
import {
  DISCOUNT_CODE_DAYS, CUSTOM_CODE_MAX, CUSTOM_CODE_MIN, codeLabel, codeState, formatCode,
  type CodeState, type DiscountCodeType,
} from "@/lib/discount-codes";
import { Ticket, Loader2, Copy, Check, Ban, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/* eslint-disable @typescript-eslint/no-explicit-any */

const STATE_STYLES: Record<CodeState, string> = {
  active:  "bg-green-500/15 text-green-400",
  used:    "bg-blue-500/15 text-blue-400",
  expired: "bg-[#A1A1AA]/15 text-[#A1A1AA]",
  revoked: "bg-red-500/15 text-red-400",
};

function timeLeft(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  const h = Math.floor(ms / 3_600_000);
  return h >= 24 ? `${Math.floor(h / 24)}d ${h % 24}h left` : `${Math.max(1, h)}h left`;
}

export default function DiscountCodesPage() {
  const [codes, setCodes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [type, setType] = useState<DiscountCodeType>("percent");
  const [value, setValue] = useState("");
  const [note, setNote] = useState("");
  const [customCode, setCustomCode] = useState("");
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState("");
  const [created, setCreated] = useState<any>(null);
  const [copied, setCopied] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/discount-codes");
    const data = await res.json().catch(() => ({}));
    if (!res.ok) setLoadError(data.error ?? "Could not load codes.");
    else { setCodes(data.codes ?? []); setLoadError(""); }
    setLoading(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/discount-codes")
      .then(async (res) => ({ ok: res.ok, data: await res.json().catch(() => ({})) }))
      .then(({ ok, data }) => {
        if (cancelled) return;
        if (!ok) setLoadError(data.error ?? "Could not load codes.");
        else setCodes(data.codes ?? []);
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    setCreating(true);
    try {
      const res = await fetch("/api/discount-codes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, value: Number(value), note, customCode }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not create the code.");
      setCreated(data.code);
      setCopied(false);
      setValue("");
      setNote("");
      setCustomCode("");
      load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Could not create the code.");
    }
    setCreating(false);
  };

  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(true); } catch { /* clipboard blocked */ }
  };

  const revoke = async (id: string) => {
    if (!window.confirm("Cancel this code? The customer won't be able to use it.")) return;
    setRevokingId(id);
    const res = await fetch("/api/discount-codes", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action: "revoke" }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      window.alert(data.error ?? "Could not cancel the code.");
    }
    setRevokingId(null);
    load();
  };

  const numericValue = Number(value);
  const preview = value && numericValue > 0
    ? codeLabel({ type, value: type === "percent" ? numericValue : Math.round(numericValue * 100) })
    : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Ticket className="w-6 h-6 text-[#FCC300]" />
          Discount Codes
        </h1>
        <p className="text-[#A1A1AA] text-sm mt-0.5">
          One-time codes for customers who need an exception beyond the standard discount. Each code works for{" "}
          <strong className="text-white">one booking only</strong> and <strong className="text-white">expires after {DISCOUNT_CODE_DAYS} days</strong>.
          The customer enters it at checkout; it replaces the Military Discount, and a code covering the whole fare
          books the trip free.
        </p>
      </div>

      {/* Create */}
      <form onSubmit={create} className="glass rounded-2xl p-6 space-y-4">
        <h2 className="text-white font-semibold flex items-center gap-2"><Plus className="w-4 h-4 text-[#FCC300]" />New code</h2>
        <div className="grid sm:grid-cols-3 gap-4">
          <div>
            <Label className="text-[#A1A1AA] text-xs mb-1.5 block">Discount type</Label>
            <div className="grid grid-cols-2 gap-2">
              {(["percent", "fixed"] as DiscountCodeType[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  className={`rounded-xl border px-3 h-10 text-sm transition-colors ${
                    type === t ? "border-[#FCC300] bg-[#FCC300]/10 text-white" : "border-white/10 text-[#A1A1AA] hover:border-white/25"
                  }`}
                >
                  {t === "percent" ? "% off" : "$ off"}
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label className="text-[#A1A1AA] text-xs mb-1.5 block">
              {type === "percent" ? "Percent off (1–100)" : "Dollars off"}
            </Label>
            <Input
              type="number"
              required
              min={type === "percent" ? 1 : 1}
              max={type === "percent" ? 100 : 1000}
              step={type === "percent" ? 1 : 0.01}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={type === "percent" ? "25" : "20.00"}
              className="bg-white/5 border-white/10 text-white h-10 rounded-xl focus:border-[#FCC300]"
            />
          </div>
          <div>
            <Label className="text-[#A1A1AA] text-xs mb-1.5 block">Who it&apos;s for / why</Label>
            <Input
              required
              maxLength={300}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Jane Smith — missed van, rebooking"
              className="bg-white/5 border-white/10 text-white h-10 rounded-xl focus:border-[#FCC300]"
            />
          </div>
        </div>
        <div className="sm:max-w-xs">
          <Label className="text-[#A1A1AA] text-xs mb-1.5 block">Custom code (optional)</Label>
          <Input
            value={customCode}
            onChange={(e) => setCustomCode(e.target.value.toUpperCase())}
            maxLength={CUSTOM_CODE_MAX + 4}
            placeholder="Leave blank to auto-generate"
            autoComplete="off"
            className="bg-white/5 border-white/10 text-white h-10 rounded-xl font-mono tracking-wider focus:border-[#FCC300]"
          />
          <p className="text-[#A1A1AA] text-[11px] mt-1.5 leading-snug">
            {CUSTOM_CODE_MIN}–{CUSTOM_CODE_MAX} letters or numbers. Auto-generated codes are safer — anyone who has
            the code can use it, and simple words are easier to guess.
          </p>
        </div>
        {formError && <p className="text-red-400 text-xs bg-red-500/10 rounded-lg px-3 py-2">{formError}</p>}
        <div className="flex items-center gap-3 flex-wrap">
          <Button type="submit" disabled={creating}
            className="bg-[#FCC300] hover:bg-[#FFD54A] text-[#0A0A0A] font-semibold rounded-xl">
            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : "Create code"}
          </Button>
          {preview && (
            <span className="text-[#A1A1AA] text-xs">
              {preview}{type === "percent" && numericValue === 100 ? " — the booking will be free" : ""}
            </span>
          )}
        </div>

        {created && (
          <div className="flex items-center justify-between gap-4 flex-wrap bg-green-500/10 border border-green-500/25 rounded-xl p-4">
            <div>
              <div className="text-green-400 text-xs font-medium">Code created — give this to the customer</div>
              <div className="text-white text-2xl font-bold font-mono tracking-widest mt-1">{formatCode(created.code)}</div>
              <div className="text-[#A1A1AA] text-xs mt-0.5">
                {codeLabel({ type: created.discount_type, value: created.value })} · one use · expires{" "}
                {new Date(created.expires_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
              </div>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => copy(formatCode(created.code))}
              className="border-white/15 text-white hover:bg-white/5">
              {copied ? <><Check className="w-3.5 h-3.5 mr-1.5" />Copied</> : <><Copy className="w-3.5 h-3.5 mr-1.5" />Copy</>}
            </Button>
          </div>
        )}
      </form>

      {/* List */}
      <div className="glass rounded-2xl overflow-hidden">
        {loading ? (
          <div className="p-16 flex justify-center"><Loader2 className="w-8 h-8 text-[#FCC300] animate-spin" /></div>
        ) : loadError ? (
          <p className="p-6 text-red-400 text-sm">{loadError}</p>
        ) : codes.length === 0 ? (
          <div className="p-12 text-center">
            <Ticket className="w-10 h-10 text-[#A1A1AA] mx-auto mb-3" />
            <p className="text-white font-medium mb-1">No codes yet</p>
            <p className="text-[#A1A1AA] text-sm">Codes you create appear here with their status.</p>
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {codes.map((c) => {
              const state = codeState(c);
              return (
                <div key={c.id} className="px-5 py-4 flex items-center gap-4 flex-wrap">
                  <div className="font-mono text-white font-semibold tracking-wider min-w-28 break-all">{formatCode(c.code)}</div>
                  <div className="text-white text-sm w-24">{codeLabel({ type: c.discount_type, value: c.value })}</div>
                  <div className="flex-1 min-w-[160px]">
                    <div className="text-white text-sm">{c.note}</div>
                    <div className="text-[#A1A1AA] text-xs">
                      {c.creator ? `${c.creator.first_name} ${c.creator.last_name}` : "—"} · {formatDateShort(c.created_at)}
                    </div>
                  </div>
                  <div className="text-xs text-[#A1A1AA] w-36">
                    {state === "active" && timeLeft(c.expires_at)}
                    {state === "used" && (c.reservation?.confirmation_number ? `Used on ${c.reservation.confirmation_number}` : "Used")}
                    {state === "expired" && `Expired ${formatDateShort(c.expires_at)}`}
                    {state === "revoked" && "Cancelled"}
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${STATE_STYLES[state]}`}>
                    {state === "revoked" ? "cancelled" : state}
                  </span>
                  <div className="w-16 flex justify-end">
                    {state === "active" && (
                      <button
                        onClick={() => revoke(c.id)}
                        disabled={revokingId === c.id}
                        className="text-[#A1A1AA] hover:text-red-400 text-xs flex items-center gap-1 transition-colors"
                      >
                        <Ban className="w-3 h-3" />Cancel
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
