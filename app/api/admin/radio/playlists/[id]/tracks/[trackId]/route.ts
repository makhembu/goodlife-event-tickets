import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { neonQuery } from "@/lib/supabase-db";

export const dynamic = "force-dynamic";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; trackId: string }> }
) {
  const authErr = await requireAdmin();
  if (authErr) return authErr;

  const resolvedParams = await params;
  const playlistId = parseInt(resolvedParams.id, 10);
  const trackId = parseInt(resolvedParams.trackId, 10);

  if (isNaN(playlistId) || isNaN(trackId)) {
    return NextResponse.json({ error: "Invalid playlist or track ID" }, { status: 400 });
  }

  try {
    const res = await neonQuery(
      `DELETE FROM radio_playlist_tracks WHERE playlist_id = $1 AND track_id = $2 RETURNING id`,
      [playlistId, trackId]
    );

    if (res.rows.length === 0) {
      return NextResponse.json({ error: "Track not found in playlist" }, { status: 404 });
    }

    await neonQuery("UPDATE radio_playlists SET updated_at = NOW() WHERE id = $1", [playlistId]);
    return NextResponse.json({ success: true, message: "Track removed from playlist" });
  } catch (err: any) {
    console.error("[api/admin/radio/playlists/[id]/tracks/[trackId]] DELETE error:", err);
    return NextResponse.json({ error: err.message || "Failed to remove track" }, { status: 500 });
  }
}
