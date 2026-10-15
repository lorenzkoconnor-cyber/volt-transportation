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

    // 1. Create the auth user with a password set immediately (no email flow).
    const { data: authData, error: authError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { first_name: firstName, last_name: lastName },
    });

    let userId: string;
    let linkedExisting = false;

    if (authError) {
      // The email may already belong to a Volt account (e.g. the person signed
      // up as a customer first). Rather than fail, link that existing account.
      const alreadyRegistered = /already been registered|already exists|already registered/i.test(authError.message);
      if (!alreadyRegistered) {
        return NextResponse.json({ error: authError.message }, { status: 400 });
      }

      // Find the existing auth user id — check the customers table first
      // (indexed), then fall back to scanning the auth user list.
      let existingUserId: string | null = null;
      const { data: custRow } = await admin
        .from("customers")
        .select("user_id")
        .eq("email", email)
        .not("user_id", "is", null)
        .limit(1)
        .maybeSingle();
      if (custRow?.user_id) {
        existingUserId = custRow.user_id;
      } else {
        const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
        const match = list?.users?.find((u: { id: string; email?: string }) => u.email?.toLowerCase() === email.toLowerCase());
        existingUserId = match?.id ?? null;
      }

      if (!existingUserId) {
        return NextResponse.json(
          { error: "That email is already registered but the account couldn't be located. Contact support." },
          { status: 409 }
        );
      }

      // Already a staff member?
      const { data: existingEmp } = await admin
        .from("employees")
        .select("id, role")
        .eq("user_id", existingUserId)
        .maybeSingle();
      if (existingEmp) {
        return NextResponse.json(
          { error: `That email is already a staff member (${existingEmp.role}). Change their role from the list instead.` },
          { status: 400 }
        );
      }

      // Set the password the owner just entered so the new staff member can
      // sign in with it, and adopt them as an employee.
      await admin.auth.admin.updateUserById(existingUserId, { password });
      userId = existingUserId;
      linkedExisting = true;
    } else {
      userId = authData!.user.id;
    }

    // 2. Create the employee record.
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
      // Clean up the auth user only if WE created it in this request.
      if (!linkedExisting) await admin.auth.admin.deleteUser(userId);
      return NextResponse.json({ error: empError.message }, { status: 500 });
    }

    // 3. Audit log
    await admin.from("audit_logs").insert({
      actor_id: auth.owner.id,
      actor_role: "owner",
      action: linkedExisting ? "employee.linked_existing" : "employee.created",
      table_name: "employees",
      record_id: employee.id,
      new_data: { email, role, first_name: firstName, last_name: lastName, linked_existing: linkedExisting },
    });

    return NextResponse.json({ success: true, employee, linkedExisting });
  } catch (err) {
    console.error("[employees/create]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// Owner or manager. Managers may only manage office staff and drivers (plus
// edit their own details); everything else on this route stays owner-only.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function requireOwnerOrManager(admin: any): Promise<{ ok: true; actor: any } | { ok: false; res: NextResponse }> {
  const authed = await createServerClient();
  const { data: { user } } = await authed.auth.getUser();
  if (!user) {
    return { ok: false, res: NextResponse.json({ error: "Not signed in" }, { status: 401 }) };
  }
  const { data: actor } = await admin
    .from("employees")
    .select("id, role")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .single();
  if (!actor || !["owner", "manager"].includes(actor.role)) {
    return { ok: false, res: NextResponse.json({ error: "Only an owner or manager can do that" }, { status: 403 }) };
  }
  return { ok: true, actor };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function canManage(actor: any, target: any): boolean {
  if (actor.role === "owner") return true;
  return ["office_staff", "driver"].includes(target.role);
}

// PATCH /api/employees/invite
//   { employeeId, firstName?, lastName?, email?, phone? } → edit details (owner, or manager for staff/drivers/self)
//   { employeeId, role? , isActive? }                     → owner only
//   { employeeId, newPassword }                           → owner only
export async function PATCH(request: NextRequest) {
  try {
    const admin = adminClient();
    const auth = await requireOwnerOrManager(admin);
    if (!auth.ok) return auth.res;
    const body = await request.json();
    const { employeeId, role, isActive, newPassword } = body;
    if (!employeeId) return NextResponse.json({ error: "employeeId is required" }, { status: 400 });

    const { data: target } = await admin.from("employees").select("*").eq("id", employeeId).maybeSingle();
    if (!target) return NextResponse.json({ error: "Employee not found" }, { status: 404 });

    const ownerOnly = !!newPassword || role !== undefined || typeof isActive === "boolean";
    if (ownerOnly) {
      if (auth.actor.role !== "owner") {
        return NextResponse.json({ error: "Only the owner can manage employee accounts" }, { status: 403 });
      }

      if (newPassword) {
        if (String(newPassword).length < 8) {
          return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
        }
        // Always the employee's own login — never an arbitrary user id from the browser.
        const { error } = await admin.auth.admin.updateUserById(target.user_id, { password: newPassword });
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ success: true });
      }

      const updates: Record<string, unknown> = {};
      if (role) {
        if (!["owner", "manager", "office_staff", "driver"].includes(role)) {
          return NextResponse.json({ error: "Invalid role" }, { status: 400 });
        }
        updates.role = role;
      }
      if (typeof isActive === "boolean") updates.is_active = isActive;
      const { data, error } = await admin.from("employees").update(updates).eq("id", employeeId).select().single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true, employee: data });
    }

    // ── Edit details ─────────────────────────────────────────────────────────
    if (!canManage(auth.actor, target) && auth.actor.id !== target.id) {
      return NextResponse.json({ error: "Managers can only edit office staff, drivers, and their own details." }, { status: 403 });
    }

    const firstName = String(body.firstName ?? target.first_name).trim().slice(0, 60);
    const lastName = String(body.lastName ?? target.last_name).trim().slice(0, 60);
    const email = String(body.email ?? target.email).trim().toLowerCase().slice(0, 200);
    const phone = String(body.phone ?? target.phone ?? "").trim().slice(0, 30);
    if (!firstName || !lastName) return NextResponse.json({ error: "First and last name are required" }, { status: 400 });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: "Enter a valid email" }, { status: 400 });

    // Email is also their sign-in — change the login first so the two never disagree.
    if (email !== target.email.toLowerCase()) {
      const { data: taken } = await admin.from("employees").select("id").eq("email", email).neq("id", target.id).maybeSingle();
      if (taken) return NextResponse.json({ error: "Another employee already uses that email" }, { status: 400 });
      const { error: authErr } = await admin.auth.admin.updateUserById(target.user_id, { email, email_confirm: true });
      if (authErr) return NextResponse.json({ error: authErr.message }, { status: 400 });
    }

    const { data, error } = await admin
      .from("employees")
      .update({ first_name: firstName, last_name: lastName, email, phone: phone || null })
      .eq("id", employeeId)
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await admin.from("audit_logs").insert({
      actor_id: auth.actor.id,
      actor_role: auth.actor.role,
      action: "employee.updated",
      table_name: "employees",
      record_id: employeeId,
      old_data: { first_name: target.first_name, last_name: target.last_name, email: target.email, phone: target.phone },
      new_data: { first_name: firstName, last_name: lastName, email, phone: phone || null },
    });
    return NextResponse.json({ success: true, employee: data });
  } catch (err) {
    console.error("[employees/update]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// DELETE /api/employees/invite  { employeeId }
// Permanently removes an INACTIVE employee (owner, or manager for office staff /
// drivers). Their past bookings, edits and refunds keep the name on record.
// The login is deleted too — unless it's also a customer account, which stays.
export async function DELETE(request: NextRequest) {
  try {
    const admin = adminClient();
    const auth = await requireOwnerOrManager(admin);
    if (!auth.ok) return auth.res;

    const { employeeId } = await request.json().catch(() => ({}));
    const { data: target } = await admin.from("employees").select("*").eq("id", employeeId ?? "").maybeSingle();
    if (!target) return NextResponse.json({ error: "Employee not found" }, { status: 404 });
    if (target.id === auth.actor.id) return NextResponse.json({ error: "You can't delete yourself" }, { status: 400 });
    if (target.role === "owner") return NextResponse.json({ error: "Owner accounts can't be deleted" }, { status: 400 });
    if (target.is_active) return NextResponse.json({ error: "Deactivate the employee before deleting them" }, { status: 400 });
    if (!canManage(auth.actor, target)) {
      return NextResponse.json({ error: "Managers can only delete office staff and drivers." }, { status: 403 });
    }

    const { error } = await admin.from("employees").delete().eq("id", target.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const { data: customer } = await admin.from("customers").select("id").eq("user_id", target.user_id).limit(1).maybeSingle();
    if (!customer) {
      const { error: authErr } = await admin.auth.admin.deleteUser(target.user_id);
      if (authErr) console.error("[employees/delete] login not removed", authErr);
    }

    await admin.from("audit_logs").insert({
      actor_id: auth.actor.id,
      actor_role: auth.actor.role,
      action: "employee.deleted",
      table_name: "employees",
      record_id: target.id,
      old_data: { first_name: target.first_name, last_name: target.last_name, email: target.email, role: target.role },
      new_data: { login_deleted: !customer },
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[employees/delete]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
