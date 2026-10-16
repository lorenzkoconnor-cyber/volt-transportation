"use client";

// Dashboard → Settings → Staff Alerts: who gets each staff alert, by text
// and/or email (staff_alert_subscriptions, migration 020). Owner/manager only.

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { ALERT_TYPES, type AlertType } from "@/lib/alert-types";
import { Bell, Loader2, Save, MessageSquare, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { settingsPost } from "@/components/admin/settings/shared";

/* eslint-disable @typescript-eslint/no-explicit-any */

interface Emp {
  id: string;
  first_name: string;
  last_name: string;
  role: string;
  phone: string | null;
  email: string | null;
}

type Sub = { sms: boolean; email: boolean };
type Subs = Record<string, Sub>; // `${alertType}:${employeeId}`

const key = (t: AlertType, id: string) => `${t}:${id}`;
const ROLE_LABEL: Record<string, string> = { owner: "Owner", manager: "Manager", office_staff: "Office", driver: "Driver" };

export default function StaffAlertsCard() {
  const sb = createClient() as any;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [emps, setEmps] = useState<Emp[]>([]);
  const [subs, setSubs] = useState<Subs>({});
  const [original, setOriginal] = useState<Subs>({});
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Fetch first, then set state (nothing synchronous inside the mount effect).
  const load = useCallback(async () => {
    const [e, s] = await Promise.all([
      sb.from("employees").select("id, first_name, last_name, role, phone, email").eq("is_active", true).order("first_name"),
      sb.from("staff_alert_subscriptions").select("employee_id, alert_type, via_sms, via_email"),
    ]);
    const map: Subs = {};
    for (const r of s.data ?? []) map[`${r.alert_type}:${r.employee_id}`] = { sms: r.via_sms, email: r.via_email };
    setEmps(e.data ?? []);
    setSubs(map);
    setOriginal(map);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const t = setTimeout(load, 0); // async, so no setState runs synchronously in the effect
    return () => clearTimeout(t);
  }, [load]);

  const toggle = (t: AlertType, id: string, ch: keyof Sub) =>
    setSubs((prev) => {
      const cur = prev[key(t, id)] ?? { sms: false, email: false };
      return { ...prev, [key(t, id)]: { ...cur, [ch]: !cur[ch] } };
    });

  // Saved through /api/settings so the change history records who changed what.
  const save = async () => {
    setSaving(true);
    setMsg(null);
    try {
      const rows: any[] = [];
      for (const k of new Set([...Object.keys(subs), ...Object.keys(original)])) {
        const [alert_type, employee_id] = k.split(":");
        const now = subs[k] ?? { sms: false, email: false };
        const was = original[k] ?? { sms: false, email: false };
        if (was.sms !== now.sms || was.email !== now.email) rows.push({ alert_type, employee_id, via_sms: now.sms, via_email: now.email });
      }
      if (rows.length) await settingsPost({ action: "save_alerts", rows });
      setOriginal(subs);
      setMsg({ ok: true, text: rows.length ? "Staff alerts saved." : "No changes to save." });
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : "Could not save staff alerts." });
    }
    setSaving(false);
  };

  return (
    <div className="glass rounded-2xl p-6 space-y-5">
      <div>
        <h2 className="text-white font-semibold flex items-center gap-2">
          <Bell className="w-4 h-4 text-[#FCC300]" /> Staff Alerts
        </h2>
        <p className="text-[#A1A1AA] text-xs mt-1">
          Choose who is texted and/or emailed for each alert. Texts go to the phone number and emails to the
          email address on the employee&apos;s profile.
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 text-[#FCC300] animate-spin" /></div>
      ) : (
        <>
          {ALERT_TYPES.map((a) => (
            <div key={a.type} className="space-y-2 border-t border-white/8 pt-4 first:border-t-0 first:pt-0">
              <div>
                <div className="text-white text-sm font-medium">{a.label}</div>
                <div className="text-[#A1A1AA] text-xs">{a.description}</div>
              </div>
              <div className="space-y-1.5">
                {emps.map((e) => {
                  const s = subs[key(a.type, e.id)] ?? { sms: false, email: false };
                  return (
                    <div key={e.id} className="flex items-center justify-between gap-3 flex-wrap">
                      <span className="text-sm text-white">
                        {e.first_name} {e.last_name}
                        <span className="text-[#A1A1AA] text-xs ml-2">{ROLE_LABEL[e.role] ?? e.role}</span>
                      </span>
                      <div className="flex gap-2">
                        <Chip on={s.sms} disabled={!e.phone} onClick={() => toggle(a.type, e.id, "sms")}
                          title={e.phone ? "Text" : "No phone number on file"}>
                          <MessageSquare className="w-3.5 h-3.5" /> Text
                        </Chip>
                        <Chip on={s.email} disabled={!e.email} onClick={() => toggle(a.type, e.id, "email")}
                          title={e.email ? "Email" : "No email on file"}>
                          <Mail className="w-3.5 h-3.5" /> Email
                        </Chip>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {msg && <p className={`text-sm ${msg.ok ? "text-green-400" : "text-red-400"}`}>{msg.text}</p>}
          <Button disabled={saving} onClick={save} className="bg-[#FCC300] hover:bg-[#FFD54A] text-[#0A0A0A] font-semibold">
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Save Staff Alerts
          </Button>
        </>
      )}
    </div>
  );
}

function Chip({ on, disabled, onClick, title, children }: {
  on: boolean; disabled?: boolean; onClick: () => void; title: string; children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-pressed={on}
      disabled={disabled && !on}
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs border transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
        on ? "bg-[#FCC300]/15 border-[#FCC300]/40 text-[#FCC300]" : "bg-white/5 border-white/10 text-[#A1A1AA] hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}
