import { NextRequest, NextResponse } from "next/server";
import { requireStaff, type StaffContext } from "@/lib/staff-booking";
import { invalidateReviewCache } from "@/lib/reviews-server";

// Dashboard → Reviews (owners and managers).
//   GET                              → { reviews, stats }
//   POST { id, action: "publish" }   → show on the website
//   POST { id, action: "hide", reason } → take it off the website (content reasons only)

async function requireOwnerOrManager(): Promise<StaffContext | NextResponse> {
  const ctx = await requireStaff();
  if (ctx instanceof NextResponse) return ctx;
  if (!["owner", "manager"].includes(ctx.employee.role)) {
    return NextResponse.json({ error: "Only owners and managers can manage reviews." }, { status: 403 });
  }
  return ctx;
}

export async function GET() {
  const ctx = await requireOwnerOrManager();
  if (ctx instanceof NextResponse) return ctx;
  const { sb } = ctx;
  const [{ data: reviews, error }, { count: requested }] = await Promise.all([
    sb.from("reviews")
      .select("id, display_name, rating, body, trip_label, status, hold_reason, google_clicked_at, moderated_at, created_at, " +
        "reservation:reservations(id, confirmation_number), customer:customers(first_name, last_name, email)")
      .order("created_at", { ascending: false })
      .limit(500),
    sb.from("notifications").select("id", { count: "exact", head: true }).eq("kind", "review_request").eq("status", "sent"),
  ]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ reviews: reviews ?? [], requested: requested ?? 0 });
}

export async function POST(request: NextRequest) {
  const ctx = await requireOwnerOrManager();
  if (ctx instanceof NextResponse) return ctx;
  const body = await request.json().catch(() => ({}));
  const id = String(body?.id ?? "");
  const action = body?.action;
  if (!/^[0-9a-f-]{36}$/i.test(id) || (action !== "publish" && action !== "hide")) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const reason = String(body?.reason ?? "").trim().slice(0, 120);
  if (action === "hide" && !reason) return NextResponse.json({ error: "Say why it's being hidden." }, { status: 400 });

  const { error } = await ctx.sb.from("reviews").update({
    status: action === "publish" ? "published" : "hidden",
    hold_reason: action === "hide" ? reason : null,
    moderated_by_employee_id: ctx.employee.id,
    moderated_at: new Date().toISOString(),
  }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  invalidateReviewCache();
  return NextResponse.json({ ok: true });
}
