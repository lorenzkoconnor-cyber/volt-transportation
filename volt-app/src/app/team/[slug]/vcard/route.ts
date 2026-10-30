import { getAppSettings } from "@/lib/settings-server";
import { teamMember, SITE_URL } from "@/lib/team";

// "Save Contact": a vCard that adds the team member to the phone's contacts.

const esc = (v: string) => v.replace(/\\/g, "\\\\").replace(/([,;])/g, "\\$1").replace(/\n/g, "\\n");

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const m = teamMember(slug);
  if (!m) return new Response("Not found", { status: 404 });

  const { business: b } = await getAppSettings();
  const [, city = "", state = "", zip = ""] = b.cityLine.match(/^(.*),\s*([A-Z]{2})\s+(\d{5})/) ?? [];
  const tel = b.phoneHref.replace("tel:", "");

  const card = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `N:;${esc(m.name)};;;`,
    `FN:${esc(m.name)}`,
    "ORG:Volt Transportation",
    `TITLE:${esc(m.title)}`,
    `TEL;TYPE=WORK,VOICE:${tel}`,
    `EMAIL;TYPE=WORK,INTERNET:${m.email}`,
    `URL:${SITE_URL}`,
    `ADR;TYPE=WORK:;;${esc(b.street)};${esc(city)};${state};${zip};USA`,
    "END:VCARD",
  ].join("\r\n");

  return new Response(card + "\r\n", {
    headers: {
      "Content-Type": "text/vcard; charset=utf-8",
      "Content-Disposition": `attachment; filename="${m.name} - Volt Transportation.vcf"`,
    },
  });
}
