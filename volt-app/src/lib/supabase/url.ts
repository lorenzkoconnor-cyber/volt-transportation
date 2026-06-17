// Returns the Supabase project URL, sanitized to the bare origin.
//
// Hostinger's env var for NEXT_PUBLIC_SUPABASE_URL has at times been set to
// ".../rest/v1/" — appending the REST path. supabase-js appends its own
// "/rest/v1", "/auth/v1", etc., so a base URL that already contains "/rest/v1"
// produces doubled paths like "/rest/v1/rest/v1/customers" → PGRST125
// "Invalid path specified in request URL". Stripping any path segment here
// makes the client immune to that misconfiguration.
export function getSupabaseUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    "https://cyohbyklnupxppvztvqn.supabase.co";

  try {
    // Keep only scheme + host (drop /rest/v1, trailing slashes, anything else).
    const u = new URL(raw);
    return `${u.protocol}//${u.host}`;
  } catch {
    // Fallback: strip everything from the first path slash after the host.
    return raw.replace(/^(https?:\/\/[^/]+).*$/, "$1");
  }
}

export const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN5b2hieWtsbnVweHBwdnp0dnFuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1ODkyNTksImV4cCI6MjA5NjE2NTI1OX0.vA1CGQAfsTWjzkUhVD24IbO_CD55N_aNnoZLQg3O_AI";
