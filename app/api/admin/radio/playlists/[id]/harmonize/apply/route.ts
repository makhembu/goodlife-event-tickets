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
    const body = await req.json();
    const { proposedOrder, expectedPreviousOrder, reanchorBroadcast } = body;

    if (!Array.isArray(proposedOrder) || proposedOrder.length === 0) {
      return NextResponse.json({ error: "proposedOrder array is required" }, { status: 400 });
    }

    const proposedIds = proposedOrder.map((id: any) => parseInt(String(id), 10)).filter((n) => !isNaN(n));

    // 1. Fetch current playlist & tracks from database
    const playlistRes = await neonQuery(
      `SELECT id, name, is_broadcast_active FROM radio_playlists WHERE id = $1 AND deleted_at IS NULL`,
      [playlistId]
    );
    if (playlistRes.rows.length === 0) {
      return NextResponse.json({ error: "Playlist not found" }, { status: 404 });
    }
    const playlist = playlistRes.rows[0];

    const currentTracksRes = await neonQuery(
      `SELECT track_id, position 
       FROM radio_playlist_tracks 
       WHERE playlist_id = $1 
       ORDER BY position ASC, id ASC`,
      [playlistId]
    );
    const currentTrackIds: number[] = currentTracksRes.rows.map((r: any) => r.track_id);

    // 2. Strict ID equivalence validation
    if (proposedIds.length !== currentTrackIds.length) {
      return NextResponse.json({
        error: `Track count mismatch: proposed ${proposedIds.length}, current ${currentTrackIds.length}`,
      }, { status: 400 });
    }

    const currentSet = new Set(currentTrackIds);
    const proposedSet = new Set(proposedIds);

    if (proposedSet.size !== proposedIds.length) {
      return NextResponse.json({ error: "proposedOrder contains duplicate track IDs" }, { status: 400 });
    }

    for (const id of proposedIds) {
      if (!currentSet.has(id)) {
        return NextResponse.json({ error: `Track ID ${id} does not belong to this playlist` }, { status: 400 });
      }
    }

    // 3. Concurrency check (if preview sent expectedPreviousOrder)
    if (Array.isArray(expectedPreviousOrder)) {
      const prevMatches = expectedPreviousOrder.length === currentTrackIds.length &&
        expectedPreviousOrder.every((id: number, idx: number) => id === currentTrackIds[idx]);
      if (!prevMatches) {
        return NextResponse.json({
          error: "Playlist track order was modified by another session since preview was generated. Please re-run Harmonize.",
        }, { status: 409 });
      }
    }

    // 4. Save previous order snapshot for persistent undo
    const snapshotRes = await neonQuery(
      `INSERT INTO radio_playlist_order_snapshots (playlist_id, track_ids, reason)
       VALUES ($1, $2, 'harmonize_reorder')
       RETURNING id, created_at`,
      [playlistId, currentTrackIds]
    );
    const snapshotId = snapshotRes.rows[0]?.id;

    // Cap snapshots to the latest 20 per playlist to prevent unbounded table growth
    await neonQuery(
      `DELETE FROM radio_playlist_order_snapshots 
       WHERE playlist_id = $1 
         AND id NOT IN (
           SELECT id FROM radio_playlist_order_snapshots 
           WHERE playlist_id = $1 
           ORDER BY created_at DESC 
           LIMIT 20
         )`,
      [playlistId]
    );

    // 5. Atomic rewrite of positions using unnest
    const newPositions = proposedIds.map((_, idx) => idx);
    await neonQuery(
      `UPDATE radio_playlist_tracks AS pt
       SET position = u.new_pos
       FROM (
         SELECT unnest($1::int[]) AS track_id, unnest($2::int[]) AS new_pos
       ) AS u
       WHERE pt.playlist_id = $3 AND pt.track_id = u.track_id`,
      [proposedIds, newPositions, playlistId]
    );

    // 6. Handle on-air re-anchoring if requested
    let reanchored = false;
    if (playlist.is_broadcast_active && reanchorBroadcast) {
      await neonQuery(
        `UPDATE radio_playlists SET activated_at = NOW() WHERE id = $1`,
        [playlistId]
      );
      reanchored = true;
    }

    return NextResponse.json({
      success: true,
      playlistId,
      snapshotId,
      tracksReordered: proposedIds.length,
      reanchored,
      isBroadcastActive: playlist.is_broadcast_active,
    });
  } catch (err: any) {
    console.error("[api/admin/radio/playlists/[id]/harmonize/apply] Error:", err);
    return NextResponse.json({ error: err.message || "Failed to apply harmonized order" }, { status: 500 });
  }
}
