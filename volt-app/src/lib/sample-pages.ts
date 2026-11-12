// Sample tip and review pages — /tip/sample and /review/sample — opened from the
// "Send me a sample" messages in Settings → Message Wording. They look like the
// real pages but nothing is charged or saved. `?name=` carries the staff
// member's first name so the page greets them like the sample message did.

export const SAMPLE_TOKEN = "sample";

export function sampleFirstName(raw: string | string[] | undefined): string {
  const v = Array.isArray(raw) ? raw[0] : raw;
  const clean = (v ?? "").replace(/[^\p{L}' -]/gu, "").trim().slice(0, 30);
  return clean || "Jordan";
}

export function sampleLinks(home: string, firstName: string | null | undefined) {
  const q = firstName ? `?name=${encodeURIComponent(sampleFirstName(firstName))}` : "";
  return { tip: `${home}/tip/${SAMPLE_TOKEN}${q}`, review: `${home}/review/${SAMPLE_TOKEN}${q}` };
}
