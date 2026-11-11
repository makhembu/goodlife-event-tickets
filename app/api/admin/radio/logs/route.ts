import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { neonQuery } from "@/lib/supabase-db";
import { getRadioTelemetry } from "@/lib/radio/telemetry";
import { computeLiveTimeline } from "@/lib/radio/timeline";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const unauthorized = await requireAdmin(req);
  if (unauthorized) return unauthorized;

  try {
    // 1. Fetch live telemetry
    let telemetry;
    try {
      telemetry = await getRadioTelemetry();
    } catch {
      telemetry = {
        listenersCount: 0,
        nairobiTimeEAT: "18:00",
        nairobiTime12h: "6:00 PM",
        timeSlot: "sunset_vibes",
        timeSlotLabel: "Evening Airwaves",
        weather: "22°C Nairobi",
        trafficBulletin: "Steady traffic across Nairobi arterial highways",
        entertainmentNews: "Kenya music festivals buzz",
        activeCities: ["Nairobi", "Eldoret", "Mombasa"],
        venue: "Festival Grounds",
        frequency: "Digital Airwave",
      };
    }

    // 2. Query recent generated drops (with fallback if schema columns vary)
    const dropsRes = await neonQuery(`
      SELECT 
        id, persona, mood, title, script, audio_url, 
        target_track_id, target_track_title, target_artist, 
        timing_type, play_count, created_at
      FROM radio_drops
      ORDER BY created_at DESC
      LIMIT 50
    `).catch(() =>
      neonQuery(`
        SELECT id, persona, mood, title, script, audio_url, target_track_id, target_track_title, timing_type, play_count, created_at
        FROM radio_drops ORDER BY created_at DESC LIMIT 50
      `).catch(() => ({ rows: [] }))
    );
    const drops = dropsRes.rows || [];

    // 3. Query total drops & total plays in parallel
    const [countRes, playsRes, playlistRes, settingsRes, cityRes] = await Promise.all([
      neonQuery(`SELECT COUNT(*)::int as total FROM radio_drops`).catch(() => ({ rows: [{ total: drops.length }] })),
      neonQuery(`SELECT COUNT(*)::int as total FROM radio_plays`).catch(() => ({ rows: [{ total: 0 }] })),
      neonQuery(`
        SELECT p.id as playlist_id, p.name as playlist_name, p.activated_at,
               s.id, s.title, s.dj_name, s.duration_sec, s.audio_url, s.cover_url, s.genre
        FROM radio_playlists p
        JOIN radio_playlist_tracks pt ON pt.playlist_id = p.id
        JOIN radio_sets s ON s.id = pt.track_id AND s.deleted_at IS NULL AND (s.is_active = true OR s.is_active IS NULL)
        WHERE p.is_broadcast_active = true AND p.deleted_at IS NULL
        ORDER BY pt.position ASC, pt.id ASC
      `).catch(() => ({ rows: [] })),
      neonQuery("SELECT broadcast_mode, active_set_id, active_started_at FROM radio_settings WHERE id = 1").catch(() => ({ rows: [] })),
      neonQuery(`
        SELECT COALESCE(listener_city, 'Nairobi') as city, COUNT(*)::int as count
        FROM radio_plays
        WHERE created_at > NOW() - INTERVAL '24 hours'
        GROUP BY COALESCE(listener_city, 'Nairobi')
        ORDER BY count DESC
        LIMIT 8
      `).catch(() => ({ rows: [] })),
    ]);

    const totalDrops = countRes.rows[0]?.total || drops.length;
    const totalPlays = playsRes.rows[0]?.total || 0;
    const cityBreakdown = cityRes.rows || [];

    let sets = playlistRes.rows || [];
    const activatedAt = sets.length > 0 ? sets[0].activated_at : null;

    if (sets.length === 0) {
      const setsRes = await neonQuery(`
        SELECT id, title, dj_name, duration_sec, audio_url, cover_url, genre
        FROM radio_sets
        WHERE deleted_at IS NULL AND is_active = true AND processing_status = 'ready'
        ORDER BY display_order ASC, id ASC
      `).catch(() => ({ rows: [] }));
      sets = setsRes.rows || [];
    }

    let broadcast = null;
    if (sets.length > 0) {
      const settings = settingsRes.rows[0] || {};
      let currentIdx = -1;
      let offsetSec = 0;

      if (settings.broadcast_mode === "mania" && settings.active_set_id) {
        currentIdx = sets.findIndex((s: any) => s.id === Number(settings.active_set_id));
        if (currentIdx !== -1 && settings.active_started_at) {
          const startedAtMs = new Date(settings.active_started_at).getTime();
          const elapsed = Math.max(0, Math.floor((Date.now() - startedAtMs) / 1000));
          const trackDur = sets[currentIdx]?.duration_sec || 180;
          if (elapsed < trackDur) {
            offsetSec = elapsed;
          } else {
            currentIdx = -1;
          }
        }
      }

      if (currentIdx === -1) {
        if (activatedAt) {
          const totalDurationSec = sets.reduce((acc: number, s: any) => acc + (s.duration_sec || 180), 0);
          const nowSec = Math.floor(Date.now() / 1000);
          const activatedAtSec = Math.floor(new Date(activatedAt).getTime() / 1000);
          const elapsedSinceActivation = Math.max(0, nowSec - activatedAtSec);
          const cycleSec = totalDurationSec > 0 ? (elapsedSinceActivation % totalDurationSec) : 0;
          let cumulative = 0;
          currentIdx = 0;
          for (let i = 0; i < sets.length; i++) {
            const dur = sets[i].duration_sec || 180;
            if (cumulative + dur > cycleSec) {
              currentIdx = i;
              offsetSec = cycleSec - cumulative;
              break;
            }
            cumulative += dur;
          }
        } else {
          const live = computeLiveTimeline(sets);
          currentIdx = live.index;
          offsetSec = live.offsetSec;
        }
      }

      const currentTrack = sets[currentIdx] || sets[0];
      const nextTrack = sets[(currentIdx + 1) % sets.length];
      const dur = currentTrack?.duration_sec || 180;
      const timeLeft = Math.max(0, dur - offsetSec);

      broadcast = {
        currentIndex: currentIdx,
        currentTrack,
        nextTrack,
        offsetSec,
        durationSec: dur,
        timeLeftSec: timeLeft,
        progressPercent: dur > 0 ? (offsetSec / dur) * 100 : 0,
        totalTracks: sets.length,
      };
    }

    return NextResponse.json(
      {
        broadcast,
        telemetry,
        drops,
        stats: {
          totalDropsGenerated: totalDrops,
          totalPlays,
          activeListeners: telemetry.listenersCount,
        },
        cityBreakdown,
      },
      { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } }
    );
  } catch (err: any) {
    console.error("[api/admin/radio/logs] Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
