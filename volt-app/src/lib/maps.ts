// iPhone, iPad (iPadOS reports as Macintosh), and Mac
export const isAppleUserAgent = (ua: string) => /iPhone|iPad|iPod|Macintosh/.test(ua);

/** Apple Maps link on Apple devices, Google Maps everywhere else. */
export function mapsUrl(address: string, mode: "directions" | "search", apple: boolean) {
  const q = encodeURIComponent(address);
  if (apple) {
    return mode === "directions" ? `https://maps.apple.com/?daddr=${q}` : `https://maps.apple.com/?q=${q}`;
  }
  return mode === "directions"
    ? `https://www.google.com/maps/dir/?api=1&destination=${q}`
    : `https://www.google.com/maps/search/?api=1&query=${q}`;
}
