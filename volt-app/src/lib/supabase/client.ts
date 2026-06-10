// Browser-side Supabase client (use in Client Components)
import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./types";

export function createClient() {
  // Fallback placeholder values keep createBrowserClient from throwing during
  // Next.js build-time prerender when NEXT_PUBLIC_ vars aren't set yet.
  // Real values must be present in the build environment for production use.
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL    || "https://placeholder.supabase.co",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-anon-key"
  );
}
