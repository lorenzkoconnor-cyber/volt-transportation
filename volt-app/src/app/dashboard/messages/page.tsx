"use client";

// Dashboard → Messages
//   • Contact: every message sent from the website's Contact page (they are
//     also emailed to support).
//   • Outbox: every text and email the system has sent or is retrying — the
//     message queue (src/lib/notifications/queue.ts).

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Inbox, Loader2, Mail, MessageSquare, Phone, RefreshCw } from "lucide-react";

/* eslint-disable @typescript-eslint/no-explicit-any */

type Tab = "contact" | "outbox";

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-US", {
    timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });

const STATUS_STYLE: Record<string, string> = {
  sent: "bg-green-500/15 text-green-400",
  pending: "bg-yellow-500/15 text-yellow-400",
  failed: "bg-red-500/15 text-red-400",
};

const AUDIENCE_LABEL: Record<string, string> = { customer: "Customer", staff: "Staff alert", support: "Support" };

export default function MessagesPage() {
  const sb = createClient() as any;
  const [tab, setTab] = useState<Tab>("contact");
  const [loading, setLoading] = useState(true);
  const [contacts, setContacts] = useState<any[]>([]);
  const [outbox, setOutbox] = useState<any[]>([]);
  const [open, setOpen] = useState<string | null>(null);

  // Fetch first, then set state (nothing synchronous inside the mount effect).
  const load = useCallback(async () => {
    const [c, o] = await Promise.all([
      sb.from("contact_messages").select("*").order("created_at", { ascending: false }).limit(100),
      sb.from("notifications")
        .select("id, type, audience, recipient, subject, message, status, attempts, last_error, kind, created_at, sent_at, reservation:reservations(confirmation_number)")
        .order("created_at", { ascending: false })
        .limit(200),
    ]);
    setContacts(c.data ?? []);
    setOutbox(o.data ?? []);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const t = setTimeout(load, 0); // async, so no setState runs synchronously in the effect
    return () => clearTimeout(t);
  }, [load]);

  const failed = outbox.filter((n) => n.status === "failed").length;
  const retrying = outbox.filter((n) => n.status === "pending" && n.attempts > 0).length;

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Inbox className="w-6 h-6 text-[#FCC300]" /> Messages
          </h1>
          <p className="text-[#A1A1AA] text-sm mt-0.5">
            Contact-page messages, and every text and email the system sends.
          </p>
        </div>
        <button onClick={() => { setLoading(true); load(); }} className="inline-flex items-center gap-2 text-sm text-[#A1A1AA] hover:text-white">
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      <div className="flex gap-2">
        {([["contact", `Contact (${contacts.length})`], ["outbox", "Outbox"]] as const).map(([t, label]) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-xl text-sm border ${
              tab === t ? "bg-[#FCC300]/15 border-[#FCC300]/40 text-[#FCC300]" : "bg-white/5 border-white/10 text-[#A1A1AA] hover:text-white"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="glass rounded-2xl p-12 flex justify-center"><Loader2 className="w-6 h-6 text-[#FCC300] animate-spin" /></div>
      ) : tab === "contact" ? (
        <div className="space-y-3">
          {contacts.length === 0 && <div className="glass rounded-2xl p-8 text-center text-[#A1A1AA] text-sm">No messages yet.</div>}
          {contacts.map((m) => (
            <div key={m.id} className="glass rounded-2xl p-5 space-y-2">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <div className="text-white font-medium">{m.subject}</div>
                  <div className="text-[#A1A1AA] text-xs mt-0.5">{m.name} · {when(m.created_at)} ET</div>
                </div>
                <div className="flex gap-3 text-xs">
                  <a href={`mailto:${m.email}?subject=${encodeURIComponent(`Re: ${m.subject}`)}`} className="inline-flex items-center gap-1 text-[#FCC300] hover:underline">
                    <Mail className="w-3.5 h-3.5" /> {m.email}
                  </a>
                  {m.phone && (
                    <a href={`tel:${m.phone}`} className="inline-flex items-center gap-1 text-[#FCC300] hover:underline">
                      <Phone className="w-3.5 h-3.5" /> {m.phone}
                    </a>
                  )}
                </div>
              </div>
              <p className="text-[#D4D4D8] text-sm whitespace-pre-wrap break-words">{m.message}</p>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {(failed > 0 || retrying > 0) && (
            <p className="text-sm text-[#FFE08A] bg-[#FCC300]/10 rounded-xl px-4 py-3">
              {failed > 0 && `${failed} failed`}{failed > 0 && retrying > 0 && " · "}{retrying > 0 && `${retrying} retrying automatically`}
              {" "}(in the last 200 messages).
            </p>
          )}
          <div className="glass rounded-2xl overflow-x-auto">
            <div className="min-w-[760px]">
              {outbox.length === 0 && <div className="p-8 text-center text-[#A1A1AA] text-sm">Nothing sent yet.</div>}
              {outbox.map((n) => (
                <div key={n.id} className="border-b border-white/5 last:border-0">
                  <button
                    onClick={() => setOpen(open === n.id ? null : n.id)}
                    className="w-full grid grid-cols-[110px_28px_110px_1fr_90px] gap-3 items-center px-4 py-3 text-left text-sm hover:bg-white/[0.03]"
                  >
                    <span className="text-[#A1A1AA] text-xs">{when(n.created_at)}</span>
                    {n.type === "sms" ? <MessageSquare className="w-4 h-4 text-[#A1A1AA]" /> : <Mail className="w-4 h-4 text-[#A1A1AA]" />}
                    <span className="text-[#A1A1AA] text-xs">{AUDIENCE_LABEL[n.audience] ?? n.audience}</span>
                    <span className="text-white truncate">
                      {n.reservation?.confirmation_number ? `${n.reservation.confirmation_number} · ` : ""}
                      {n.subject ?? n.message.split("\n")[0]}
                      <span className="text-[#A1A1AA]"> → {n.recipient}</span>
                    </span>
                    <span className={`justify-self-end px-2 py-0.5 rounded-md text-xs ${STATUS_STYLE[n.status] ?? ""}`}>
                      {n.status === "pending" && n.attempts > 0 ? "retrying" : n.status}
                    </span>
                  </button>
                  {open === n.id && (
                    <div className="px-4 pb-4 text-xs space-y-2">
                      {n.last_error && <p className="text-red-400">Error: {n.last_error} (tries: {n.attempts})</p>}
                      <pre className="whitespace-pre-wrap break-words text-[#D4D4D8] font-sans bg-white/5 rounded-lg p-3">{n.message}</pre>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
