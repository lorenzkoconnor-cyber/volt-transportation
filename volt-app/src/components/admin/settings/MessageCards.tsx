"use client";

// Settings → Messages: editable wording for customer texts/emails, the
// message health panel, and (exported for the History tab) the change log.

import { useCallback, useEffect, useState } from "react";
import { MessageSquareText, Activity, History, RotateCcw, Send, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DEFAULT_TEMPLATES, TEMPLATES, mergeTemplate, renderTemplate, unknownPlaceholders,
  type TemplateKey, type TemplateOverride,
} from "@/lib/message-templates";
import { useAppSettings } from "@/context/SettingsContext";
import { Card, Notice, SaveButton, settingsPost } from "./shared";

/* eslint-disable @typescript-eslint/no-explicit-any */

const areaClass =
  "w-full rounded-lg bg-white/5 border border-white/10 text-white px-3 py-2 text-sm font-mono focus:outline-none focus:border-[#FCC300] transition-colors";

export function TemplatesCard({ overrides, onSaved }: { overrides: TemplateOverride[]; onSaved: () => void }) {
  const settings = useAppSettings();
  const [key, setKey] = useState<TemplateKey>("confirmation");
  const info = TEMPLATES.find((t) => t.key === key)!;
  const load = (k: TemplateKey) => mergeTemplate(k, overrides.find((o) => o.key === k));
  const [text, setText] = useState(() => load("confirmation"));
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const customized = overrides.some((o) => o.key === key);

  const pick = (k: TemplateKey) => { setKey(k); setText(load(k)); setMsg(null); };
  const sample = { ...info.sample, phone: settings.business.phone, arrive_minutes: String(settings.arriveEarlyMinutes) };
  const unknown = unknownPlaceholders(key, `${text.sms}\n${text.emailSubject}\n${text.emailBody}`);

  const save = async () => {
    setSaving(true);
    setMsg(null);
    try {
      const d = await settingsPost({ action: "save_template", key, sms: text.sms, emailSubject: text.emailSubject, emailBody: text.emailBody });
      setMsg({ ok: !d.warning, text: d.warning ? `Saved. Note: ${d.warning}` : "Saved — new messages use this wording now." });
      onSaved();
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : "Could not save." });
    }
    setSaving(false);
  };
  const reset = async () => {
    setMsg(null);
    try {
      await settingsPost({ action: "reset_template", key });
      setText({ ...DEFAULT_TEMPLATES[key] });
      setMsg({ ok: true, text: "Back to the default wording." });
      onSaved();
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : "Could not reset." });
    }
  };

  return (
    <Card icon={MessageSquareText} title="Message Wording"
      description="Edit what customers receive. Type a {placeholder} to insert live details; a line whose only content is an empty placeholder is left out.">
      <div className="flex flex-wrap gap-2">
        {TEMPLATES.map((t) => (
          <button key={t.key} type="button" onClick={() => pick(t.key)}
            className={`px-3 py-1.5 rounded-lg text-xs border ${key === t.key ? "bg-[#FCC300]/15 border-[#FCC300]/40 text-[#FCC300]" : "bg-white/5 border-white/10 text-[#A1A1AA] hover:text-white"}`}>
            {t.label}{overrides.some((o) => o.key === t.key) ? " •" : ""}
          </button>
        ))}
      </div>
      <p className="text-[#A1A1AA] text-xs">{info.description}{customized ? " (Customized — • marks edited messages.)" : ""}</p>

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="space-y-3">
          <label className="block space-y-1">
            <span className="text-[#A1A1AA] text-xs">Text message ({text.sms.length} characters)</span>
            <textarea rows={7} value={text.sms} onChange={(e) => setText((p) => ({ ...p, sms: e.target.value }))} className={areaClass} />
          </label>
          {info.hasEmail && (
            <>
              <label className="block space-y-1">
                <span className="text-[#A1A1AA] text-xs">Email subject</span>
                <input value={text.emailSubject} onChange={(e) => setText((p) => ({ ...p, emailSubject: e.target.value }))} className={areaClass} />
              </label>
              <label className="block space-y-1">
                <span className="text-[#A1A1AA] text-xs">Email body (a receipt button is added automatically)</span>
                <textarea rows={6} value={text.emailBody} onChange={(e) => setText((p) => ({ ...p, emailBody: e.target.value }))} className={areaClass} />
              </label>
            </>
          )}
          <div className="text-xs text-[#A1A1AA] space-y-0.5">
            <div className="text-white">Placeholders</div>
            {info.placeholders.map((p) => (
              <div key={p.name}><code className="text-[#FCC300]">{`{${p.name}}`}</code> — {p.help}</div>
            ))}
          </div>
        </div>
        <div className="space-y-3">
          <div className="text-[#A1A1AA] text-xs">Preview (sample booking)</div>
          <pre className="whitespace-pre-wrap break-words font-sans text-sm text-[#D4D4D8] bg-white/5 rounded-xl p-4">{renderTemplate(text.sms, sample)}</pre>
          {info.hasEmail && (
            <div className="bg-white rounded-xl p-4 text-[#18181b] text-sm space-y-2">
              <div className="font-semibold">{renderTemplate(text.emailSubject, sample)}</div>
              <pre className="whitespace-pre-wrap break-words font-sans">{renderTemplate(text.emailBody, sample)}</pre>
            </div>
          )}
          {key === "confirmation" && !/STOP/i.test(text.sms) && (
            <p className="text-xs text-amber-400">Keep &ldquo;Reply STOP to opt out&rdquo; in the confirmation text — carriers require it.</p>
          )}
          {unknown.length > 0 && (
            <p className="text-xs text-red-400">Not available for this message: {unknown.map((u) => `{${u}}`).join(", ")}</p>
          )}
        </div>
      </div>
      <Notice msg={msg} />
      <div className="flex gap-2 flex-wrap">
        <SaveButton saving={saving} onClick={save} label="Save Wording" />
        {customized && (
          <Button variant="outline" onClick={reset} className="border-white/15 text-white hover:bg-white/5">
            <RotateCcw className="w-4 h-4 mr-2" /> Reset to default
          </Button>
        )}
      </div>
    </Card>
  );
}

