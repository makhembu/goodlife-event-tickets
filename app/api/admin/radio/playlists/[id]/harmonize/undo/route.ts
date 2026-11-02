import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { neonQuery } from "@/lib/supabase-db";

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
    let reanchorBroadcast = false;
    try {
      const body = await req.json();
      reanchorBroadcast = !!body?.reanchorBroadcast;
    } catch {}

    // 1. Fetch latest snapshot
    const snapRes = await neonQuery(
      `SELECT id, track_ids, created_at 
       FROM radio_playlist_order_snapshots 
       WHERE playlist_id = $1 
       ORDER BY created_at DESC 
       LIMIT 1`,
      [playlistId]
    );

    if (snapRes.rows.length === 0) {
      return NextResponse.json({
        error: "No previous order snapshot found for this playlist",
      }, { status: 404 });
    }

    const snapshot = snapRes.rows[0];
    const restoredIds: number[] = snapshot.track_ids;

    // 2. Validate current tracks in playlist
    const currentRes = await neonQuery(
      `SELECT track_id FROM radio_playlist_tracks WHERE playlist_id = $1`,
      [playlistId]
    );
    const currentSet = new Set(currentRes.rows.map((r: any) => r.track_id));

    if (currentSet.size !== restoredIds.length) {
      return NextResponse.json({
        error: "Cannot undo: tracks have been added or removed from this playlist since the snapshot was taken.",
      }, { status: 400 });
    }

    for (const id of restoredIds) {
      if (!currentSet.has(id)) {
        return NextResponse.json({
          error: "Cannot undo: playlist track composition has changed.",
        }, { status: 400 });
      }
    }

    // 3. Atomically restore positions
    const newPositions = restoredIds.map((_, idx) => idx);
    await neonQuery(
      `UPDATE radio_playlist_tracks AS pt
       SET position = u.new_pos
       FROM (
         SELECT unnest($1::int[]) AS track_id, unnest($2::int[]) AS new_pos
       ) AS u
       WHERE pt.playlist_id = $3 AND pt.track_id = u.track_id`,
      [restoredIds, newPositions, playlistId]
    );

    // 4. Remove the restored snapshot so subsequent undos roll back to earlier snapshots if any
    await neonQuery(
      `DELETE FROM radio_playlist_order_snapshots WHERE id = $1`,
      [snapshot.id]
    );

    // 5. Handle on-air re-anchoring if requested
    const playlistRes = await neonQuery(
      `SELECT is_broadcast_active FROM radio_playlists WHERE id = $1`,
      [playlistId]
    );
    const isBroadcastActive = playlistRes.rows[0]?.is_broadcast_active || false;

    let reanchored = false;
    if (isBroadcastActive && reanchorBroadcast) {
      await neonQuery(
        `UPDATE radio_playlists SET activated_at = NOW() WHERE id = $1`,
        [playlistId]
      );
      reanchored = true;
    }

    return NextResponse.json({
      success: true,
      restoredTrackCount: restoredIds.length,
      snapshotTimestamp: snapshot.created_at,
      reanchored,
      isBroadcastActive,
    });
  } catch (err: any) {
    console.error("[api/admin/radio/playlists/[id]/harmonize/undo] Error:", err);
    return NextResponse.json({ error: err.message || "Failed to restore previous order" }, { status: 500 });
  }
}
