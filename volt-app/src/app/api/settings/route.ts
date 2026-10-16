import { NextRequest, NextResponse } from "next/server";
import { requireStaff, type StaffContext } from "@/lib/staff-booking";
import { invalidateSettingsCache } from "@/lib/settings-server";
import { invalidateTemplateCache } from "@/lib/reservation-messages";
import { FIELD_BY_COLUMN, SETTINGS_FIELDS, crossFieldError, displayValue, parseField } from "@/lib/settings-fields";
import { TEMPLATES, unknownPlaceholders, type TemplateKey } from "@/lib/message-templates";
import { createBlackout, removeBlackout, type BlackoutDirection } from "@/lib/blackouts";
import { easternInstant } from "@/lib/staff-pricing";
import { easternToday } from "@/lib/format";
import { displayTime12h } from "@/lib/booking";
import { ALERT_TYPES } from "@/lib/alert-types";

/* eslint-disable @typescript-eslint/no-explicit-any */

// Dashboard → Settings. Owners and managers only. Every save is validated
// here and written to settings_changes (who / when / what) for the history.
//
// GET  → everything the Settings page shows.
// POST { action, ... } → save one section (see the switch below).

async function requireOwnerOrManager(): Promise<StaffContext | NextResponse> {
  const ctx = await requireStaff();
  if (ctx instanceof NextResponse) return ctx;
  if (!["owner", "manager"].includes(ctx.employee.role)) {
    return NextResponse.json({ error: "Only an owner or manager can change settings." }, { status: 403 });
  }
  return ctx;
}

async function logChange(ctx: StaffContext, area: string, summary: string[]) {
  if (!summary.length) return;
  await ctx.sb.from("settings_changes").insert({
    employee_id: ctx.employee.id, employee_name: ctx.employee.name, area, summary,
  });
}

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// "2026-10-20" + "06:00" (Eastern) → ISO instant
function etIso(date: string, time: string): string | null {
  if (!DATE_RE.test(date) || !TIME_RE.test(time)) return null;
  return new Date(easternInstant(date, time)).toISOString();
}

export async function GET() {
  const ctx = await requireOwnerOrManager();
  if (ctx instanceof NextResponse) return ctx;
  const { sb } = ctx;
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const [settings, routes, templates, blackouts, announcements, history] = await Promise.all([
    sb.from("booking_settings").select("*").maybeSingle(),
    sb.from("routes")
      .select("id, name, origin_key, duration_minutes, first_departure_time, last_departure_time, departure_interval_minutes")
      .eq("is_active", true).order("origin_key", { ascending: false }),
    sb.from("message_templates").select("*"),
    sb.from("service_blackouts").select("*").or(`removed_at.is.null,removed_at.gt.${since}`).order("starts_at", { ascending: false }).limit(30),
    sb.from("site_announcements").select("*").order("created_at", { ascending: false }).limit(20),
    sb.from("settings_changes").select("*").order("created_at", { ascending: false }).limit(60),
  ]);
  return NextResponse.json({
    settings: settings.data,
    routes: routes.data ?? [],
    templates: templates.data ?? [],
    blackouts: blackouts.data ?? [],
    announcements: announcements.data ?? [],
    history: history.data ?? [],
  });
}

