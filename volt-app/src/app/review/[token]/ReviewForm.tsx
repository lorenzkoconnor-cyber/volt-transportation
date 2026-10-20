"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle2, ExternalLink, Loader2, Star } from "lucide-react";
import { NAME_MAX_LENGTH, REVIEW_MAX_LENGTH } from "@/lib/reviews";
import type { ReviewForm as Form } from "@/lib/reviews-server";

const RATING_WORDS = ["", "Poor", "Fair", "Good", "Great", "Excellent"];

export default function ReviewForm({ token, form }: { token: string; form: Form }) {
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [body, setBody] = useState("");
  const [name, setName] = useState(form.defaultName);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<{ held: boolean } | null>(
    form.existing ? { held: form.existing.status !== "published" } : null,
  );

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!rating) { setError("Tap a star to rate your ride."); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, rating, body, displayName: name }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 409) { setDone({ held: false }); return; }
      if (!res.ok) throw new Error(data.error ?? "Could not save your review. Please try again.");
      setDone({ held: !!data.held });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save your review. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const openGoogle = () => {
    // Fire-and-forget: just records that they went to Google.
    fetch("/api/reviews", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, action: "google" }),
    }).catch(() => null);
  };

  if (done) {
    const text = form.existing?.body ?? body;
    return (
      <div className="glass rounded-2xl p-8 text-center space-y-5">
        <CheckCircle2 className="w-12 h-12 text-[#FCC300] mx-auto" />
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-white">Thank you{form.firstName ? `, ${form.firstName}` : ""}!</h1>
          <p className="text-[#A1A1AA] text-sm">
            {done.held
              ? "We got your review. It'll appear on our website once our team has had a quick look."
              : "Your review is now on our website. It means a lot to a small local business."}
          </p>
        </div>
        {form.googleUrl && (
          <div className="bg-white/5 border border-white/10 rounded-xl p-5 space-y-3 text-left">
            <p className="text-white text-sm font-medium">Got one more minute? Share it on Google too.</p>
            <p className="text-[#A1A1AA] text-xs">
              Google reviews help other Columbus travelers find us. Google asks you to type it there yourself.
              {text && " Here's what you wrote, so you can copy it:"}
            </p>
            {text && (
              <p className="text-[#D4D4D8] text-sm bg-black/30 rounded-lg p-3 whitespace-pre-wrap select-all">{text}</p>
            )}
            <div className="flex flex-col sm:flex-row gap-2">
              {text && (
                <Button type="button" variant="outline" onClick={() => navigator.clipboard?.writeText(text).catch(() => null)}
                  className="border-white/15 text-white hover:bg-white/5">
                  Copy my review
                </Button>
              )}
              <a href={form.googleUrl} target="_blank" rel="noopener noreferrer" onClick={openGoogle}
                className="inline-flex items-center justify-center gap-2 rounded-md bg-[#FCC300] hover:bg-[#FFD54A] text-[#0A0A0A] font-semibold text-sm px-4 h-10">
                Post on Google <ExternalLink className="w-4 h-4" />
              </a>
            </div>
          </div>
        )}
      </div>
    );
  }

  const shown = hover || rating;
  return (
    <form onSubmit={submit} className="glass rounded-2xl p-6 sm:p-8 space-y-6">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold text-white tracking-tight">How was your ride{form.firstName ? `, ${form.firstName}` : ""}?</h1>
        {form.tripLabel && <p className="text-[#A1A1AA] text-sm">{form.tripLabel}</p>}
      </div>

      <div className="flex flex-col items-center gap-2">
        <div className="flex gap-1" role="radiogroup" aria-label="Your rating" onMouseLeave={() => setHover(0)}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" role="radio" aria-checked={rating === n} aria-label={`${n} star${n > 1 ? "s" : ""}`}
              onClick={() => setRating(n)} onMouseEnter={() => setHover(n)}
              className="p-1 transition-transform hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FCC300] rounded">
              <Star className="w-10 h-10" color="#FCC300" fill={n <= shown ? "#FCC300" : "transparent"} />
            </button>
          ))}
        </div>
        <span className="text-[#A1A1AA] text-sm h-5">{RATING_WORDS[shown]}</span>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="review-body" className="text-[#A1A1AA] text-xs">Your review</Label>
        <Textarea id="review-body" rows={5} maxLength={REVIEW_MAX_LENGTH} value={body} onChange={(e) => setBody(e.target.value)}
          placeholder="How was your driver, the van, pickup and drop-off?"
          className="bg-white/5 border-white/10 text-white placeholder:text-[#A1A1AA]/50 rounded-xl focus:border-[#FCC300]" />
        <div className="text-right text-[#A1A1AA] text-xs">{body.length}/{REVIEW_MAX_LENGTH}</div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="review-name" className="text-[#A1A1AA] text-xs">Name shown with your review</Label>
        <Input id="review-name" maxLength={NAME_MAX_LENGTH} value={name} onChange={(e) => setName(e.target.value)}
          className="bg-white/5 border-white/10 text-white h-11 rounded-xl focus:border-[#FCC300]" />
      </div>

      <p className="text-[#A1A1AA] text-xs">
        Your rating, review and the name above appear on volt-transportation.com. Your email and phone number never do.
      </p>

      {error && <p className="text-red-400 text-sm">{error}</p>}

      <Button type="submit" disabled={saving}
        className="w-full bg-[#FCC300] hover:bg-[#FFD54A] text-[#0A0A0A] font-bold h-12 rounded-xl disabled:opacity-60">
        {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
        Submit Review
      </Button>
    </form>
  );
}
