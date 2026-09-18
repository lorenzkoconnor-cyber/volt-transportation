import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient, createAdminClient } from "@/lib/supabase/server";
import { MILITARY_BUCKET, isAllowedIdFile, extForMime } from "@/lib/military";

// POST /api/military/upload  (multipart/form-data)
// Fields: file, category ('military'|'first_responder')
//   Signed-in rider: the customer is resolved from their session (client-sent
//   ids are ignored — no tampering).
//   Guest: also send email, phone, firstName, lastName so we can find-or-create
//   a customer record to attach the pending verification to.
//
// Stores the ID in the PRIVATE `military-ids` bucket and flags the customer
// 'pending'. Returns the resolved customerId so the checkout can link the
// reservation that should later receive the 5% refund.
export async function POST(request: NextRequest) {
  try {
    const form = await request.formData();
    const file = form.get("file");
    const category = String(form.get("category") ?? "").trim();

    if (!(file instanceof Blob) || file.size === 0) {
      return NextResponse.json({ error: "No file uploaded." }, { status: 400 });
    }
    if (category !== "military" && category !== "first_responder") {
      return NextResponse.json({ error: "Please choose a category." }, { status: 400 });
    }
    const check = isAllowedIdFile(file.type, file.size);
    if (!check.ok) {
      return NextResponse.json({ error: check.error }, { status: 400 });
    }

    const admin = createAdminClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = admin as any;

    // ── Resolve the customer ─────────────────────────────────────────────────
    let customerId: string | null = null;
    let alreadyApproved = false;

    const authed = await createServerClient();
    const { data: { user } } = await authed.auth.getUser();

    if (user) {
      // Signed-in: always use THIS account, never a client-supplied id.
      const { data: existing } = await sb
        .from("customers")
        .select("id, military_status")
        .eq("user_id", user.id)
        .maybeSingle();
      if (existing) {
        customerId = existing.id;
        alreadyApproved = existing.military_status === "approved";
      } else {
        // Signed-in but no profile row yet — create a minimal one.
        const { data: created, error } = await sb
          .from("customers")
          .insert({
            user_id: user.id,
            first_name: (user.user_metadata?.first_name as string) ?? "—",
            last_name: (user.user_metadata?.last_name as string) ?? "—",
            email: user.email ?? "",
            phone: (user.user_metadata?.phone as string) ?? "",
            is_military: false,
          })
          .select("id")
          .single();
        if (error || !created) throw error ?? new Error("Could not create profile");
        customerId = created.id;
      }
    } else {
      // Guest: find-or-create by email + phone (mirrors /api/booking/create).
      const email = String(form.get("email") ?? "").trim().toLowerCase();
      const phone = String(form.get("phone") ?? "").trim();
      const firstName = String(form.get("firstName") ?? "").trim() || "—";
      const lastName = String(form.get("lastName") ?? "").trim() || "—";
      if (!email || !phone) {
        return NextResponse.json(
          { error: "Sign in, or provide your name, email, and phone to submit for verification." },
          { status: 400 },
        );
      }
      const { data: existing } = await sb
        .from("customers")
        .select("id, military_status")
        .eq("email", email)
        .eq("phone", phone)
        .limit(1)
        .maybeSingle();
      if (existing) {
        customerId = existing.id;
        alreadyApproved = existing.military_status === "approved";
      } else {
        const { data: created, error } = await sb
          .from("customers")
          .insert({ first_name: firstName, last_name: lastName, email, phone, is_military: false })
          .select("id")
          .single();
        if (error || !created) throw error ?? new Error("Could not create record");
        customerId = created.id;
      }
    }

    if (!customerId) {
      return NextResponse.json({ error: "Could not resolve your account." }, { status: 400 });
    }

    // ── Store the ID in the private bucket ───────────────────────────────────
    const buffer = Buffer.from(await file.arrayBuffer());
    const path = `${customerId}/${Date.now()}.${extForMime(file.type)}`;
    const { error: upErr } = await sb.storage
      .from(MILITARY_BUCKET)
      .upload(path, buffer, { contentType: file.type, upsert: true });
    if (upErr) {
      return NextResponse.json({ error: `Upload failed: ${upErr.message}` }, { status: 500 });
    }

    // ── Flag the account. Don't downgrade an already-approved account. ───────
    const update: Record<string, unknown> = {
      military_category: category,
      military_id_path: path,
      military_submitted_at: new Date().toISOString(),
    };
    if (!alreadyApproved) {
      update.military_status = "pending";
      update.military_reviewed_at = null;
      update.military_reviewed_by = null;
    }
    const { error: updErr } = await sb.from("customers").update(update).eq("id", customerId);
    if (updErr) {
      return NextResponse.json({ error: updErr.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      customerId,
      status: alreadyApproved ? "approved" : "pending",
    });
  } catch (err) {
    console.error("[military/upload]", err);
    return NextResponse.json({ error: "Failed to submit verification." }, { status: 500 });
  }
}
