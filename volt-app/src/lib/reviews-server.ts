// ─── Customer reviews (server-only) ───────────────────────────────────────────
//   • queueReviewRequests() — called by the cron worker: emails (and texts,
//     with consent) a tip + review request 2+ hours after the first leg arrives
//     (due_post_trip_messages(), migration 038).
//   • loadReviewForm() / submitReview() — the /review/<token> page.
//   • getPublishedReviews() — the homepage carousel.

import { createAdminDb } from "@/lib/checkout";
import { emailHtml, isEmailConfigured } from "@/lib/notifications/email";
import { isSmsConfigured } from "@/lib/notifications/sms";
import { enqueue } from "@/lib/notifications/queue";
import { appUrl, renderMessage } from "@/lib/reservation-messages";
import { loadAppSettings } from "@/lib/settings-server";
import { LOCATIONS } from "@/lib/booking";
import { checkReview, defaultDisplayName } from "@/lib/reviews";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Db = any;

export const REVIEW_REQUEST_DELAY_MINUTES = 120;
const TOKEN_RE = /^[0-9a-f-]{36}$/i;

export function reviewUrl(token: string): string {
  return `${appUrl()}/review/${token}`;
}

// "Tip your driver" after the trip — same token (src/lib/tips-server.ts).
export function tipUrl(token: string): string {
  return `${appUrl()}/tip/${token}`;
}

// ── Thank-you messages: tip + review (cron) ──────────────────────────────────
// 2 hours after the first leg's drop-off: an email with "Tip your driver" and
// "Leave a review" buttons, and a text to riders who agreed to texts. Each
// channel goes once per booking (due_post_trip_messages(), migration 038).
export async function queueReviewRequests(sb: Db): Promise<Record<string, number | string>> {
  const settings = await loadAppSettings();
  if (!settings.reviews.requestsEnabled) return { skipped: "Review requests are turned off" };
  // A channel that isn't set up would only be simulated — wait so it isn't used up.
  const email = isEmailConfigured();
  const sms = isSmsConfigured();
  if (!email && !sms) return { skipped: "Neither email nor texts are set up" };

  let due: any[] = [];
  const res = await sb.rpc("due_post_trip_messages", { p_delay_minutes: REVIEW_REQUEST_DELAY_MINUTES });
  if (res.error) {
    // Migration 038 not applied yet: email only, the old way.
    const old = await sb.rpc("due_review_requests", { p_delay_minutes: REVIEW_REQUEST_DELAY_MINUTES });
    if (old.error) {
      console.error("[reviews] due_post_trip_messages", res.error, old.error);
      return { error: old.error.message };
    }
    due = (old.data ?? []).map((r: any) => ({ ...r, email_due: true, sms_due: false }));
  } else {
    due = res.data ?? [];
  }

  let sent = 0;
  let failed = 0;
  let texted = 0;
  for (const r of due) {
    const review = reviewUrl(r.review_token);
    const tip = tipUrl(r.review_token);
    const m = await renderMessage(sb, "review_request", {
      name: r.first_name, confirmation: r.confirmation_number, tip_link: tip, review_link: review,
    });

    if (email && r.email_due && r.email && m.emailSubject && m.emailBody) {
      const [res] = await enqueue(sb, [{
        channel: "email",
        to: r.email,
        subject: m.emailSubject,
        text: `${m.emailBody}\n\nTip your driver: ${tip}\n\nLeave a review: ${review}`,
        html: emailHtml(m.emailSubject, m.emailBody, { label: "Tip your driver", url: tip }, settings.business,
          { text: "", label: "Leave a review", url: review, asButton: true }),
        reservationId: r.reservation_id,
        kind: "review_request",
        dedupeKey: `review_request:${r.reservation_id}`,
      }]);
      if (!res.duplicate) {
        if (res.sent) sent++;
        else failed++;
      }
    }

    // enqueue() also re-checks the rider's text opt-in (reservations.sms_consent).
    if (sms && r.sms_due && r.phone && m.sms) {
      const [res] = await enqueue(sb, [{
        channel: "sms",
        to: r.phone,
        text: m.sms,
        reservationId: r.reservation_id,
        kind: "review_request_sms",
        dedupeKey: `review_request_sms:${r.reservation_id}`,
      }]);
      if (!res.duplicate) {
        if (res.sent) texted++;
        else failed++;
      }
    }
  }
  return { due: due.length, sent, texted, failed };
}

// ── The review page ───────────────────────────────────────────────────────────
export interface ReviewForm {
  firstName: string;
  tipUrl: string;
  defaultName: string;
  tripLabel: string;
  googleUrl: string | null;
  existing: { rating: number; body: string; displayName: string; status: string } | null;
}

