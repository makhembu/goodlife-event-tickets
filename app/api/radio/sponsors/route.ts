import { NextRequest, NextResponse } from "next/server";
import { getActiveRadioSponsors, createRadioSponsor } from "@/lib/radio/ops-service";
import { requireAdmin } from "@/lib/admin-auth";

export async function GET() {
  try {
    const sponsors = await getActiveRadioSponsors();
    return NextResponse.json({ sponsors });
  } catch (error: any) {
    console.error("[Radio Sponsors GET] Error:", error);
    return NextResponse.json({ error: "Failed to fetch sponsors" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const authErr = await requireAdmin(request);
  if (authErr) return authErr;

  try {
    const body = await request.json().catch(() => ({}));
    const { name, logo_url, link_url, tagline, show_id, slot_id, starts_at, ends_at } = body;

    if (!name || typeof name !== "string") {
      return NextResponse.json({ error: "Sponsor name is required" }, { status: 400 });
    }

    const sponsor = await createRadioSponsor({
      name: name.trim(),
      logo_url,
      link_url,
      tagline,
      show_id: show_id ? Number(show_id) : null,
      slot_id: slot_id ? Number(slot_id) : null,
      is_active: true,
      starts_at: starts_at || null,
      ends_at: ends_at || null,
    });

    return NextResponse.json({ success: true, sponsor });
  } catch (error: any) {
    console.error("[Radio Sponsors POST] Error:", error);
    return NextResponse.json({ error: "Failed to create sponsor" }, { status: 500 });
  }
}
