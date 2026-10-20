"use client";

// Dashboard → Reviews (owners & managers). Reviews customers left from the
// review request email. They publish on the homepage right away unless the
// automatic check held them (links, contact details, profanity).
//
// Hide a review only for its CONTENT — never because it's negative. The
// FTC's 2024 consumer-review rule bans suppressing reviews by rating.

import { useEffect, useState } from "react";
import { Star, Loader2, Eye, EyeOff, AlertTriangle, ExternalLink, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import StatCard from "@/components/admin/StatCard";

/* eslint-disable @typescript-eslint/no-explicit-any */

const FILTERS = [
  { key: "all", label: "All" },
  { key: "held", label: "Needs review" },
  { key: "published", label: "On website" },
  { key: "hidden", label: "Hidden" },
] as const;
type Filter = (typeof FILTERS)[number]["key"];

const STATUS_STYLES: Record<string, string> = {
  published: "bg-green-500/15 text-green-400",
  held: "bg-yellow-500/15 text-yellow-400",
  hidden: "bg-[#A1A1AA]/15 text-[#A1A1AA]",
};
const STATUS_LABELS: Record<string, string> = { published: "On website", held: "Needs review", hidden: "Hidden" };

// Content reasons only.
const HIDE_REASONS = ["Profanity or abuse", "Personal information", "Spam or advertising", "Not about a Volt trip"];

const when = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

async function fetchReviews() {
  const res = await fetch("/api/reviews/manage");
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Could not load reviews.");
  return data as { reviews: any[]; requested: number };
}

export default function ReviewsPage() {
  const [data, setData] = useState<{ reviews: any[]; requested: number } | null>(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [hiding, setHiding] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchReviews()
      .then((d) => { if (!cancelled) setData(d); })
      .catch((err) => { if (!cancelled) setError(err.message); });
    return () => { cancelled = true; };
  }, []);

  const act = async (id: string, action: "publish" | "hide", reason?: string) => {
    setBusyId(id);
    setError("");
    try {
      const res = await fetch("/api/reviews/manage", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, action, reason }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? "Could not update the review.");
      setHiding(null);
      setData(await fetchReviews());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update the review.");
    }
    setBusyId(null);
  };

  const reviews = data?.reviews ?? [];
  const published = reviews.filter((r) => r.status === "published");
  const held = reviews.filter((r) => r.status === "held");
  const avg = published.length ? published.reduce((s, r) => s + r.rating, 0) / published.length : null;
  const toGoogle = reviews.filter((r) => r.google_clicked_at).length;
  const shown = filter === "all" ? reviews : reviews.filter((r) => r.status === filter);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Star className="w-6 h-6 text-[#FCC300]" /> Reviews
        </h1>
        <p className="text-[#A1A1AA] text-sm mt-0.5">
          Customers are emailed 2 hours after their first trip leg. New reviews go on the homepage right away.
          Turn emails off or set the Google link in Settings → Reviews.
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Average Rating" value={!data ? "…" : avg == null ? "—" : `${avg.toFixed(1)} ★`} icon={Star} accent />
        <StatCard label="On Website" value={!data ? "…" : String(published.length)} icon={Eye} />
        <StatCard label="Requests Emailed" value={!data ? "…" : String(data.requested)} icon={Mail} />
        <StatCard label="Went to Google" value={!data ? "…" : String(toGoogle)} icon={ExternalLink} />
      </div>

      {held.length > 0 && (
        <div className="flex items-start gap-2 bg-yellow-500/10 border border-yellow-500/20 rounded-xl px-4 py-3 text-yellow-400 text-sm">
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <p>{held.length} review{held.length > 1 ? "s were" : " was"} held by the automatic check. Publish {held.length > 1 ? "them" : "it"} or hide {held.length > 1 ? "them" : "it"} below.</p>
        </div>
      )}

      <div className="flex gap-2 overflow-x-auto pb-1">
        {FILTERS.map((f) => (
          <button key={f.key} onClick={() => setFilter(f.key)}
            className={`px-4 py-2 rounded-xl text-sm border whitespace-nowrap ${
              filter === f.key ? "bg-[#FCC300]/15 border-[#FCC300]/40 text-[#FCC300]" : "bg-white/5 border-white/10 text-[#A1A1AA] hover:text-white"
            }`}>
            {f.label}{f.key === "held" && held.length ? ` (${held.length})` : ""}
          </button>
        ))}
      </div>

      {error && <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-red-400 text-sm">{error}</div>}

      {!data && !error ? (
        <div className="glass rounded-2xl p-12 flex justify-center"><Loader2 className="w-6 h-6 text-[#FCC300] animate-spin" /></div>
      ) : shown.length === 0 ? (
        <div className="glass rounded-2xl p-10 text-center text-[#A1A1AA] text-sm">
          {filter === "all" ? "No reviews yet. They'll show up here as customers finish their trips." : "Nothing here."}
        </div>
      ) : (
        <div className="space-y-3">
          {shown.map((r) => (
            <div key={r.id} className="glass rounded-2xl p-5 space-y-3">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <div className="flex gap-0.5" aria-label={`${r.rating} out of 5 stars`} role="img">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className="w-4 h-4 text-[#FCC300]" fill={i < r.rating ? "#FCC300" : "transparent"} />
                  ))}
                </div>
                <span className="text-white text-sm font-medium">{r.display_name}</span>
                <span className="text-[#A1A1AA] text-xs">
                  {r.customer ? `${r.customer.first_name} ${r.customer.last_name}` : ""}
                  {r.reservation?.confirmation_number ? ` · ${r.reservation.confirmation_number}` : ""}
                  {r.trip_label ? ` · ${r.trip_label}` : ""} · {when(r.created_at)}
                </span>
                <span className={`ml-auto px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[r.status] ?? ""}`}>
                  {STATUS_LABELS[r.status] ?? r.status}
                </span>
              </div>
              <p className="text-[#D4D4D8] text-sm whitespace-pre-line">{r.body}</p>
              {r.hold_reason && <p className="text-[#A1A1AA] text-xs">{r.status === "held" ? "Held: " : "Hidden: "}{r.hold_reason}</p>}
              {r.google_clicked_at && <p className="text-[#A1A1AA] text-xs">Opened the Google review page</p>}

              <div className="flex flex-wrap items-center gap-2">
                {r.status !== "published" && (
                  <Button size="sm" disabled={busyId === r.id} onClick={() => act(r.id, "publish")}
                    className="bg-[#FCC300] hover:bg-[#FFD54A] text-[#0A0A0A] text-xs font-semibold">
                    {busyId === r.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><Eye className="w-3.5 h-3.5 mr-1" />Publish</>}
                  </Button>
                )}
                {r.status !== "hidden" && hiding !== r.id && (
                  <Button size="sm" variant="outline" disabled={busyId === r.id} onClick={() => setHiding(r.id)}
                    className="border-white/15 text-white hover:bg-white/5 text-xs">
                    <EyeOff className="w-3.5 h-3.5 mr-1" /> Hide
                  </Button>
                )}
                {hiding === r.id && (
                  <div className="w-full space-y-2 bg-white/3 rounded-xl p-3">
                    <p className="text-[#A1A1AA] text-xs">
                      Why? Reviews can only be hidden for their content — not because they&apos;re negative (FTC rule).
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {HIDE_REASONS.map((reason) => (
                        <Button key={reason} size="sm" variant="outline" disabled={busyId === r.id} onClick={() => act(r.id, "hide", reason)}
                          className="border-white/15 text-white hover:bg-white/5 text-xs">
                          {reason}
                        </Button>
                      ))}
                      <Button size="sm" variant="ghost" onClick={() => setHiding(null)} className="text-[#A1A1AA] text-xs">Cancel</Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
