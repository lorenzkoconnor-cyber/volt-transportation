"use client";

// Settings → Website & Contact: the website announcement banner.

import { useState } from "react";
import { Megaphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, Notice, SaveButton, settingsPost, wideInputClass } from "./shared";

/* eslint-disable @typescript-eslint/no-explicit-any */

const etString = (iso: string) => new Date(iso).toLocaleString("en-US", {
  timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
});

export function BannerCard({ announcements, onSaved }: { announcements: any[]; onSaved: () => void }) {
  const [now] = useState(Date.now);
  const [form, setForm] = useState({ message: "", linkUrl: "", linkLabel: "", startDate: "", startTime: "", endDate: "", endTime: "" });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const set = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }));
  const live = announcements.find((a) => a.is_active && (!a.ends_at || new Date(a.ends_at).getTime() > now));

  const post = async () => {
    setSaving(true);
    setMsg(null);
    try {
      await settingsPost({ action: "create_announcement", ...form });
      setMsg({ ok: true, text: "Banner saved. It shows at the top of every public page during the dates you set." });
      setForm({ message: "", linkUrl: "", linkLabel: "", startDate: "", startTime: "", endDate: "", endTime: "" });
      onSaved();
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : "Could not save." });
    }
    setSaving(false);
  };

  const end = async (id: string) => {
    try {
      await settingsPost({ action: "end_announcement", id });
      setMsg({ ok: true, text: "Banner taken down." });
      onSaved();
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : "Could not take it down." });
    }
  };

  return (
    <Card icon={Megaphone} title="Website Banner"
      description="A one-line notice across the top of the public website — traffic, weather, holiday hours. One banner at a time; posting a new one replaces the old.">
      {live && (
        <div className="rounded-xl bg-[#FCC300] text-[#0A0A0A] px-4 py-3 text-sm flex items-start justify-between gap-3">
          <div>
            <div className="font-semibold">Live now{live.ends_at ? ` until ${etString(live.ends_at)}` : ""}</div>
            <div>{live.message}</div>
          </div>
          <Button size="sm" onClick={() => end(live.id)} className="bg-black/80 hover:bg-black text-white flex-shrink-0">Take down</Button>
        </div>
      )}
      <label className="block space-y-1">
        <span className="text-[#A1A1AA] text-xs">Message ({300 - form.message.length} characters left)</span>
        <input value={form.message} maxLength={300} placeholder="Heavy traffic on I-185 today — please allow extra time."
          onChange={(e) => set("message", e.target.value)} className={wideInputClass} />
      </label>
      <div className="grid sm:grid-cols-2 gap-3">
        <label className="space-y-1">
          <span className="text-[#A1A1AA] text-xs">Link (optional) — https://… or a page like /contact</span>
          <input value={form.linkUrl} onChange={(e) => set("linkUrl", e.target.value)} className={wideInputClass} />
        </label>
        <label className="space-y-1">
          <span className="text-[#A1A1AA] text-xs">Link text (optional)</span>
          <input value={form.linkLabel} maxLength={40} placeholder="Learn more" onChange={(e) => set("linkLabel", e.target.value)} className={wideInputClass} />
        </label>
        <label className="space-y-1">
          <span className="text-[#A1A1AA] text-xs">Start (blank = now)</span>
          <div className="flex gap-2">
            <input type="date" value={form.startDate} onChange={(e) => set("startDate", e.target.value)} className={wideInputClass} />
            <input type="time" value={form.startTime} onChange={(e) => set("startTime", e.target.value)} className={`${wideInputClass} w-32`} />
          </div>
        </label>
        <label className="space-y-1">
          <span className="text-[#A1A1AA] text-xs">End (blank = until taken down)</span>
          <div className="flex gap-2">
            <input type="date" value={form.endDate} onChange={(e) => set("endDate", e.target.value)} className={wideInputClass} />
            <input type="time" value={form.endTime} onChange={(e) => set("endTime", e.target.value)} className={`${wideInputClass} w-32`} />
          </div>
        </label>
      </div>
      <Notice msg={msg} />
      <SaveButton saving={saving} onClick={post} label="Post Banner" />
    </Card>
  );
}