export async function POST(request: NextRequest) {
  const ctx = await requireOwnerOrManager();
  if (ctx instanceof NextResponse) return ctx;
  const { sb } = ctx;
  const body = await request.json().catch(() => ({}));

  try {
    switch (body.action) {
      // ── Prices, rules, reminders, discounts, business info, flight windows ──
      case "save_general": {
        const { data: current } = await sb.from("booking_settings").select("*").maybeSingle();
        if (!current) return bad("Settings row is missing.", 500);
        const values = body.values ?? {};
        const update: Record<string, unknown> = {};
        for (const [col, raw] of Object.entries(values)) {
          const f = FIELD_BY_COLUMN.get(col);
          if (!f) continue;
          const parsed = parseField(f, raw);
          if ("error" in parsed) return bad(parsed.error);
          if (parsed.value !== current[col]) update[col] = parsed.value;
        }
        const merged = { ...current, ...update };
        const crossErr = crossFieldError(merged);
        if (crossErr) return bad(crossErr);

        // Route drive times.
        const durationLines: string[] = [];
        const durations: { id: string; duration_minutes: number }[] = Array.isArray(body.routeDurations) ? body.routeDurations : [];
        const { data: routes } = await sb.from("routes").select("id, name, duration_minutes");
        for (const d of durations) {
          const r = (routes ?? []).find((x: any) => x.id === d.id);
          const n = Number(d.duration_minutes);
          if (!r) continue;
          if (!Number.isInteger(n) || n < 30 || n > 300) return bad("Route time must be a whole number of minutes between 30 and 300.");
          if (n !== r.duration_minutes) {
            await sb.from("routes").update({ duration_minutes: n }).eq("id", r.id);
            durationLines.push(`${r.name} drive time: ${r.duration_minutes} → ${n} min`);
          }
        }

        const lines = SETTINGS_FIELDS
          .filter((f) => f.column in update)
          .map((f) => `${f.label}: ${displayValue(f, current[f.column])} → ${displayValue(f, update[f.column])}`);
        if (Object.keys(update).length) {
          const { error } = await sb.from("booking_settings")
            .update({ ...update, updated_by: ctx.employee.id, updated_at: new Date().toISOString() }).eq("id", true);
          if (error) throw error;
        }

        // Optionally resize upcoming vans that are still at the old default size.
        let resized = 0;
        if ("default_van_capacity" in update && body.applyCapacityToUpcoming) {
          const next = update.default_van_capacity as number;
          const { data } = await sb.from("trips")
            .update({ total_capacity: next })
            .gte("departure_date", easternToday())
            .eq("status", "scheduled")
            .eq("total_capacity", current.default_van_capacity)
            .lte("seats_booked", next)
            .select("id");
          resized = data?.length ?? 0;
          lines.push(`Resized ${resized} upcoming departures to ${next} seats`);
        }

        await logChange(ctx, "Booking settings", [...lines, ...durationLines]);
        invalidateSettingsCache();
        return NextResponse.json({ ok: true, changed: lines.length + durationLines.length, resized });
      }

      // ── Daily schedule ─────────────────────────────────────────────────────
      case "save_schedule": {
        const input: any[] = Array.isArray(body.routes) ? body.routes : [];
        const { data: routes } = await sb.from("routes")
          .select("id, name, first_departure_time, last_departure_time, departure_interval_minutes");
        const lines: string[] = [];
        for (const r of input) {
          const cur = (routes ?? []).find((x: any) => x.id === r.id);
          if (!cur) continue;
          const first = String(r.first ?? ""), last = String(r.last ?? ""), interval = Number(r.interval);
          if (!TIME_RE.test(first) || !TIME_RE.test(last)) return bad(`${cur.name}: enter times like 06:00.`);
          if (last < first) return bad(`${cur.name}: the last departure must be after the first.`);
          if (!Number.isInteger(interval) || interval < 15 || interval > 1440) return bad(`${cur.name}: departures must be 15–1440 minutes apart.`);
          const was = { first: cur.first_departure_time.slice(0, 5), last: cur.last_departure_time.slice(0, 5), interval: cur.departure_interval_minutes };
          if (was.first === first && was.last === last && was.interval === interval) continue;
          await sb.from("routes").update({ first_departure_time: first, last_departure_time: last, departure_interval_minutes: interval }).eq("id", cur.id);
          lines.push(
            `${cur.name}: ${displayTime12h(was.first)}–${displayTime12h(was.last)} every ${was.interval} min → ` +
            `${displayTime12h(first)}–${displayTime12h(last)} every ${interval} min`,
          );
        }
        if (!lines.length) return NextResponse.json({ ok: true, changed: 0 });
        const { data: applied, error } = await sb.rpc("apply_route_schedule");
        if (error) throw error;
        const res = applied?.[0] ?? { removed: 0, added: 0, kept_with_riders: 0 };
        lines.push(`Upcoming departures: ${res.added} added, ${res.removed} empty ones removed` +
          (res.kept_with_riders ? `, ${res.kept_with_riders} with riders kept at their old times` : ""));
        await logChange(ctx, "Daily schedule", lines);
        invalidateSettingsCache();
        return NextResponse.json({ ok: true, changed: lines.length, ...res });
      }

      // ── Message wording ────────────────────────────────────────────────────
      case "save_template":
      case "reset_template": {
        const key = body.key as TemplateKey;
        const info = TEMPLATES.find((t) => t.key === key);
        if (!info) return bad("Unknown message.");
        if (body.action === "reset_template") {
          await sb.from("message_templates").delete().eq("key", key);
          await logChange(ctx, "Message wording", [`${info.label}: reset to the default wording`]);
          invalidateTemplateCache();
          return NextResponse.json({ ok: true });
        }
        const sms = String(body.sms ?? "").slice(0, 1200);
        const emailSubject = info.hasEmail ? String(body.emailSubject ?? "").slice(0, 200) : "";
        const emailBody = info.hasEmail ? String(body.emailBody ?? "").slice(0, 5000) : "";
        const unknown = unknownPlaceholders(key, `${sms}\n${emailSubject}\n${emailBody}`);
        if (unknown.length) return bad(`These placeholders don't exist for this message: ${unknown.map((u) => `{${u}}`).join(", ")}`);
        await sb.from("message_templates").upsert({
          key, sms_body: sms.trim() || null, email_subject: emailSubject.trim() || null, email_body: emailBody.trim() || null,
          updated_at: new Date().toISOString(), updated_by_name: ctx.employee.name,
        });
        await logChange(ctx, "Message wording", [`${info.label}: wording updated`]);
        invalidateTemplateCache();
        const warning = key === "confirmation" && sms.trim() && !/STOP/i.test(sms)
          ? "Carriers require opt-out wording — keep \"Reply STOP to opt out\" in the confirmation text."
          : null;
        return NextResponse.json({ ok: true, warning });
      }

      // ── Blackout dates / service pauses ────────────────────────────────────
      case "create_blackout": {
        const startsAt = etIso(String(body.startDate ?? ""), String(body.startTime ?? ""));
        const endsAt = etIso(String(body.endDate ?? ""), String(body.endTime ?? ""));
        if (!startsAt || !endsAt) return bad("Enter a start and end date and time.");
        if (endsAt <= startsAt) return bad("The end must be after the start.");
        if (new Date(endsAt).getTime() <= Date.now()) return bad("That time range is already over.");
        const direction = (["both", "to_atl", "from_atl"].includes(body.direction) ? body.direction : "both") as BlackoutDirection;
        const reason = String(body.reason ?? "").trim().slice(0, 200);
        if (!reason) return bad("Give a short reason (riders see it), e.g. \"ice storm\".");
        const res = await createBlackout(sb, ctx.employee, {
          startsAt, endsAt, direction, reason, cancelBookings: body.cancelBookings === true,
        });
        await logChange(ctx, "Service pause", [
          `Paused ${direction === "both" ? "both directions" : direction === "to_atl" ? "Columbus → ATL" : "ATL → Columbus"} ` +
          `${body.startDate} ${displayTime12h(body.startTime)} – ${body.endDate} ${displayTime12h(body.endTime)} (${reason})`,
          `${res.tripsCancelled} departures cancelled; ${res.affected.length} bookings ${body.cancelBookings ? "cancelled & refunded" : "notified"}`,
        ]);
        return NextResponse.json({ ok: true, tripsCancelled: res.tripsCancelled, affected: res.affected });
      }
      case "remove_blackout": {
        const res = await removeBlackout(sb, ctx.employee, String(body.id ?? ""));
        if ("error" in res) return bad(res.error ?? "Could not remove it.");
        await logChange(ctx, "Service pause", [`Removed a service pause — ${res.reopened} departures reopened`]);
        return NextResponse.json({ ok: true, ...res });
      }

      // ── Website banner ─────────────────────────────────────────────────────
      case "create_announcement": {
        const message = String(body.message ?? "").trim();
        if (!message || message.length > 300) return bad("Write a message of up to 300 characters.");
        const linkUrl = String(body.linkUrl ?? "").trim();
        if (linkUrl && !/^(https?:\/\/|\/)/.test(linkUrl)) return bad("The link must start with https:// or / (a page on this site).");
        let startsAt = new Date().toISOString();
        if (body.startDate) {
          const iso = etIso(String(body.startDate), String(body.startTime || "00:00"));
          if (!iso) return bad("Check the start date.");
          startsAt = iso;
        }
        let endsAt: string | null = null;
        if (body.endDate) {
          endsAt = etIso(String(body.endDate), String(body.endTime || "23:59"));
          if (!endsAt) return bad("Check the end date.");
          if (endsAt <= startsAt) return bad("The banner must end after it starts.");
        }
        // One banner at a time: end any that are still live.
        await sb.from("site_announcements").update({ is_active: false }).eq("is_active", true);
        await sb.from("site_announcements").insert({
          message, link_url: linkUrl || null, link_label: String(body.linkLabel ?? "").trim().slice(0, 40) || null,
          starts_at: startsAt, ends_at: endsAt, is_active: true, created_by_name: ctx.employee.name,
        });
        await logChange(ctx, "Website banner", [`Banner posted: "${message.slice(0, 80)}"`]);
        invalidateSettingsCache();
        return NextResponse.json({ ok: true });
      }
      case "end_announcement": {
        await sb.from("site_announcements").update({ is_active: false }).eq("id", String(body.id ?? ""));
        await logChange(ctx, "Website banner", ["Banner taken down"]);
        invalidateSettingsCache();
        return NextResponse.json({ ok: true });
      }

      // ── Staff alert recipients ─────────────────────────────────────────────
      case "save_alerts": {
        const valid = new Set<string>(ALERT_TYPES.map((a) => a.type));
        const rows: any[] = Array.isArray(body.rows) ? body.rows : [];
        const { data: emps } = await sb.from("employees").select("id, first_name, last_name");
        const name = (id: string) => {
          const e = (emps ?? []).find((x: any) => x.id === id);
          return e ? `${e.first_name} ${e.last_name}` : "Someone";
        };
        const label = (t: string) => ALERT_TYPES.find((a) => a.type === t)?.label ?? t;
        const lines: string[] = [];
        for (const r of rows) {
          if (!valid.has(r.alert_type) || !(emps ?? []).some((e: any) => e.id === r.employee_id)) continue;
          const sms = !!r.via_sms, email = !!r.via_email;
          if (!sms && !email) {
            await sb.from("staff_alert_subscriptions").delete().eq("employee_id", r.employee_id).eq("alert_type", r.alert_type);
            lines.push(`${label(r.alert_type)}: ${name(r.employee_id)} removed`);
          } else {
            await sb.from("staff_alert_subscriptions").upsert({
              employee_id: r.employee_id, alert_type: r.alert_type, via_sms: sms, via_email: email, updated_at: new Date().toISOString(),
            });
            lines.push(`${label(r.alert_type)}: ${name(r.employee_id)} — ${[sms && "text", email && "email"].filter(Boolean).join(" + ")}`);
          }
        }
        await logChange(ctx, "Staff alerts", lines);
        return NextResponse.json({ ok: true });
      }

      default:
        return bad("Unknown action.");
    }
  } catch (err) {
    console.error("[settings]", err);
    return bad(err instanceof Error ? err.message : "Could not save settings.", 500);
  }
}
