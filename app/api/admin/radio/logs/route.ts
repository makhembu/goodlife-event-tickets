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
        listenersCount: 1350,
        nairobiTimeEAT: "18:00",
        nairobiTime12h: "6:00 PM",
        timeSlot: "sunset_vibes",
        timeSlotLabel: "Evening Airwaves",
        weather: "22°C Nairobi",
        trafficBulletin: "Steady traffic across Nairobi arterial highways",
        entertainmentNews: "Kenya music festivals buzz",
        activeCities: ["Nairobi", "Thika", "Eldoret"],
        venue: "Marara Camp, Thika",
        frequency: "98.4 FM",
      };
    }

    // 2. Query recent generated drops
    const dropsRes = await neonQuery(`
      SELECT 
        id, persona, mood, title, script, audio_url, 
        target_track_id, target_track_title, target_artist, 
        timing_type, play_count, created_at
      FROM radio_drops
      ORDER BY created_at DESC
      LIMIT 50
    `);
    const drops = dropsRes.rows || [];

    // 3. Query total drops count
    const countRes = await neonQuery(`SELECT COUNT(*)::int as total FROM radio_drops`);
    const totalDrops = countRes.rows[0]?.total || drops.length;

    // 4. Query total radio plays
    const playsRes = await neonQuery(`SELECT COUNT(*)::int as total FROM radio_plays`);
    const totalPlays = playsRes.rows[0]?.total || 0;

    // 5. Query active tracks to compute exact playhead timeline
    const setsRes = await neonQuery(`
      SELECT id, title, dj_name, duration_sec, audio_url, cover_url, genre
      FROM radio_sets
      WHERE deleted_at IS NULL AND is_active = true AND processing_status = 'ready'
      ORDER BY display_order ASC, created_at DESC
    `);
    const sets = setsRes.rows || [];

    let broadcast = null;
    if (sets.length > 0) {
      const live = computeLiveTimeline(sets);
      const currentTrack = sets[live.index];
      const nextTrack = sets[(live.index + 1) % sets.length];
      const dur = currentTrack?.duration_sec || 180;
      const timeLeft = Math.max(0, dur - live.offsetSec);

      broadcast = {
        currentIndex: live.index,
        currentTrack,
        nextTrack,
        offsetSec: live.offsetSec,
        durationSec: dur,
        timeLeftSec: timeLeft,
        progressPercent: dur > 0 ? (live.offsetSec / dur) * 100 : 0,
        totalTracks: sets.length,
      };
    }

    // 6. City breakdown from recent listener plays
    const cityRes = await neonQuery(`
      SELECT COALESCE(listener_city, 'Nairobi') as city, COUNT(*)::int as count
      FROM radio_plays
      WHERE created_at > NOW() - INTERVAL '24 hours'
      GROUP BY COALESCE(listener_city, 'Nairobi')
      ORDER BY count DESC
      LIMIT 8
    `);
    const cityBreakdown = cityRes.rows || [];

    return NextResponse.json({
      broadcast,
      telemetry,
      drops,
      stats: {
        totalDropsGenerated: totalDrops,
        totalPlays,
        activeListeners: telemetry.listenersCount,
      },
      cityBreakdown,
    });
  } catch (err: any) {
    console.error("[api/admin/radio/logs] Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
