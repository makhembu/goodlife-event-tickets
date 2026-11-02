import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { neonQuery } from "@/lib/supabase-db";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authErr = await requireAdmin();
  if (authErr) return authErr;

  const resolvedParams = await params;
  const playlistId = parseInt(resolvedParams.id, 10);
  if (isNaN(playlistId)) {
    return NextResponse.json({ error: "Invalid playlist ID" }, { status: 400 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const shouldActivate = body.active !== undefined ? Boolean(body.active) : true;

    if (shouldActivate) {
      // First ensure the playlist exists and has at least one valid track
      const countRes = await neonQuery(
        `SELECT COUNT(pt.id)::int as count 
         FROM radio_playlists p
         JOIN radio_playlist_tracks pt ON pt.playlist_id = p.id
         JOIN radio_sets s ON s.id = pt.track_id AND s.deleted_at IS NULL AND s.is_active = true
         WHERE p.id = $1 AND p.deleted_at IS NULL`,
        [playlistId]
      );

      if (!countRes.rows[0] || countRes.rows[0].count === 0) {
        return NextResponse.json(
          { error: "Cannot activate an empty playlist. Add at least one track before putting it on air." },
          { status: 400 }
        );
      }

      // Deactivate all other playlists
      await neonQuery(
        `UPDATE radio_playlists 
         SET is_broadcast_active = false, activated_at = NULL, updated_at = NOW() 
         WHERE is_broadcast_active = true`
      );

      // Activate this playlist and stamp activated_at = NOW()
      const updateRes = await neonQuery(
        `UPDATE radio_playlists 
         SET is_broadcast_active = true, activated_at = NOW(), updated_at = NOW() 
         WHERE id = $1 AND deleted_at IS NULL 
         RETURNING *`,
        [playlistId]
      );

      return NextResponse.json({
        success: true,
        message: "Playlist is now ON AIR! 24/7 broadcast timeline has been locked to this playlist.",
        playlist: updateRes.rows[0],
      });
    } else {
      // Deactivate playlist, returning station to standard catalog rotation
      const updateRes = await neonQuery(
        `UPDATE radio_playlists 
         SET is_broadcast_active = false, activated_at = NULL, updated_at = NOW() 
         WHERE id = $1 AND deleted_at IS NULL 
         RETURNING *`,
        [playlistId]
      );

      return NextResponse.json({
        success: true,
        message: "Playlist taken off air. Station returned to full catalog AutoDJ rotation.",
        playlist: updateRes.rows[0],
      });
    }
  } catch (err: any) {
    console.error("[api/admin/radio/playlists/[id]/activate] POST error:", err);
    return NextResponse.json({ error: err.message || "Failed to toggle broadcast status" }, { status: 500 });
  }
}
