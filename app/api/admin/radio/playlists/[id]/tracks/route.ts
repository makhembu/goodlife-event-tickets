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
    const body = await req.json();

    // Mode A: Reorder existing tracks: { reorder: [{ track_id: number, position: number }] }
    if (Array.isArray(body.reorder)) {
      for (const item of body.reorder) {
        if (typeof item.track_id === "number" && typeof item.position === "number") {
          await neonQuery(
            `UPDATE radio_playlist_tracks 
             SET position = $3 
             WHERE playlist_id = $1 AND track_id = $2`,
            [playlistId, item.track_id, item.position]
          );
        }
      }
      return NextResponse.json({ success: true, message: "Tracks reordered" });
    }

    // Mode B: Add single track or array of track IDs: { track_id: number } or { track_ids: number[] }
    const trackIdsToAdd: number[] = [];
    if (typeof body.track_id === "number") {
      trackIdsToAdd.push(body.track_id);
    } else if (Array.isArray(body.track_ids)) {
      trackIdsToAdd.push(...body.track_ids.filter((id: any) => typeof id === "number"));
    }

    if (trackIdsToAdd.length === 0) {
      return NextResponse.json({ error: "track_id or track_ids required" }, { status: 400 });
    }

    // Get current max position in playlist
    const maxPosRes = await neonQuery(
      `SELECT COALESCE(MAX(position), -1)::int as max_pos FROM radio_playlist_tracks WHERE playlist_id = $1`,
      [playlistId]
    );
    let nextPos = (maxPosRes.rows[0]?.max_pos ?? -1) + 1;

    let addedCount = 0;
    for (const tid of trackIdsToAdd) {
      const insRes = await neonQuery(
        `INSERT INTO radio_playlist_tracks (playlist_id, track_id, position)
         VALUES ($1, $2, $3)
         ON CONFLICT (playlist_id, track_id) DO NOTHING
         RETURNING id`,
        [playlistId, tid, nextPos]
      );
      if (insRes.rows.length > 0) {
        nextPos++;
        addedCount++;
      }
    }

    // Update playlist updated_at
    await neonQuery("UPDATE radio_playlists SET updated_at = NOW() WHERE id = $1", [playlistId]);

    return NextResponse.json({ success: true, added: addedCount });
  } catch (err: any) {
    console.error("[api/admin/radio/playlists/[id]/tracks] POST error:", err);
    return NextResponse.json({ error: err.message || "Failed to add track(s)" }, { status: 500 });
  }
}

export async function DELETE(
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
    const body = await req.json();
    const trackIds = Array.isArray(body.track_ids)
      ? body.track_ids.filter((id: any) => typeof id === "number")
      : [];

    if (trackIds.length === 0) {
      return NextResponse.json({ error: "track_ids array required" }, { status: 400 });
    }

    await neonQuery(
      `DELETE FROM radio_playlist_tracks
       WHERE playlist_id = $1 AND track_id = ANY($2::int[])`,
      [playlistId, trackIds]
    );

    // Resequence remaining tracks positions
    const remaining = await neonQuery(
      `SELECT track_id FROM radio_playlist_tracks WHERE playlist_id = $1 ORDER BY position ASC`,
      [playlistId]
    );
    for (let i = 0; i < remaining.rows.length; i++) {
      await neonQuery(
        `UPDATE radio_playlist_tracks SET position = $3 WHERE playlist_id = $1 AND track_id = $2`,
        [playlistId, remaining.rows[i].track_id, i]
      );
    }

    await neonQuery("UPDATE radio_playlists SET updated_at = NOW() WHERE id = $1", [playlistId]);

    return NextResponse.json({ success: true, removed: trackIds.length });
  } catch (err: any) {
    console.error("[api/admin/radio/playlists/[id]/tracks] DELETE error:", err);
    return NextResponse.json({ error: err.message || "Failed to remove tracks" }, { status: 500 });
  }
}
