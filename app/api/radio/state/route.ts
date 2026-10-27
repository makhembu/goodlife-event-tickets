import { NextResponse } from "next/server";
import { neonQuery } from "@/lib/supabase-db";

export const revalidate = 15;

// In-memory serverless cache to eliminate cold database latency & connection exhaustion
let _stateDbCache: {
  settings: any;
  sets: any[];
  fallbackSet: any;
  totalDurationSec: number;
  ts: number;
} | null = null;

// Neutral Station Sweepers with 4 Personas
const DROPS = [
  {
    id: "drop-shax-hype",
    title: "DJ Shax · Nairobi Festival Airwaves",
    audio_url: "https://pub-a4616bfcc17e435a86f092c95d4e603b.r2.dev/radio/drops/1793110740827-dyn_dj-shax_mvqru6hd_ht10.mp3",
    persona: "DJ Shax",
    mood: "HYPE",
  },
  {
    id: "drop-amina-sunset",
    title: "Amina · Sunset Frequency",
    audio_url: "https://pub-a4616bfcc17e435a86f092c95d4e603b.r2.dev/radio/drops/1793110767747-dyn_amina_mvqrur9e_aq1d.mp3",
    persona: "Amina",
    mood: "SENSUAL",
  },
  {
    id: "drop-cheche-sheng",
    title: "MC Cheche · Nairobi Sound",
    audio_url: "https://pub-a4616bfcc17e435a86f092c95d4e603b.r2.dev/radio/drops/ai_1793102386_09ef74.mp3",
    persona: "MC Cheche",
    mood: "BANTER",
  },
  {
    id: "drop-wigman-live",
    title: "Wigman · 98.4 FM Live",
    audio_url: "https://pub-a4616bfcc17e435a86f092c95d4e603b.r2.dev/radio/drops/ai_1793103865_e61bf9.mp3",
    persona: "Wigman",
    mood: "STOIC",
  },
];

export async function GET() {
  const now = Date.now();
  try {
    let cached = _stateDbCache;
    if (!cached || now - cached.ts > 20000) {
      // 1. Fetch settings
      const settingsRes = await neonQuery(
        "SELECT broadcast_mode, live_stream_url, live_title, live_fallback_set_id FROM radio_settings WHERE id = 1"
      );
      const settings = settingsRes.rows[0] || {
        broadcast_mode: "curated",
        live_stream_url: "",
        live_title: "GOODLIFE MAIN STAGE LIVE",
        live_fallback_set_id: null,
      };

      // 2. Fetch active ready tracks
      const setsRes = await neonQuery(`
        SELECT 
          id, event_id, title, dj_name, audio_url, audio_high_url, cover_url, 
          duration, duration_sec, genre, file_size, bitrate, play_count, created_at
        FROM radio_sets
        WHERE deleted_at IS NULL AND is_active = true AND processing_status = 'ready'
        ORDER BY display_order ASC, created_at DESC
        LIMIT 60
      `);
      const rawSets = setsRes.rows || [];
      const sets = rawSets.map((s: any) => {
        let cover = s.cover_url || "";
        if (cover.includes("192.168.")) {
          const m = cover.match(/\/vi\/([a-zA-Z0-9_-]+)\//);
          cover = m && m[1] ? `https://img.youtube.com/vi/${m[1]}/hqdefault.jpg` : "/flyer.png";
        } else if (!cover) {
          cover = "/flyer.png";
        }
        return {
          ...s,
          cover_url: cover,
        };
      });

      let fallbackSet = null;
      if (settings.live_fallback_set_id) {
        fallbackSet = sets.find((s: any) => s.id === settings.live_fallback_set_id) || sets[0] || null;
      } else if (sets.length > 0) {
        fallbackSet = sets[0];
      }

      let totalDurationSec = 0;
      for (const s of sets) {
        totalDurationSec += (s.duration_sec && s.duration_sec > 0) ? s.duration_sec : 180;
      }

      cached = {
        settings,
        sets,
        fallbackSet,
        totalDurationSec,
        ts: now,
      };
      _stateDbCache = cached;
    }

    const { settings, sets, fallbackSet, totalDurationSec } = cached;

    // 3. Compute 24/7 Virtual Synchronized Broadcast Schedule (Instant math, 0ms)
    let broadcastSchedule = null;
    let upcomingDrop = null;

    if (sets.length > 0 && totalDurationSec > 0) {
      const nowSec = Math.floor(Date.now() / 1000);
      const cycleSec = nowSec % totalDurationSec;
      let cumulative = 0;
      let activeIdx = 0;
      let offsetSec = 0;

      for (let i = 0; i < sets.length; i++) {
        const trackDur = (sets[i].duration_sec && sets[i].duration_sec > 0) ? sets[i].duration_sec : 180;
        if (cumulative + trackDur > cycleSec) {
          activeIdx = i;
          offsetSec = cycleSec - cumulative;
          break;
        }
        cumulative += trackDur;
      }

      broadcastSchedule = {
        active_index: activeIdx,
        active_set_id: sets[activeIdx]?.id,
        offset_sec: offsetSec,
        server_time: nowSec,
        total_duration_sec: totalDurationSec,
      };

      // Check upcoming drop for the next track
      const nextIdx = (activeIdx + 1) % sets.length;
      const nextTrack = sets[nextIdx];
      if (nextTrack) {
        try {
          const dropRes = await neonQuery(
            `SELECT persona, mood, title, script, audio_url as drop_url, target_track_id
             FROM radio_drops
             WHERE target_track_id = $1
             ORDER BY created_at DESC
             LIMIT 1`,
            [nextTrack.id]
          );
          if (dropRes.rows.length > 0) {
            upcomingDrop = dropRes.rows[0];
          }
        } catch {}
      }
    }

    const payload = {
      mode: settings.broadcast_mode || "curated",
      live: {
        title: settings.live_title || "GOODLIFE MAIN STAGE LIVE",
        stream_url: settings.live_stream_url || "",
        fallback_set: fallbackSet,
      },
      broadcast: broadcastSchedule,
      sets,
      drops: DROPS,
      upcoming_drop: upcomingDrop,
    };

    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "public, s-maxage=10, stale-while-revalidate=45",
      },
    });
  } catch (err: any) {
    console.error("[api/radio/state] Error:", err);
    // Stale cache fallback if database is temporarily unavailable
    if (_stateDbCache) {
      const { settings, sets, fallbackSet } = _stateDbCache;
      return NextResponse.json({
        mode: settings.broadcast_mode || "curated",
        live: { title: settings.live_title || "", stream_url: settings.live_stream_url || "", fallback_set: fallbackSet },
        sets,
        drops: DROPS,
      });
    }
    return NextResponse.json(
      { mode: "curated", live: { title: "", stream_url: "", fallback_set: null }, sets: [] },
      { status: 500 }
    );
  }
}
