// Browser-side Supabase client (use in Client Components)
import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./types";
import { getSupabaseUrl, SUPABASE_ANON_KEY } from "./url";

export function createClient() {
  return createBrowserClient<Database>(getSupabaseUrl(), SUPABASE_ANON_KEY);
}
