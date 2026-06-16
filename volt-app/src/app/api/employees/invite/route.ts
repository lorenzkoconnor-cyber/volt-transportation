import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// POST /api/employees/invite
// Owner-only: creates a Supabase auth user invite + employee record
export async function POST(request: NextRequest) {
  try {
    const { email, firstName, lastName, role, phone } = await request.json();

    if (!email || !firstName || !lastName || !role) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const validRoles = ["manager", "office_staff", "driver"];
    if (!validRoles.includes(role)) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }

    const admin = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // 1. Send Supabase invite email
    const inviteRes = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/invite`,
      {
        method: "POST",
        headers: {
          apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
          Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          redirect_to: `${(process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "")}/auth/callback`,
        }),
      }
    );

    const inviteData = await inviteRes.json();
    if (!inviteRes.ok) {
      return NextResponse.json(
        { error: inviteData.msg ?? "Failed to send invite" },
        { status: 400 }
      );
    }

    const userId = inviteData.id;

    // 2. Create employee record
    const { data: employee, error: empError } = await admin
      .from("employees")
      .insert({
        user_id: userId,
        role,
        first_name: firstName,
        last_name: lastName,
        email,
        phone: phone || null,
        is_active: true,
      })
      .select()
      .single();

    if (empError) {
      return NextResponse.json({ error: empError.message }, { status: 500 });
    }

    // 3. Audit log
    await admin.from("audit_logs").insert({
      actor_id: "owner",
      actor_role: "owner",
      action: "employee.invited",
      table_name: "employees",
      record_id: employee.id,
      new_data: { email, role, first_name: firstName, last_name: lastName },
    });

    return NextResponse.json({ success: true, employee });
  } catch (err) {
    console.error("[employees/invite]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// PATCH /api/employees/invite — update role or deactivate
export async function PATCH(request: NextRequest) {
  try {
    const { employeeId, role, isActive } = await request.json();

    const admin = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const updates: Record<string, unknown> = {};
    if (role) updates.role = role;
    if (typeof isActive === "boolean") updates.is_active = isActive;

    const { data, error } = await admin
      .from("employees")
      .update(updates)
      .eq("id", employeeId)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true, employee: data });
  } catch (err) {
    console.error("[employees/update]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
