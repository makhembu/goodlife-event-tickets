import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { bridgeSkipTrack } from "@/lib/radio/bridge-client";
import { neonQuery } from "@/lib/supabase-db";
import { computeLiveTimeline } from "@/lib/radio/timeline";

export const dynamic = "force-dynamic";

export async function POST() {
  const authErr = await requireAdmin();
  if (authErr) return authErr;

  // 1. If bridge / AzuraCast is reachable, dispatch skip to upstream Icecast daemon
  try {
    const res = await bridgeSkipTrack();
    if (res && res.ok) {
      return NextResponse.json(res.data);
    }
  } catch {
    // Upstream bridge unreachable or off; seamlessly advance internal 24/7 timeline
  }

  // 2. Seamless Station Fallback: Advance 24/7 Neon broadcast schedule to next track
  try {
    // 2. Query active broadcast playlist first (if one exists)
    const [playlistRes, settingsRes] = await Promise.all([
      neonQuery(`
        SELECT p.id as playlist_id, p.name as playlist_name, p.activated_at,
               s.id, s.title, s.dj_name, s.audio_url, s.duration_sec, pt.position
        FROM radio_playlists p
        JOIN radio_playlist_tracks pt ON pt.playlist_id = p.id
        JOIN radio_sets s ON s.id = pt.track_id AND s.deleted_at IS NULL AND s.is_active = true
        WHERE p.is_broadcast_active = true AND p.deleted_at IS NULL
        ORDER BY pt.position ASC, pt.id ASC
      `).catch(() => ({ rows: [] })),
      neonQuery("SELECT broadcast_mode, active_set_id, active_started_at FROM radio_settings WHERE id = 1"),
    ]);

    const settings = settingsRes.rows[0] || {};
    let sets: any[] = [];
    let isPlaylistBroadcast = false;
    let activePlaylistId: number | null = null;
    let activatedAt: string | null = null;

    if (playlistRes.rows.length > 0) {
      sets = playlistRes.rows;
      isPlaylistBroadcast = true;
      activePlaylistId = playlistRes.rows[0].playlist_id;
      activatedAt = playlistRes.rows[0].activated_at;
    } else {
      const setsRes = await neonQuery(`
        SELECT id, title, dj_name, audio_url, duration_sec, display_order
        FROM radio_sets
        WHERE deleted_at IS NULL AND is_active = true AND processing_status = 'ready'
        ORDER BY display_order ASC, id ASC
      `);
      sets = setsRes.rows || [];
    }

    if (sets.length === 0) {
      return NextResponse.json({ error: "No active radio sets available to skip" }, { status: 404 });
    }

    let currentIdx = 0;

    if (settings.broadcast_mode === "mania" && settings.active_set_id) {
      const idx = sets.findIndex((s: any) => s.id === Number(settings.active_set_id));
      if (idx !== -1) {
        currentIdx = idx;
      }
    } else if (isPlaylistBroadcast && activatedAt) {
      // Replicate the exact playout cycle calculation from /api/radio/live
      const totalDurationSec = sets.reduce((acc: number, s: any) => acc + (s.duration_sec || 180), 0);
      const nowSec = Math.floor(Date.now() / 1000);
      const activatedAtSec = Math.floor(new Date(activatedAt).getTime() / 1000);
      const elapsedSinceActivation = Math.max(0, nowSec - activatedAtSec);
      const cycleSec = totalDurationSec > 0 ? (elapsedSinceActivation % totalDurationSec) : 0;

      let cumulative = 0;
      for (let i = 0; i < sets.length; i++) {
        const dur = sets[i].duration_sec || 180;
        if (cumulative + dur > cycleSec) {
          currentIdx = i;
          break;
        }
        cumulative += dur;
      }
    } else {
      const timeline = computeLiveTimeline(sets);
      currentIdx = timeline.index;
    }

    const nextIdx = (currentIdx + 1) % sets.length;
    const nextSet = sets[nextIdx];

    // If skipping within an active broadcast playlist, adjust the playlist's virtual anchor
    // so AutoDJ naturally continues from the beginning of nextSet seamlessly
    if (isPlaylistBroadcast && activePlaylistId) {
      let cumulativeBeforeNext = 0;
      for (let i = 0; i < nextIdx; i++) {
        cumulativeBeforeNext += sets[i].duration_sec || 180;
      }

      await neonQuery(
        `UPDATE radio_playlists 
         SET activated_at = NOW() - ($1 || ' seconds')::interval 
         WHERE id = $2`,
        [cumulativeBeforeNext, activePlaylistId]
      );
    }

    // Always engage MANIA mode on the chosen nextSet to guarantee instant playout lock
    await neonQuery(
      "UPDATE radio_settings SET broadcast_mode = 'mania', active_set_id = $1, active_started_at = NOW(), updated_at = NOW() WHERE id = 1",
      [nextSet.id]
    );

    return NextResponse.json({
      status: "success",
      action: "skipped_to_next",
      now_playing: {
        id: nextSet.id,
        title: nextSet.title,
        dj_name: nextSet.dj_name,
        audio_url: nextSet.audio_url,
      },
    });
  } catch (fallbackErr: any) {
    console.error("[api/admin/radio/azuracast/skip] Skip fallback failed:", fallbackErr);
    return NextResponse.json(
      { error: fallbackErr.message || "Failed to advance track" },
      { status: 500 }
    );
  }
}
