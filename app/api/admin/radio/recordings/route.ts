import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { neonQuery } from "@/lib/supabase-db";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/radio/recordings
 * Lists all recorded broadcast sessions (both private and public) with presenter and show context.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const res = await neonQuery(
      `SELECT r.id, r.title, r.dj_name, r.audio_url, r.duration, r.file_size,
              r.bitrate, r.genre, r.recorded_at, r.is_public, r.approved_at,
              r.slot_id, r.show_id, r.presenter_id,
              sh.title AS show_title, sh.slug AS show_slug,
              p.dj_name AS presenter_dj_name, p.slug AS presenter_slug
       FROM radio_recordings r
       LEFT JOIN shows sh ON r.show_id = sh.id
       LEFT JOIN presenters p ON r.presenter_id = p.id
       ORDER BY r.recorded_at DESC
       LIMIT 100;`
    );

    return NextResponse.json({
      ok: true,
      count: res.rows.length,
      recordings: res.rows,
    });
  } catch (err: any) {
    console.error("[admin recordings] Query failed:", err);
    return NextResponse.json(
      { error: err.message || "Failed to load radio recordings" },
      { status: 500 }
    );
  }
}
