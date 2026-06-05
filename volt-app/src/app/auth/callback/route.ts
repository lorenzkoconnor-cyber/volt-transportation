import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

// GET /auth/callback
// Handles Supabase email confirmation and magic link redirects
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/portal";
  const type = searchParams.get("type");

  if (code) {
    const response = NextResponse.redirect(`${origin}${next}`);

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              response.cookies.set(name, value, options)
            );
          },
        },
      }
    );

    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      // Route based on type
      if (type === "recovery") {
        return NextResponse.redirect(`${origin}/auth/reset-password/update`);
      }
      return response;
    }
  }

  // Auth failed — redirect to login with error
  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
