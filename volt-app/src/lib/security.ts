// ─── Safe in-app redirects ────────────────────────────────────────────────────
// Only same-site paths like "/portal" are allowed. Rejects "//evil.com",
// "/\evil.com", "https://evil.com" and "@evil.com" (which turns
// `${origin}${next}` into "https://volt-transportation.com@evil.com").
export function safeRedirectPath(value: string | null | undefined, fallback: string): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return fallback;
  return value;
}
