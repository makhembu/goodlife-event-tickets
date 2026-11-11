import { NextResponse } from "next/server";
import { neonQuery } from "@/lib/supabase-db";
import { getLastDropGeneration } from "@/lib/radio/telemetry";

export const dynamic = "force-dynamic";

export async function GET() {
  const now = new Date();
  try {
    const [settingsRes, tracksCountRes, dropsCountRes, unplayedDropsRes, playlistRes, recentDropRes] =
      await Promise.all([
        neonQuery("SELECT broadcast_mode, active_set_id, active_started_at, live_title, live_stream_url FROM radio_settings WHERE id = 1").catch(() => ({ rows: [] })),
        neonQuery("SELECT COUNT(*)::int AS count FROM radio_sets WHERE deleted_at IS NULL").catch(() => ({ rows: [{ count: 0 }] })),
        neonQuery("SELECT COUNT(*)::int AS count FROM radio_drops WHERE is_active = true").catch(() => ({ rows: [{ count: 0 }] })),
        neonQuery("SELECT COUNT(*)::int AS count FROM radio_drops WHERE is_active = true AND played_at IS NULL").catch(() => ({ rows: [{ count: 0 }] })),
        neonQuery(`
          SELECT p.id as playlist_id, p.name as playlist_name, p.activated_at, COUNT(pt.id)::int as tracks_count
          FROM radio_playlists p
          LEFT JOIN radio_playlist_tracks pt ON pt.playlist_id = p.id
          WHERE p.is_broadcast_active = true AND p.deleted_at IS NULL
          GROUP BY p.id, p.name, p.activated_at
        `).catch(() => ({ rows: [] })),
        neonQuery(`
          SELECT id, persona, mood, title, script, audio_url, created_at,
                 ROUND(EXTRACT(EPOCH FROM (NOW() - created_at))) as age_seconds
          FROM radio_drops
          WHERE audio_url IS NOT NULL
          ORDER BY created_at DESC
          LIMIT 3
        `).catch(() => ({ rows: [] })),
      ]);

    const settings = settingsRes.rows[0] || {};
    const playlist = playlistRes.rows[0] || null;
    const totalTracks = tracksCountRes.rows[0]?.count || 0;
    const totalDrops = dropsCountRes.rows[0]?.count || 0;
    const unplayedDrops = unplayedDropsRes.rows[0]?.count || 0;
    const lastTelemetry = getLastDropGeneration();

    return NextResponse.json({
      status: "online",
      server_time: now.toISOString(),
      broadcast: {
        mode: settings.broadcast_mode || "autodj",
        live_title: settings.live_title || "GOODLIFE RADIO LIVE",
        live_stream_url: settings.live_stream_url || "",
        active_set_id: settings.active_set_id || null,
        active_started_at: settings.active_started_at || null,
      },
      playlist: playlist ? {
        id: playlist.playlist_id,
        name: playlist.playlist_name,
        activated_at: playlist.activated_at,
        tracks_in_rotation: playlist.tracks_count,
      } : null,
      catalog: {
        total_tracks: totalTracks,
        total_drops: totalDrops,
        unplayed_drops: unplayedDrops,
      },
      recent_drops: recentDropRes.rows,
      last_cron_generation: lastTelemetry,
    }, {
      headers: {
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
    });
  } catch (err: any) {
    return NextResponse.json({
      status: "error",
      error: err?.message || String(err),
      server_time: now.toISOString(),
    }, { status: 500 });
  }
}
