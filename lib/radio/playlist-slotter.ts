import { neonQuery } from "@/lib/supabase-db";

/**
 * Slots a track into the currently active broadcast playlist right as UP NEXT
 * based on the virtual timeline position.
 */
export async function slotTrackAsPlaylistUpNext(trackId: number): Promise<boolean> {
  const activePlaylistRes = await neonQuery(
    `SELECT id, activated_at FROM radio_playlists WHERE is_broadcast_active = true AND deleted_at IS NULL LIMIT 1`
  );

  if (!activePlaylistRes.rows || activePlaylistRes.rows.length === 0) {
    return false;
  }

  const playlistId = activePlaylistRes.rows[0].id;
  const activatedAt = activePlaylistRes.rows[0].activated_at;

  // Check if track is already in this playlist
  const existingInPl = await neonQuery(
    `SELECT id FROM radio_playlist_tracks WHERE playlist_id = $1 AND track_id = $2`,
    [playlistId, trackId]
  );
  if (existingInPl.rows.length > 0) {
    return true; // Already present
  }

  // Get current tracks in this playlist
  const tracksRes = await neonQuery(
    `SELECT pt.id, pt.position, s.duration_sec 
     FROM radio_playlist_tracks pt 
     JOIN radio_sets s ON s.id = pt.track_id 
     WHERE pt.playlist_id = $1 
     ORDER BY pt.position ASC, pt.id ASC`,
    [playlistId]
  );

  const tracks = tracksRes.rows || [];
  let currentPosition = 0;

  if (tracks.length > 0) {
    const totalDurationSec = tracks.reduce((acc: number, t: any) => acc + (t.duration_sec || 180), 0);
    const nowSec = Math.floor(Date.now() / 1000);
    let cycleSec = 0;

    if (activatedAt) {
      const activatedAtSec = Math.floor(new Date(activatedAt).getTime() / 1000);
      const elapsed = Math.max(0, nowSec - activatedAtSec);
      cycleSec = totalDurationSec > 0 ? (elapsed % totalDurationSec) : 0;
    } else {
      cycleSec = totalDurationSec > 0 ? (nowSec % totalDurationSec) : 0;
    }

    let cumulative = 0;
    for (let i = 0; i < tracks.length; i++) {
      const dur = tracks[i].duration_sec || 180;
      if (cumulative + dur > cycleSec) {
        currentPosition = tracks[i].position;
        break;
      }
      cumulative += dur;
    }
  }

  // Shift subsequent tracks to open slot at currentPosition + 1
  await neonQuery(
    `UPDATE radio_playlist_tracks 
     SET position = position + 1 
     WHERE playlist_id = $1 AND position > $2`,
    [playlistId, currentPosition]
  );

  // Insert track into the playlist right as UP NEXT!
  await neonQuery(
    `INSERT INTO radio_playlist_tracks (playlist_id, track_id, position)
     VALUES ($1, $2, $3)`,
    [playlistId, trackId, currentPosition + 1]
  );

  return true;
}
