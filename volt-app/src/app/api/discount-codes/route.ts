import { NextRequest, NextResponse } from "next/server";
import { randomInt } from "crypto";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminDb } from "@/lib/checkout";
import { CODE_ALPHABET, CODE_LENGTH, DISCOUNT_CODE_DAYS, checkCustomCode } from "@/lib/discount-codes";

// /api/discount-codes — owner/manager only.
//   GET                                        → recent codes (newest first)
//   POST  { type, value, note, customCode? }   → create a one-time code
//         type 'percent': value = 1–100 · type 'fixed': value = dollars (≥ $1)
//         customCode: optional; otherwise a random code is generated
//   PATCH { id, action: 'revoke' }             → cancel an unused code

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function requireOwnerOrManager(): Promise<{ sb: any; employee: { id: string; role: string } } | NextResponse> {
  const authed = await createServerClient();
  const { data: { user } } = await authed.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const sb = createAdminDb();
  const { data: employee } = await sb
    .from("employees")
    .select("id, role")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .single();
  if (!employee || !["owner", "manager"].includes(employee.role)) {
    return NextResponse.json({ error: "Only an owner or manager can manage discount codes" }, { status: 403 });
  }
  return { sb, employee };
}

function generateCode(): string {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return code;
}

export async function GET() {
  const auth = await requireOwnerOrManager();
  if (auth instanceof NextResponse) return auth;

  const { data, error } = await auth.sb
    .from("discount_codes")
    .select(
      "id, code, discount_type, value, note, created_at, expires_at, used_at, revoked_at, " +
      "creator:employees!discount_codes_created_by_fkey(first_name, last_name), " +
      "reservation:reservations!discount_codes_used_reservation_id_fkey(confirmation_number)"
    )
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ codes: data ?? [] });
}

export async function POST(request: NextRequest) {
  const auth = await requireOwnerOrManager();
  if (auth instanceof NextResponse) return auth;
  const { sb, employee } = auth;

  const body = await request.json().catch(() => ({}));
  const type = body.type === "fixed" ? "fixed" : body.type === "percent" ? "percent" : null;
  const note = String(body.note ?? "").trim().slice(0, 300);
  const raw = Number(body.value);

  if (!type) return NextResponse.json({ error: "Choose a percentage or a dollar amount." }, { status: 400 });
  if (!note) return NextResponse.json({ error: "Add a note — who the code is for and why." }, { status: 400 });

  let value: number;
  if (type === "percent") {
    if (!Number.isInteger(raw) || raw < 1 || raw > 100) {
      return NextResponse.json({ error: "Percentage must be a whole number from 1 to 100." }, { status: 400 });
    }
    value = raw;
  } else {
    value = Math.round(raw * 100);
    if (!Number.isFinite(raw) || value < 100 || value > 100_000) {
      return NextResponse.json({ error: "Dollar amount must be between $1 and $1,000." }, { status: 400 });
    }
  }

  let customCode: string | null = null;
  if (String(body.customCode ?? "").trim()) {
    const checked = checkCustomCode(String(body.customCode));
    if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 });
    customCode = checked.code;
  }

  const expiresAt = new Date(Date.now() + DISCOUNT_CODE_DAYS * 86_400_000).toISOString();

  // Retry on the (very unlikely) chance a generated code already exists.
  for (let attempt = 0; attempt < (customCode ? 1 : 5); attempt++) {
    const { data, error } = await sb
      .from("discount_codes")
      .insert({
        code: customCode ?? generateCode(),
        discount_type: type,
        value,
        note,
        created_by: employee.id,
        expires_at: expiresAt,
      })
      .select("id, code, discount_type, value, note, created_at, expires_at")
      .single();
    if (!error && data) {
      await sb.from("audit_logs").insert({
        actor_id: employee.id, actor_role: employee.role,
        action: "discount_code.created", table_name: "discount_codes", record_id: data.id,
        new_data: { type, value, note, expires_at: expiresAt, custom: !!customCode },
      });
      return NextResponse.json({ code: data });
    }
    if (error?.code !== "23505") {
      console.error("[discount-codes] create failed", error);
      return NextResponse.json({ error: "Could not create the code." }, { status: 500 });
    }
    // Codes are one-time forever, so a code that ever existed can't be reused.
    if (customCode) {
      return NextResponse.json(
        { error: `"${customCode}" has already been used for a code. Choose a different one, or leave it blank to auto-generate.` },
        { status: 409 },
      );
    }
  }
  return NextResponse.json({ error: "Could not create the code. Try again." }, { status: 500 });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireOwnerOrManager();
  if (auth instanceof NextResponse) return auth;
  const { sb, employee } = auth;

  const { id, action } = await request.json().catch(() => ({}));
  if (!id || action !== "revoke") return NextResponse.json({ error: "id and action 'revoke' are required" }, { status: 400 });

  const { data } = await sb
    .from("discount_codes")
    .update({ revoked_at: new Date().toISOString(), revoked_by: employee.id })
    .eq("id", id)
    .is("used_at", null)
    .is("revoked_at", null)
    .select("id");
  if (!data || data.length === 0) {
    return NextResponse.json({ error: "That code has already been used or cancelled." }, { status: 409 });
  }
  await sb.from("audit_logs").insert({
    actor_id: employee.id, actor_role: employee.role,
    action: "discount_code.revoked", table_name: "discount_codes", record_id: id, new_data: {},
  });
  return NextResponse.json({ success: true });
}
