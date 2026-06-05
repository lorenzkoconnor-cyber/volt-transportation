import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

// GET /auth/callback
// Handles ALL Supabase auth redirects:
//   - Email confirmation (type=signup)
//   - Magic link login (type=magiclink)
//   - Invite acceptance (type=invite)
//   - Password recovery (type=recovery)

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;

  const code      = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type      = searchParams.get("type");
  const next      = searchParams.get("next") ?? "";

  const response = NextResponse.redirect(`${origin}/`);

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // ── Handle PKCE code exchange (most common flow) ─────────────────────────
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      console.error("[auth/callback] Code exchange error:", error.message);
      return NextResponse.redirect(`${origin}/emp-login?error=auth_failed`);
    }
  }

  // ── Handle token_hash (invite & recovery emails) ─────────────────────────
  if (tokenHash && type) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase.auth as any).verifyOtp({
      token_hash: tokenHash,
      type,
    });
    if (error) {
      console.error("[auth/callback] Token verification error:", error.message);
      return NextResponse.redirect(`${origin}/emp-login?error=link_expired`);
    }
  }

  // ── Decide where to redirect after auth ──────────────────────────────────
  if (next) {
    return NextResponse.redirect(`${origin}${next}`);
  }

  // Password recovery → go to set new password page
  if (type === "recovery") {
    return NextResponse.redirect(`${origin}/auth/set-password`);
  }

  // Invite → employee needs to set their password
  if (type === "invite") {
    return NextResponse.redirect(`${origin}/auth/set-password`);
  }

  // Customer email confirmation → portal
  if (type === "signup") {
    return NextResponse.redirect(`${origin}/portal`);
  }

  // Default: check if employee → dashboard, else portal
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    // Check if this user is an employee
    const { data: emp } = await supabase
      .from("employees")
      .select("id")
      .eq("user_id", user.id)
      .single();

    if (emp) {
      return NextResponse.redirect(`${origin}/admin`);
    }
  }

  return NextResponse.redirect(`${origin}/portal`);
}
