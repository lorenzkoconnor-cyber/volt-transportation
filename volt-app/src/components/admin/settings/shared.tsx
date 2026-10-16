"use client";

// Building blocks shared by the Dashboard → Settings cards.

import { useState } from "react";
import { CheckCircle2, AlertCircle, Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FIELD_BY_COLUMN } from "@/lib/settings-fields";

/* eslint-disable @typescript-eslint/no-explicit-any */

export const inputClass =
  "w-24 h-10 rounded-lg bg-white/5 border border-white/10 text-white px-3 text-sm text-right focus:outline-none focus:border-[#FCC300] transition-colors";
export const wideInputClass =
  "w-full h-10 rounded-lg bg-white/5 border border-white/10 text-white px-3 text-sm focus:outline-none focus:border-[#FCC300] transition-colors";

export async function settingsPost(body: Record<string, unknown>): Promise<any> {
  const res = await fetch("/api/settings", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Could not save.");
  return data;
}

export function Card({ icon: Icon, title, description, children }: {
  icon: React.ComponentType<{ className?: string }>; title: string; description?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <div className="glass rounded-2xl p-6 space-y-5">
      <div>
        <h2 className="text-white font-semibold flex items-center gap-2">
          <Icon className="w-4 h-4 text-[#FCC300]" /> {title}
        </h2>
        {description && <p className="text-[#A1A1AA] text-xs mt-1">{description}</p>}
      </div>
      {children}
    </div>
  );
}

export function Notice({ msg }: { msg: { ok: boolean; text: string } | null }) {
  if (!msg) return null;
  return (
    <div className={`flex items-start gap-2 rounded-xl px-4 py-3 border text-sm ${
      msg.ok ? "bg-green-500/10 border-green-500/20 text-green-400" : "bg-red-500/10 border-red-500/20 text-red-400"
    }`}>
      {msg.ok ? <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" /> : <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />}
      <p>{msg.text}</p>
    </div>
  );
}

export function SaveButton({ saving, onClick, label = "Save" }: { saving: boolean; onClick: () => void; label?: string }) {
  return (
    <Button disabled={saving} onClick={onClick} className="bg-[#FCC300] hover:bg-[#FFD54A] text-[#0A0A0A] font-semibold">
      {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
      {label}
    </Button>
  );
}

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}
      className={`relative inline-flex h-6 w-11 flex-shrink-0 rounded-full transition-colors ${on ? "bg-[#FCC300]" : "bg-white/15"}`}
    >
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${on ? "translate-x-5" : "translate-x-0.5"}`} />
    </button>
  );
}

export interface FieldRow {
  column: string;
  title: string;
  help?: string;
  suffix?: React.ReactNode;
  step?: number;
}

/** booking_settings value → what the form edits (money in dollars). */
export function toFormValue(column: string, v: any): any {
  const f = FIELD_BY_COLUMN.get(column);
  if (f?.kind === "money") return typeof v === "number" ? v / 100 : 0;
  return v;
}

/**
 * A card of booking_settings fields with its own Save button — only these
 * fields are sent, so unsaved edits elsewhere on the page are untouched.
 */
export function FieldsCard({
  icon, title, description, rows, settings, onSaved, extraPayload, children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description?: React.ReactNode;
  rows: FieldRow[];
  settings: Record<string, any>;
  onSaved: () => void;
  extraPayload?: () => Record<string, unknown>;
  children?: (values: Record<string, any>) => React.ReactNode;
}) {
  const [values, setValues] = useState<Record<string, any>>(() =>
    Object.fromEntries(rows.map((r) => [r.column, toFormValue(r.column, settings[r.column])])));
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const set = (c: string, v: any) => setValues((p) => ({ ...p, [c]: v }));

  const save = async () => {
    const blank = rows.find((r) => typeof values[r.column] === "number" && !Number.isFinite(values[r.column]));
    if (blank) { setMsg({ ok: false, text: `Fill in "${blank.title}".` }); return; }
    setSaving(true);
    setMsg(null);
    try {
      const data = await settingsPost({ action: "save_general", values, ...(extraPayload?.() ?? {}) });
      setMsg({ ok: true, text: data.changed ? "Saved — the website uses the new values right away." : "No changes to save." });
      onSaved();
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : "Could not save." });
    }
    setSaving(false);
  };

  return (
    <Card icon={icon} title={title} description={description}>
      {rows.map((r) => {
        const f = FIELD_BY_COLUMN.get(r.column)!;
        const v = values[r.column];
        return (
          <div key={r.column} className="space-y-2">
            <div>
              <div className="text-white text-sm font-medium">{r.title}</div>
              {r.help && <div className="text-[#A1A1AA] text-xs">{r.help}</div>}
            </div>
            <div className="flex items-center gap-2 flex-wrap text-sm text-[#A1A1AA]">
              {f.kind === "bool" ? (
                <Toggle on={!!v} onChange={(x) => set(r.column, x)} label={r.title} />
              ) : f.kind === "money" || f.kind === "int" ? (
                <>
                  {f.kind === "money" && <span>$</span>}
                  <input
                    type="number" min={f.min} max={f.max} step={r.step ?? (f.kind === "money" ? 0.5 : 1)}
                    value={Number.isFinite(v) ? v : ""}
                    onChange={(e) => set(r.column, e.target.value === "" ? NaN : Number(e.target.value))}
                    className={inputClass}
                  />
                </>
              ) : (
                <input
                  type={f.kind === "email" ? "email" : f.kind === "phone" ? "tel" : "text"}
                  maxLength={f.maxLength} value={v ?? ""} onChange={(e) => set(r.column, e.target.value)}
                  className={`${wideInputClass} max-w-md`}
                />
              )}
              {r.suffix && <span>{r.suffix}</span>}
            </div>
          </div>
        );
      })}
      {children?.(values)}
      <Notice msg={msg} />
      <SaveButton saving={saving} onClick={save} />
    </Card>
  );
}
