import { NextResponse, type NextRequest } from "next/server";
import { loadAppSettings } from "@/lib/settings-server";
import { isAppleUserAgent, mapsUrl } from "@/lib/maps";

// GET /directions — printed QR codes (rack cards) point here. Sends Apple
// devices to Apple Maps and everyone else to Google Maps, with driving
// directions to the Columbus office.
export async function GET(request: NextRequest) {
  const { business } = await loadAppSettings();
  const apple = isAppleUserAgent(request.headers.get("user-agent") ?? "");
  return NextResponse.redirect(mapsUrl(business.address, "directions", apple), 302);
}
