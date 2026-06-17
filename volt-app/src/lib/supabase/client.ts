// Browser-side Supabase client (use in Client Components)
import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./types";

// Anon key is intentionally public — data is protected by Row Level Security policies.
// Hardcoded as fallback because Hostinger does not inject NEXT_PUBLIC_* vars at build time.
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://cyohbyklnupxppvztvqn.supabase.co";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN5b2hieWtsbnVweHBwdnp0dnFuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1ODkyNTksImV4cCI6MjA5NjE2NTI1OX0.vA1CGQAfsTWjzkUhVD24IbO_CD55N_aNnoZLQg3O_AI";

export function createClient() {
  return createBrowserClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY);
}
