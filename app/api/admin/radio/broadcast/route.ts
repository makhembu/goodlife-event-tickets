import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { neonQuery } from "@/lib/supabase-db";

export async function GET() {
  const authErr = await requireAdmin();
  if (authErr) return authErr;

  const { rows } = await neonQuery("SELECT * FROM radio_settings WHERE id = 1");
  return NextResponse.json(rows[0] || { broadcast_mode: "curated", live_title: "GOODLIFE MAIN STAGE LIVE" });
}

export async function PUT(req: NextRequest) {
  const authErr = await requireAdmin();
  if (authErr) return authErr;

  try {
    const body = await req.json();
    const { broadcast_mode, live_stream_url, live_title, live_fallback_set_id } = body;

    const query = `
      UPDATE radio_settings
      SET 
        broadcast_mode = COALESCE($1, broadcast_mode),
        live_stream_url = COALESCE($2, live_stream_url),
        live_title = COALESCE($3, live_title),
        live_fallback_set_id = $4,
        last_heartbeat = NOW(),
        updated_at = NOW()
      WHERE id = 1
      RETURNING *;
    `;

    const params = [
      broadcast_mode || "curated",
      live_stream_url !== undefined ? live_stream_url : "",
      live_title || "GOODLIFE MAIN STAGE LIVE",
      live_fallback_set_id ? parseInt(String(live_fallback_set_id), 10) : null,
    ];

    const { rows } = await neonQuery(query, params);
    return NextResponse.json({ success: true, settings: rows[0] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to update broadcast settings" }, { status: 500 });
  }
}
