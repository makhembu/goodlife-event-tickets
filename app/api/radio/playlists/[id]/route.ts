import { NextRequest, NextResponse } from "next/server";
import { neonQuery } from "@/lib/supabase-db";
import { withPlayback } from "@/lib/radio/playback";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const resolvedParams = await params;
  const playlistId = parseInt(resolvedParams.id, 10);
  if (isNaN(playlistId)) {
    return NextResponse.json({ error: "Invalid playlist ID" }, { status: 400 });
  }

  try {
    const playlistRes = await neonQuery(
      `SELECT id, name, slug, description, genre, cover_url, is_broadcast_active 
       FROM radio_playlists 
       WHERE id = $1 AND deleted_at IS NULL AND is_public = true`,
      [playlistId]
    );

    if (playlistRes.rows.length === 0) {
      return NextResponse.json({ error: "Playlist not found" }, { status: 404 });
    }

    const tracksRes = await neonQuery(
      `SELECT 
        pt.position,
        s.id,
        s.event_id,
        s.title,
        s.dj_name,
        s.audio_url,
        s.audio_high_url,
        s.r2_key,
        s.cover_url,
        s.duration,
        s.duration_sec,
        s.genre,
        s.bitrate
      FROM radio_playlist_tracks pt
      JOIN radio_sets s ON s.id = pt.track_id
      WHERE pt.playlist_id = $1 AND s.deleted_at IS NULL AND s.is_active = true
      ORDER BY pt.position ASC, pt.id ASC`,
      [playlistId]
    );

    const tracks = (tracksRes.rows || []).map((t: any) => withPlayback(t, "track"));

    return NextResponse.json(
      {
        success: true,
        playlist: playlistRes.rows[0],
        tracks,
      },
      { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60" } }
    );
  } catch (err: any) {
    console.error("[api/radio/playlists/[id]] GET error:", err);
    return NextResponse.json({ error: err.message || "Failed to load playlist" }, { status: 500 });
  }
}
