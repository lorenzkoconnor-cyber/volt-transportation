import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient, createAdminClient } from "@/lib/supabase/server";
import { settleMilitaryBookings } from "@/lib/stripe/holds";

// POST /api/military/review  { customerId, decision, reservationId? }
// Owner/manager only. Settles every booking the rider made while their
// Military Discount verification was pending:
//
//   approve      → account verified; card holds captured at 90%. Bookings that
//                  were already charged in full get the 10% refunded.
//   reject       → account not eligible; card holds captured at 100%.
//   unverifiable → verification couldn't be completed (or a hold is about to
//                  expire): holds captured at 100%, account stays in review.
//                  If the rider is approved later, "approve" refunds the 10%.
//                  Pass reservationId to settle just one booking.
import type { MilitaryDecision as Decision } from "@/lib/stripe/holds";

export async function POST(request: NextRequest) {
  try {
    const { customerId, decision, reservationId } = await request.json() as {
      customerId?: string; decision?: Decision; reservationId?: string;
    };
    if (!customerId || !["approve", "reject", "unverifiable"].includes(decision ?? "")) {
      return NextResponse.json({ error: "customerId and a valid decision are required" }, { status: 400 });
    }

    // ── Authorize: owner or manager ──────────────────────────────────────────
    const authed = await createServerClient();
    const { data: { user } } = await authed.auth.getUser();
    if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = createAdminClient() as any;

    const { data: employee } = await sb
      .from("employees")
      .select("id, role")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .single();
    if (!employee || !["owner", "manager"].includes(employee.role)) {
      return NextResponse.json({ error: "Only an owner or manager can review verifications" }, { status: 403 });
    }

    const { data: customer } = await sb
      .from("customers")
      .select("id, military_status")
      .eq("id", customerId)
      .single();
    if (!customer) return NextResponse.json({ error: "Customer not found" }, { status: 404 });

    const now = new Date().toISOString();

    if (decision === "approve" || decision === "reject") {
      await sb.from("customers").update({
        military_status: decision === "approve" ? "approved" : "rejected",
        is_military: decision === "approve",
        military_reviewed_at: now,
        military_reviewed_by: employee.id,
      }).eq("id", customerId);
    }

    const summary = await settleMilitaryBookings(sb, customerId, decision!, employee.id, reservationId);

    await sb.from("audit_logs").insert({
      actor_id: user.id, actor_role: employee.role,
      action: `military.${decision}`, table_name: "customers", record_id: customerId,
      new_data: { decision, reservationId: reservationId ?? null, ...summary },
    });

    return NextResponse.json({
      success: true,
      status: decision === "approve" ? "approved" : decision === "reject" ? "rejected" : "pending",
      ...summary,
    });
  } catch (err) {
    console.error("[military/review]", err);
    return NextResponse.json({ error: "Failed to record decision" }, { status: 500 });
  }
}
