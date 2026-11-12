import { NextRequest, NextResponse } from "next/server";
import { requirePresenter } from "@/lib/presenter-auth";
import { neonQuery } from "@/lib/supabase-db";

export const dynamic = "force-dynamic";

/**
 * GET /api/presenter/recordings
 * Returns all recorded broadcast sessions associated with the authenticated presenter.
 */
export async function GET(req: NextRequest) {
  const authResult = await requirePresenter(req);
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  const { presenter } = authResult;

  try {
    const res = await neonQuery(
      `SELECT r.id, r.title, r.dj_name, r.audio_url, r.duration, r.file_size,
              r.bitrate, r.genre, r.recorded_at, r.is_public, r.slot_id, r.show_id,
              sh.title AS show_title, sh.slug AS show_slug
       FROM radio_recordings r
       LEFT JOIN shows sh ON r.show_id = sh.id
       WHERE r.presenter_id = $1
       ORDER BY r.recorded_at DESC;`,
      [presenter.id]
    );

    return NextResponse.json({
      ok: true,
      count: res.rows.length,
      recordings: res.rows,
    });
  } catch (err: any) {
    console.error("[presenter recordings] Query failed:", err);
    return NextResponse.json(
      { error: err.message || "Failed to load presenter recordings" },
      { status: 500 }
    );
  }
}
