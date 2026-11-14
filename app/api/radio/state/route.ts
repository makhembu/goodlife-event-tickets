import { NextResponse } from "next/server";
import { neonQuery } from "@/lib/supabase-db";
import { resolveCoverArt } from "@/lib/radio/media-helpers";
import { getActiveListenersCount } from "@/lib/radio/listener-tracker";
import { withPlayback } from "@/lib/radio/playback";

export const revalidate = 5;

// In-memory serverless cache (short 5s cache to ensure kill-switch and stream switchers react promptly)
let _stateDbCache: {
  settings: any;
  sets: any[];
  fallbackSet: any;
  totalDurationSec: number;
  activatedAt: string | null;
  activePlaylistName: string | null;
  activePlaylistId: number | null;
  onAirSlot: any;
  ts: number;
} | null = null;

// Module-level schema cache: checked once per serverless worker instance (0 DB queries on subsequent calls)
let _hasRadioEnabledColumn: boolean | null = null;

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

      // Check for an authentically live show slot in Neon database
      let onAirSlotData: any = null;
      try {
        const liveSlotRes = await neonQuery(`
          SELECT s.id AS slot_id, s.starts_at, s.ends_at, s.actual_started_at,
                 sh.id AS show_id, sh.title AS show_title, sh.slug AS show_slug,
                 p.id AS presenter_id, p.dj_name AS presenter_dj_name, p.slug AS presenter_slug,
                 COALESCE(sub.dj_name, p.dj_name) AS on_air_dj_name,
                 COALESCE(sub.slug, p.slug) AS on_air_dj_slug
          FROM show_slots s
          JOIN shows sh ON s.show_id = sh.id
          JOIN presenters p ON s.presenter_id = p.id
          LEFT JOIN presenters sub ON s.substitute_presenter_id = sub.id
          WHERE s.status = 'live'
          LIMIT 1;
        `);

        if (liveSlotRes.rows.length > 0) {
          const row = liveSlotRes.rows[0];
          onAirSlotData = {
            slot_id: row.slot_id,
            starts_at: row.starts_at,
            ends_at: row.ends_at,
            actual_started_at: row.actual_started_at,
            show: {
              id: row.show_id,
              title: row.show_title,
              slug: row.show_slug,
            },
            presenter: {
              id: row.presenter_id,
              dj_name: row.on_air_dj_name,
              slug: row.on_air_dj_slug,
            },
            is_live: true,
          };
          settings.broadcast_mode = "live";
          settings.live_title = `${row.show_title} with ${row.on_air_dj_name}`;
        } else if (settings.broadcast_mode === "live") {
          // No presenter slot is live right now: fail-safe to autodj so player doesn't lie
          settings.broadcast_mode = "autodj";
        }
      } catch (slotErr) {
        console.warn("[api/radio/state] Error checking live show_slots:", slotErr);
      }

      // If station broadcast_mode is not 'live', there is no external stream — 24/7 R2 tracks are active
      if (settings.broadcast_mode !== "live") {
        settings.live_stream_url = "";
      } else if (!settings.live_stream_url && process.env.RADIO_STREAM_URL && process.env.RADIO_STREAM_URL.trim() !== "") {
        settings.live_stream_url = process.env.RADIO_STREAM_URL.trim();
      }


      // 2. Fetch tracks: from active broadcast playlist, or fallback to ready catalog
      const playlistRes = await neonQuery(`
        SELECT p.id as playlist_id, p.name as playlist_name, p.activated_at,
               s.id, s.event_id, s.title, s.dj_name, s.audio_url, s.audio_high_url, s.r2_key, s.cover_url, 
               s.duration, s.duration_sec, s.genre, s.file_size, s.bitrate, s.play_count, s.created_at, pt.position
        FROM radio_playlists p
        JOIN radio_playlist_tracks pt ON pt.playlist_id = p.id
        JOIN radio_sets s ON s.id = pt.track_id AND s.deleted_at IS NULL AND (s.is_active = true OR s.is_active IS NULL)
        WHERE p.is_broadcast_active = true AND p.deleted_at IS NULL
        ORDER BY pt.position ASC, pt.id ASC
      `).catch(() => ({ rows: [] }));

      let rawSets: any[] = [];
      let activatedAt: string | null = null;
      let activePlaylistName: string | null = null;
      let activePlaylistId: number | null = null;

      if (playlistRes.rows.length > 0) {
        rawSets = playlistRes.rows;
        activatedAt = playlistRes.rows[0].activated_at;
        activePlaylistName = playlistRes.rows[0].playlist_name;
        activePlaylistId = playlistRes.rows[0].playlist_id;
      } else {
        const setsRes = await neonQuery(`
          SELECT 
            id, event_id, title, dj_name, audio_url, audio_high_url, r2_key, cover_url, 
            duration, duration_sec, genre, file_size, bitrate, play_count, created_at
          FROM radio_sets
          WHERE deleted_at IS NULL AND (is_active = true OR is_active IS NULL) AND processing_status = 'ready'
          ORDER BY display_order ASC, id ASC
        `);
        rawSets = setsRes.rows || [];
      }

      const sets = rawSets.map((s: any) => {
        let cover = resolveCoverArt(s.cover_url);
        if (cover.includes("/vi/")) {
          const m = cover.match(/\/vi\/([a-zA-Z0-9_-]+)\//);
          if (m && m[1]) {
            cover = `https://img.youtube.com/vi/${m[1]}/mqdefault.jpg`;
          }
        }
        return withPlayback(
          {
            ...s,
            cover_url: cover,
          },
          "track"
        );
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
        activatedAt,
        activePlaylistName,
        activePlaylistId,
        onAirSlot: onAirSlotData,
        ts: now,
      };
      _stateDbCache = cached;
    }

    const {
      settings,
      sets,
      fallbackSet,
      totalDurationSec,
      activatedAt,
      activePlaylistName,
      activePlaylistId,
      onAirSlot,
    } = cached;

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

      if (isMania) {
        let maniaTrack = maniaIdx !== -1 ? sets[maniaIdx] : null;
        if (!maniaTrack && settings.active_set_id) {
          try {
            const directSetRes = await neonQuery(
              `SELECT id, title, dj_name, audio_url, cover_url, duration, duration_sec, genre 
               FROM radio_sets WHERE id = $1 AND deleted_at IS NULL`,
              [Number(settings.active_set_id)]
            );
            if (directSetRes.rows.length > 0) {
              maniaTrack = directSetRes.rows[0];
            }
          } catch {}
        }

        if (maniaTrack) {
          const trackDur = (maniaTrack.duration_sec && maniaTrack.duration_sec > 0) ? maniaTrack.duration_sec : 180;
          const startedAtMs = settings.active_started_at ? new Date(settings.active_started_at).getTime() : Date.now();
          const elapsed = Math.max(0, Math.floor((Date.now() - startedAtMs) / 1000));
          offsetSec = elapsed % trackDur;

          broadcastSchedule = {
            active_index: maniaIdx !== -1 ? maniaIdx : 0,
            active_set_id: maniaTrack.id,
            offset_sec: offsetSec,
            server_time: nowSec,
            total_duration_sec: totalDurationSec,
            is_mania: true,
            playlist_id: activePlaylistId,
            playlist_name: activePlaylistName,
          };
        }
      }

      if (!broadcastSchedule) {
        // AUTODJ: Virtual Synchronized Playout Loop across active playlist (or festival library fallback)
        let cycleSec = 0;
        if (activatedAt) {
          const activatedAtSec = Math.floor(new Date(activatedAt).getTime() / 1000);
          const elapsedSinceActivation = Math.max(0, nowSec - activatedAtSec);
          cycleSec = totalDurationSec > 0 ? (elapsedSinceActivation % totalDurationSec) : 0;
        } else {
          cycleSec = totalDurationSec > 0 ? (nowSec % totalDurationSec) : 0;
        }

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
          playlist_id: activePlaylistId,
          playlist_name: activePlaylistName,
        };
      }

      // Check upcoming drop for the next track
      const nextIdx = (activeIdx + 1) % sets.length;
      const nextTrack = sets[nextIdx];
      if (nextTrack) {
        try {
          const dropRes = await neonQuery(
            `SELECT id, persona, mood, title, script, audio_url as drop_url, target_track_id
             FROM radio_drops
             WHERE target_track_id = $1 
               AND status = 'READY'
               AND audio_url IS NOT NULL 
               AND audio_url != ''
               AND created_at > NOW() - INTERVAL '15 minutes'
             ORDER BY created_at DESC
             LIMIT 1`,
            [nextTrack.id]
          );
          if (dropRes.rows.length > 0) {
            const d = dropRes.rows[0];
            upcomingDrop = withPlayback(
              {
                id: d.id,
                persona: d.persona,
                mood: d.mood,
                title: d.title,
                script: d.script,
                audio_url: d.drop_url,
                target_track_id: d.target_track_id,
              },
              "drop"
            );
          }
        } catch {}
      }
    }

      // Load active drops from PostgreSQL database
      let activeDrops: any[] = [];
      try {
        const dropsRes = await neonQuery(
          `SELECT id, persona, mood, title, script, audio_url, target_track_id, target_track_title
           FROM radio_drops
           WHERE (created_at > NOW() - INTERVAL '7 days' OR timing_type IN ('generic', 'station_id', 'intro', 'outro'))
             AND (timing_type IS NULL OR timing_type NOT IN ('live_inject', 'live_drop'))
             AND audio_url IS NOT NULL
           ORDER BY created_at DESC
           LIMIT 50`
        );
        activeDrops = (dropsRes.rows || []).map((r: any) =>
          withPlayback(
            {
              id: `db-drop-${r.id}`,
              title: r.title,
              script: r.script,
              audio_url: r.audio_url,
              persona: r.persona,
              mood: r.mood,
              target_track_id: r.target_track_id,
              target_track_title: r.target_track_title,
            },
            "drop"
          )
        );
      } catch (dbErr: any) {
        console.warn("[api/radio/state] Error loading active drops:", dbErr.message);
      }

    const activeListeners = await getActiveListenersCount();

    const payload = {
      enabled: settings.radio_enabled !== false,
      mode: settings.broadcast_mode || "live",
      listeners_count: activeListeners,
      on_air_slot: onAirSlot || null,
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
        drops: [],
      });
    }
    return NextResponse.json(
      {
        mode: "curated",
        live: { title: "", stream_url: "", fallback_set: null },
        sets: [],
        error: true,
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        },
      }
    );
  }
}
