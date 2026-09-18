import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient, createAdminClient } from "@/lib/supabase/server";
import { MILITARY_BUCKET } from "@/lib/military";

// GET /api/military/id-url?customerId=...
// Owner/manager only. Returns a short-lived signed URL to view a rider's
// uploaded ID from the private bucket. IDs are never publicly accessible.
export async function GET(request: NextRequest) {
  try {
    const customerId = request.nextUrl.searchParams.get("customerId");
    if (!customerId) {
      return NextResponse.json({ error: "customerId is required" }, { status: 400 });
    }

    const authed = await createServerClient();
    const { data: { user } } = await authed.auth.getUser();
    if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

    const admin = createAdminClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = admin as any;

    const { data: employee } = await sb
      .from("employees")
      .select("role")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .single();
    if (!employee || !["owner", "manager"].includes(employee.role)) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const { data: customer } = await sb
      .from("customers")
      .select("military_id_path")
      .eq("id", customerId)
      .single();
    if (!customer?.military_id_path) {
      return NextResponse.json({ error: "No ID on file for this customer" }, { status: 404 });
    }

    const { data: signed, error } = await sb.storage
      .from(MILITARY_BUCKET)
      .createSignedUrl(customer.military_id_path, 300); // 5 minutes
    if (error || !signed) {
      return NextResponse.json({ error: "Could not generate a link" }, { status: 500 });
    }

    return NextResponse.json({ url: signed.signedUrl });
  } catch (err) {
    console.error("[military/id-url]", err);
    return NextResponse.json({ error: "Failed to load ID" }, { status: 500 });
  }
}
