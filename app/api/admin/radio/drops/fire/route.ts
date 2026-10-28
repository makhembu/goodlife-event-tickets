import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { neonQuery } from "@/lib/supabase-db";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const unauthorized = await requireAdmin(req);
  if (unauthorized) return unauthorized;

  try {
    const body = await req.json().catch(() => ({}));
    const { name, url } = body;

    if (!url) {
      return NextResponse.json({ error: "Missing drop url" }, { status: 400 });
    }

    await neonQuery(
      `INSERT INTO radio_drops (persona, mood, title, script, audio_url, timing_type, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
      [
        "LIVE DJ",
        "HYPE",
        name || "DJ Live Drop",
        `DJ Triggered Live Drop: ${name}`,
        url,
        "live_drop",
      ]
    );

    return NextResponse.json({
      success: true,
      message: `Drop ${name} fired on air!`,
    });
  } catch (err: any) {
    console.error("[api/admin/radio/drops/fire] Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
