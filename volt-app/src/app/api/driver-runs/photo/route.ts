import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/staff-booking";
import { SPOT_COLUMN_BY_TERMINAL, UUID_RE } from "@/lib/driver-runs-server";
import { invalidateSettingsCache } from "@/lib/settings-server";

// POST /api/driver-runs/photo  (multipart: file, kind = "driver" | "spot", driverId | terminal)
// Owners/managers upload a driver's photo (shown to riders on the tracking
// page) or a photo of an ATL pickup spot. Stored in the public team-photos bucket.
const TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

export async function POST(request: NextRequest) {
  const ctx = await requireStaff(["owner", "manager"]);
  if (ctx instanceof NextResponse) return ctx;
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  const kind = String(form?.get("kind") ?? "");
  if (!(file instanceof Blob) || !file.size) return NextResponse.json({ error: "Choose a photo." }, { status: 400 });
  const ext = TYPES[file.type];
  if (!ext) return NextResponse.json({ error: "Use a JPG, PNG or WebP photo." }, { status: 400 });
  if (file.size > 8 * 1024 * 1024) return NextResponse.json({ error: "That photo is too big (8 MB max)." }, { status: 400 });

  let path: string;
  let save: (url: string) => Promise<{ error: unknown }>;
  if (kind === "driver") {
    const driverId = String(form?.get("driverId") ?? "");
    if (!UUID_RE.test(driverId)) return NextResponse.json({ error: "Driver not found." }, { status: 400 });
    path = `drivers/${driverId}-${Date.now()}.${ext}`;
    save = async (url) => ctx.sb.from("drivers").update({ photo_url: url }).eq("id", driverId);
  } else if (kind === "spot") {
    const terminal = String(form?.get("terminal") ?? "");
    const col = SPOT_COLUMN_BY_TERMINAL[terminal];
    if (!col) return NextResponse.json({ error: "Pick a terminal." }, { status: 400 });
    path = `atl-spots/${col}-${Date.now()}.${ext}`;
    save = async (url) => {
      const r = await ctx.sb.from("booking_settings").update({ [`${col}_photo`]: url }).eq("id", true);
      invalidateSettingsCache();
      return r;
    };
  } else return NextResponse.json({ error: "Unknown photo." }, { status: 400 });

  const up = await ctx.sb.storage.from("team-photos").upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type, upsert: false });
  if (up.error) {
    console.error("[photo] upload", up.error);
    return NextResponse.json({ error: "Upload failed. Try again." }, { status: 500 });
  }
  const url = ctx.sb.storage.from("team-photos").getPublicUrl(path).data.publicUrl as string;
  const { error } = await save(url);
  if (error) return NextResponse.json({ error: "Saved the photo but couldn't attach it. Try again." }, { status: 500 });
  return NextResponse.json({ ok: true, url });
}
