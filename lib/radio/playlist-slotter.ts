import { neonQuery } from "@/lib/supabase-db";

/**
 * Slots a track into the currently active broadcast playlist right as UP NEXT
 * based on the active playing track or virtual timeline position.
 */
export async function slotTrackAsPlaylistUpNext(
  trackId: number,
  currentTrackId?: number | null
): Promise<boolean> {
  const activePlaylistRes = await neonQuery(
    `SELECT id, activated_at FROM radio_playlists WHERE is_broadcast_active = true AND deleted_at IS NULL LIMIT 1`
  );

  if (!activePlaylistRes.rows || activePlaylistRes.rows.length === 0) {
    // If no active playlist, still set queued_next_set_id in settings
    await neonQuery(
      "UPDATE radio_settings SET queued_next_set_id = $1, updated_at = NOW() WHERE id = 1",
      [trackId]
    );
    return true;
  }

  const playlistId = activePlaylistRes.rows[0].id;
  const activatedAt = activePlaylistRes.rows[0].activated_at;

  // Get current settings
  const settingsRes = await neonQuery(
    "SELECT broadcast_mode, active_set_id FROM radio_settings WHERE id = 1"
  );
  const settings = settingsRes.rows[0] || {};
  const activeSetId = currentTrackId || (settings.active_set_id ? Number(settings.active_set_id) : null);

  // Get current tracks in this playlist
  const tracksRes = await neonQuery(
    `SELECT pt.id, pt.track_id, pt.position, s.duration_sec 
     FROM radio_playlist_tracks pt 
     JOIN radio_sets s ON s.id = pt.track_id 
     WHERE pt.playlist_id = $1 
     ORDER BY pt.position ASC, pt.id ASC`,
    [playlistId]
  );

  const tracks = tracksRes.rows || [];
  let activeIdx = -1;
  if (activeSetId) {
    activeIdx = tracks.findIndex((t: any) => t.track_id === activeSetId);
  }

  if (activeIdx === -1 && tracks.length > 0) {
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
        activeIdx = i;
        break;
      }
      cumulative += dur;
    }
    if (activeIdx === -1) activeIdx = 0;
  }

  const currentPosition = activeIdx >= 0 ? tracks[activeIdx]?.position : 0;

  // Check if track is already in this playlist
  const existingIdx = tracks.findIndex((t: any) => t.track_id === trackId);
  if (existingIdx !== -1) {
    // Reorder track to directly after activeIdx
    const list = tracks.map((t: any) => Number(t.track_id));
    const [item] = list.splice(existingIdx, 1);
    const targetIdx = activeIdx >= 0 ? activeIdx + 1 : 0;
    const finalIdx = existingIdx < targetIdx ? targetIdx - 1 : targetIdx;
    list.splice(finalIdx, 0, item);

    await neonQuery(
      `UPDATE radio_playlist_tracks AS pt
       SET position = v.new_pos
       FROM (
         SELECT unnest($2::int[]) AS track_id,
                (generate_subscripts($2::int[], 1) - 1)::int AS new_pos
       ) AS v
       WHERE pt.playlist_id = $1 AND pt.track_id = v.track_id`,
      [playlistId, list]
    );
  } else {
    // Shift subsequent tracks to open slot at currentPosition + 1
    await neonQuery(
      `UPDATE radio_playlist_tracks 
       SET position = position + 1 
       WHERE playlist_id = $1 AND position > $2`,
      [playlistId, currentPosition]
    );

    // Insert track into the playlist right as UP NEXT!
    await neonQuery(
      `INSERT INTO radio_playlist_tracks (playlist_id, track_id, position, created_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT DO NOTHING`,
      [playlistId, trackId, currentPosition + 1]
    );
  }

  // Anchor virtual timeline to activeIdx so AutoDJ cycle aligns seamlessly
  if (activeIdx >= 0) {
    let cumulativeUpToActive = 0;
    for (let i = 0; i < activeIdx; i++) {
      cumulativeUpToActive += (tracks[i]?.duration_sec || 180);
    }
    await neonQuery(
      `UPDATE radio_playlists 
       SET activated_at = NOW() - INTERVAL '1 second' * $2, updated_at = NOW() 
       WHERE id = $1`,
      [playlistId, cumulativeUpToActive]
    );
  }

  // Set queued_next_set_id in radio_settings
  await neonQuery(
    `UPDATE radio_settings 
     SET queued_next_set_id = $1, updated_at = NOW() 
     WHERE id = 1`,
    [trackId]
  );

  return true;
}
