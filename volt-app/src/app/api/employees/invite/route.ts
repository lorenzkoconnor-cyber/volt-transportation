import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { getSupabaseUrl } from "@/lib/supabase/url";

function adminClient() {
  return createSupabaseClient(
    getSupabaseUrl(),
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

// Verify the caller is a signed-in, active OWNER. Returns the owner's employee
// row on success, or a NextResponse error to return immediately.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function requireOwner(admin: any): Promise<{ ok: true; owner: any } | { ok: false; res: NextResponse }> {
  const authed = await createServerClient();
  const { data: { user } } = await authed.auth.getUser();
  if (!user) {
    return { ok: false, res: NextResponse.json({ error: "Not signed in" }, { status: 401 }) };
  }
  const { data: owner } = await admin
    .from("employees")
    .select("id, role")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .single();
  if (!owner || owner.role !== "owner") {
    return { ok: false, res: NextResponse.json({ error: "Only the owner can manage employee accounts" }, { status: 403 }) };
  }
  return { ok: true, owner };
}

// POST /api/employees/invite
// Owner-only: creates a Supabase auth user with a set password + employee record
export async function POST(request: NextRequest) {
  try {
    const admin = adminClient();
    const auth = await requireOwner(admin);
    if (!auth.ok) return auth.res;

    const { email, firstName, lastName, role, phone, password } = await request.json();

    if (!email || !firstName || !lastName || !role || !password) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    if (password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
    }

    // "owner" is allowed here because this route is already owner-guarded
    // (requireOwner above) — only an existing owner can create another owner.
    const validRoles = ["owner", "manager", "office_staff", "driver"];
    if (!validRoles.includes(role)) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }

    // 1. Create auth user with password set immediately — no email flow needed
    const { data: authData, error: authError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { first_name: firstName, last_name: lastName },
    });

    if (authError) {
      return NextResponse.json({ error: authError.message }, { status: 400 });
    }

    const userId = authData.user.id;

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
      // Clean up the auth user if employee record fails
      await admin.auth.admin.deleteUser(userId);
      return NextResponse.json({ error: empError.message }, { status: 500 });
    }

    // 3. Audit log
    await admin.from("audit_logs").insert({
      actor_id: auth.owner.id,
      actor_role: "owner",
      action: "employee.created",
      table_name: "employees",
      record_id: employee.id,
      new_data: { email, role, first_name: firstName, last_name: lastName },
    });

    return NextResponse.json({ success: true, employee });
  } catch (err) {
    console.error("[employees/create]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// PATCH /api/employees/invite — update role, deactivate, or reset password
export async function PATCH(request: NextRequest) {
  try {
    const admin = adminClient();
    const auth = await requireOwner(admin);
    if (!auth.ok) return auth.res;

    const { employeeId, role, isActive, newPassword, userId } = await request.json();

    // Handle password reset
    if (newPassword && userId) {
      if (newPassword.length < 8) {
        return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
      }
      const { error } = await admin.auth.admin.updateUserById(userId, { password: newPassword });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true });
    }

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