const ago = (iso: string) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h} hr ago` : `${Math.round(h / 24)} days ago`;
};

function Light({ ok, warn }: { ok: boolean; warn?: boolean }) {
  return <span className={`inline-block w-2.5 h-2.5 rounded-full ${ok ? "bg-green-400" : warn ? "bg-amber-400" : "bg-red-400"}`} />;
}

export function HealthCard() {
  const [h, setH] = useState<any>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/settings/health");
    setH(res.ok ? { ...(await res.json()), checkedAt: Date.now() } : { error: true });
  }, []);
  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);

  const test = async (channel: "sms" | "email") => {
    setBusy(channel);
    setMsg(null);
    try {
      const res = await fetch("/api/settings/health", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ channel }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? "It didn't send.");
      setMsg({ ok: true, text: `Test ${channel === "sms" ? "text" : "email"} sent to ${d.to}.` });
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : "It didn't send." });
    }
    setBusy(null);
    load();
  };

  const lastCall = h?.calls?.[0];
  const workerFresh = h?.worker && h.checkedAt - new Date(h.worker.lastRun).getTime() < 30 * 60_000;
  const workerProblem = lastCall && lastCall.status && lastCall.status !== 200
    ? lastCall.status === 401
      ? "Supabase is calling the site but gets 401 Unauthorized — CRON_SECRET on Hostinger is missing or doesn't match the Supabase Vault secret."
      : `Supabase gets HTTP ${lastCall.status} calling the site.`
    : lastCall?.error ? `Supabase couldn't reach the site: ${lastCall.error}` : null;

  return (
    <Card icon={Activity} title="Message Health"
      description="Whether texting and email are connected, and whether the background job (reminders, retries, alerts) is running.">
      {!h ? (
        <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 text-[#FCC300] animate-spin" /></div>
      ) : h.error ? (
        <p className="text-sm text-red-400">Couldn&apos;t load message health.</p>
      ) : (
        <div className="space-y-3 text-sm">
          <div className="flex items-start gap-3">
            <Light ok={h.sms.connected} />
            <div>
              <div className="text-white">Texting {h.sms.connected ? `connected (${h.sms.provider})` : "not connected"}</div>
              {!h.sms.connected && <div className="text-[#A1A1AA] text-xs">Add the RINGCENTRAL_* settings on Hostinger and redeploy.</div>}
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Light ok={h.email.connected} />
            <div>
              <div className="text-white">Email {h.email.connected ? `connected (${h.email.from})` : "not connected"}</div>
              {!h.email.connected && <div className="text-[#A1A1AA] text-xs">Add the SMTP_* settings on Hostinger and redeploy.</div>}
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Light ok={!!workerFresh && !workerProblem} warn={!!h.worker && !workerFresh && !workerProblem} />
            <div>
              <div className="text-white">
                Background job {h.worker ? `last ran ${ago(h.worker.lastRun)}` : "has never run on this version"}
                {!h.cronSecretSet && " · CRON_SECRET not set on this server"}
              </div>
              {workerProblem && <div className="text-red-400 text-xs">{workerProblem}</div>}
              {!workerProblem && h.worker && !workerFresh && (
                <div className="text-[#A1A1AA] text-xs">It should run every 10 minutes — check the Supabase project isn&apos;t paused.</div>
              )}
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Light ok={h.last24h.failed === 0} warn={h.last24h.retrying > 0} />
            <div className="text-white">
              Last 24 hours: {h.last24h.sent} sent · {h.last24h.retrying} retrying · {h.last24h.failed} failed
              {h.last24h.notSetUp ? ` · ${h.last24h.notSetUp} not sent (not connected)` : ""}
              <span className="text-[#A1A1AA] text-xs block">Details in Dashboard → Messages → Outbox.</span>
            </div>
          </div>
        </div>
      )}
      <Notice msg={msg} />
      <div className="flex gap-2 flex-wrap">
        <Button variant="outline" disabled={!!busy} onClick={() => test("sms")} className="border-white/15 text-white hover:bg-white/5">
          {busy === "sms" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />} Send me a test text
        </Button>
        <Button variant="outline" disabled={!!busy} onClick={() => test("email")} className="border-white/15 text-white hover:bg-white/5">
          {busy === "email" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />} Send me a test email
        </Button>
        <Button variant="outline" onClick={load} className="border-white/15 text-white hover:bg-white/5">
          <RefreshCw className="w-4 h-4 mr-2" /> Refresh
        </Button>
      </div>
    </Card>
  );
}

export function HistoryCard({ history }: { history: any[] }) {
  return (
    <Card icon={History} title="Change History" description="Every settings change: who made it, when, and what changed (newest first).">
      {history.length === 0 ? (
        <p className="text-[#A1A1AA] text-sm">No changes recorded yet.</p>
      ) : (
        <div className="space-y-3">
          {history.map((c) => (
            <div key={c.id} className="border-b border-white/5 pb-3 last:border-0">
              <div className="text-xs text-[#A1A1AA]">
                {new Date(c.created_at).toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })} ET ·{" "}
                <span className="text-white">{c.employee_name ?? "Someone"}</span> · {c.area}
              </div>
              <ul className="mt-1 space-y-0.5">
                {(c.summary ?? []).map((l: string, i: number) => <li key={i} className="text-sm text-[#D4D4D8]">{l}</li>)}
              </ul>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