async function reservationByToken(sb: Db, token: string) {
  if (!TOKEN_RE.test(token)) return null;
  const { data } = await sb
    .from("reservations")
    .select("id, status, customer_id, is_round_trip, customer:customers(first_name, last_name), " +
      "trip:trips!reservations_trip_id_fkey(route:routes(origin_key, destination_key))")
    .eq("review_token", token)
    .is("deleted_at", null)
    .maybeSingle();
  return data;
}

function tripLabelFor(r: any): string {
  const route = r.trip?.route;
  const from = LOCATIONS[route?.origin_key as keyof typeof LOCATIONS]?.short;
  const to = LOCATIONS[route?.destination_key as keyof typeof LOCATIONS]?.short;
  if (!from || !to) return "";
  return r.is_round_trip ? `${from} ⇄ ${to}` : `${from} → ${to}`;
}

export async function loadReviewForm(token: string): Promise<ReviewForm | null> {
  const sb = createAdminDb();
  const r = await reservationByToken(sb, token);
  if (!r || r.status === "cancelled") return null;
  const [{ data: existing }, settings] = await Promise.all([
    sb.from("reviews").select("rating, body, display_name, status").eq("reservation_id", r.id).maybeSingle(),
    loadAppSettings(),
  ]);
  return {
    firstName: r.customer?.first_name ?? "",
    tipUrl: `/tip/${token}`,
    defaultName: defaultDisplayName(r.customer?.first_name ?? "", r.customer?.last_name ?? ""),
    tripLabel: tripLabelFor(r),
    googleUrl: settings.reviews.googleUrl,
    existing: existing
      ? { rating: existing.rating, body: existing.body, displayName: existing.display_name, status: existing.status }
      : null,
  };
}

export type SubmitResult = { ok: true; held: boolean; googleUrl: string | null } | { ok: false; error: string; status?: number };

export async function submitReview(token: string, raw: Record<string, unknown>): Promise<SubmitResult> {
  const sb = createAdminDb();
  const r = await reservationByToken(sb, token);
  if (!r || r.status === "cancelled") return { ok: false, error: "This review link isn't valid.", status: 404 };
  const checked = checkReview(raw);
  if (!checked.ok) return { ok: false, error: checked.error, status: 400 };

  const { error } = await sb.from("reviews").insert({
    reservation_id: r.id,
    customer_id: r.customer_id,
    display_name: checked.value.displayName,
    rating: checked.value.rating,
    body: checked.value.body,
    trip_label: tripLabelFor(r) || null,
    status: checked.holdReason ? "held" : "published",
    hold_reason: checked.holdReason,
  });
  if (error) {
    if (error.code === "23505") return { ok: false, error: "You've already reviewed this trip — thank you!", status: 409 };
    console.error("[reviews] insert", error);
    return { ok: false, error: "Could not save your review. Please try again.", status: 500 };
  }
  invalidateReviewCache();
  const settings = await loadAppSettings();
  return { ok: true, held: !!checked.holdReason, googleUrl: settings.reviews.googleUrl };
}

/** The customer pressed "Also post on Google" (for the owner's stats). */
export async function recordGoogleClick(token: string): Promise<void> {
  const sb = createAdminDb();
  const r = await reservationByToken(sb, token);
  if (!r) return;
  await sb.from("reviews").update({ google_clicked_at: new Date().toISOString() })
    .eq("reservation_id", r.id).is("google_clicked_at", null);
}

// ── Homepage ──────────────────────────────────────────────────────────────────
export interface PublicReview {
  id: string;
  name: string;
  rating: number;
  body: string;
  tripLabel: string | null;
  createdAt: string;
}

const CACHE_MS = 60_000;
// Shared across separately bundled routes (see settings-server.ts).
const g = globalThis as unknown as { __voltReviewCache?: { at: number; value: PublicReview[] } | null };

export function invalidateReviewCache() {
  g.__voltReviewCache = null;
}

/** Newest published reviews (up to 30). Never throws — an empty list hides nothing important. */
export async function getPublishedReviews(): Promise<PublicReview[]> {
  const cached = g.__voltReviewCache;
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.value;
  try {
    const { data, error } = await createAdminDb()
      .from("reviews")
      .select("id, display_name, rating, body, trip_label, created_at")
      .eq("status", "published")
      .order("created_at", { ascending: false })
      .limit(30);
    if (error) throw error;
    const value = (data ?? []).map((r: any) => ({
      id: r.id, name: r.display_name, rating: r.rating, body: r.body, tripLabel: r.trip_label, createdAt: r.created_at,
    }));
    g.__voltReviewCache = { at: Date.now(), value };
    return value;
  } catch (err) {
    console.error("[reviews] could not load published reviews", err);
    return [];
  }
}
