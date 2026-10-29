import { NextResponse } from "next/server";
import { neonQuery } from "@/lib/supabase-db";
import { resolveCoverArt } from "@/lib/radio/media-helpers";

export const revalidate = 5;

// In-memory serverless cache (short 5s cache to ensure kill-switch and stream switchers react promptly)
let _stateDbCache: {
  settings: any;
  sets: any[];
  fallbackSet: any;
  totalDurationSec: number;
  ts: number;
} | null = null;

// Module-level schema cache: checked once per serverless worker instance (0 DB queries on subsequent calls)
let _hasRadioEnabledColumn: boolean | null = null;

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
    title: "Wigman · Live Frequency",
    audio_url: "https://pub-a4616bfcc17e435a86f092c95d4e603b.r2.dev/radio/drops/ai_1793103865_e61bf9.mp3",
    persona: "Wigman",
    mood: "STOIC",
  },
];

export async function GET() {
  const now = Date.now();
  try {
    let cached = _stateDbCache;
    if (!cached || now - cached.ts > 5000) {
      // 1. Fetch settings and check for runtime kill-switch flag
      let settings = {
        broadcast_mode: "autodj",
        live_stream_url: "",
        live_title: "GOODLIFE RADIO LIVE",
        live_fallback_set_id: null,
        radio_enabled: true,
      };

      try {
        const settingsRes = await neonQuery(
          "SELECT broadcast_mode, live_stream_url, live_title, live_fallback_set_id, active_set_id, active_started_at, radio_enabled FROM radio_settings WHERE id = 1"
        );
        if (settingsRes.rows[0]) {
          settings = { ...settings, ...settingsRes.rows[0] };
        }

        // Check if radio_enabled column exists in DB (cached at module level)
        if (_hasRadioEnabledColumn === null) {
          try {
            const colRes = await neonQuery(
              "SELECT column_name FROM information_schema.columns WHERE table_name = 'radio_settings' AND column_name = 'radio_enabled'"
            );
            _hasRadioEnabledColumn = colRes.rows.length > 0;
          } catch {
            _hasRadioEnabledColumn = false;
          }
        }

        if (_hasRadioEnabledColumn) {
          const flagRes = await neonQuery("SELECT radio_enabled FROM radio_settings WHERE id = 1");
          if (flagRes.rows[0]?.radio_enabled !== undefined) {
            settings.radio_enabled = Boolean(flagRes.rows[0].radio_enabled);
          }
        }
      } catch (err) {
        console.warn("[api/radio/state] Error loading radio_settings:", err);
      }

      // If station broadcast_mode is not 'live', there is no external stream — 24/7 R2 tracks are active
      if (settings.broadcast_mode !== "live") {
        settings.live_stream_url = "";
      } else if (!settings.live_stream_url && process.env.RADIO_STREAM_URL && process.env.RADIO_STREAM_URL.trim() !== "") {
        settings.live_stream_url = process.env.RADIO_STREAM_URL.trim();
      }

      // Filter out invalid/obsolete stream domains
      if (settings.live_stream_url && settings.live_stream_url.includes("darajadigital")) {
        settings.live_stream_url = "";
      }

      // 2. Fetch active ready tracks
      const setsRes = await neonQuery(`
        SELECT 
          id, event_id, title, dj_name, audio_url, audio_high_url, cover_url, 
          duration, duration_sec, genre, file_size, bitrate, play_count, created_at
        FROM radio_sets
        WHERE deleted_at IS NULL AND is_active = true AND processing_status = 'ready'
        ORDER BY display_order ASC, id ASC
        LIMIT 60
      `);
      const rawSets = setsRes.rows || [];
      const sets = rawSets.map((s: any) => {
        let cover = resolveCoverArt(s.cover_url);
        if (cover.includes("/vi/")) {
          const m = cover.match(/\/vi\/([a-zA-Z0-9_-]+)\//);
          if (m && m[1]) {
            cover = `https://img.youtube.com/vi/${m[1]}/mqdefault.jpg`;
          }
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
      let activeIdx = 0;
      let offsetSec = 0;
      const nowSec = Math.floor(Date.now() / 1000);

      // Check if DJ MANIA mode is engaged with a manual active set
      const isMania = settings.broadcast_mode === "mania" && settings.active_set_id;
      const maniaIdx = isMania ? sets.findIndex((s: any) => s.id === Number(settings.active_set_id)) : -1;

      if (isMania && maniaIdx !== -1) {
        activeIdx = maniaIdx;
        const trackDur = (sets[activeIdx].duration_sec && sets[activeIdx].duration_sec > 0) ? sets[activeIdx].duration_sec : 180;
        const startedAtMs = settings.active_started_at ? new Date(settings.active_started_at).getTime() : Date.now();
        const elapsed = Math.max(0, Math.floor((Date.now() - startedAtMs) / 1000));
        offsetSec = elapsed % trackDur;

        broadcastSchedule = {
          active_index: activeIdx,
          active_set_id: sets[activeIdx].id,
          offset_sec: offsetSec,
          server_time: nowSec,
          total_duration_sec: totalDurationSec,
          is_mania: true,
        };
      } else {
        // AUTODJ: Virtual Synchronized Playout Loop across festival library
        const cycleSec = nowSec % totalDurationSec;
        let cumulative = 0;

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
          is_mania: false,
        };
      }

      // Check upcoming drop for the next track
      const nextIdx = (activeIdx + 1) % sets.length;
      const nextTrack = sets[nextIdx];
      if (nextTrack) {
        try {
          const dropRes = await neonQuery(
            `SELECT persona, mood, title, script, audio_url as drop_url, target_track_id
             FROM radio_drops
             WHERE target_track_id = $1 AND created_at > NOW() - INTERVAL '5 minutes'
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

      // Dynamic drops are generated live on-the-fly per track transition, not loaded from stale DB rows
      const activeDrops: any[] = [];

    const payload = {
      enabled: settings.radio_enabled !== false,
      mode: settings.broadcast_mode || "live",
      listeners_count: 0,
      live: {
        title: settings.live_title || "GOODLIFE RADIO LIVE",
        stream_url: settings.live_stream_url || "",
        fallback_set: fallbackSet,
      },
      broadcast: broadcastSchedule,
      sets,
      drops: activeDrops,
      upcoming_drop: upcomingDrop,
    };

    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "public, s-maxage=10, stale-while-revalidate=15",
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
