import { NextResponse } from "next/server";
import { neonQuery } from "@/lib/supabase-db";
import { formatTrackTitle } from "@/lib/radio/media-helpers";

export const dynamic = "force-dynamic";

interface LiveCachedState {
  nowPlaying: any;
  upNext: any[];
  history: any[];
  ts: number;
}

let _cachedLiveState: LiveCachedState | null = null;

async function queryRecentLiveDrop() {
  try {
    const dropRes = await neonQuery(
      `SELECT id, persona, mood, title, script, audio_url, created_at,
              ROUND(EXTRACT(EPOCH FROM (NOW() - created_at))) as age_seconds
       FROM radio_drops
       WHERE timing_type IN ('live_inject', 'live_drop')
         AND audio_url IS NOT NULL
         AND audio_url NOT LIKE 'blob:%'
         AND created_at > NOW() - INTERVAL '120 seconds'
       ORDER BY created_at DESC
       LIMIT 1`
    );
    if (dropRes.rows.length > 0) {
      const d = dropRes.rows[0];
      return {
        id: d.id,
        persona: d.persona,
        title: d.title,
        script: d.script,
        audio_url: d.audio_url,
        fired_at: d.created_at,
        age_seconds: Number(d.age_seconds) || 0,
      };
    }
  } catch {}
  return null;
}

async function getTimelineFallback() {
  try {
    const [playlistRes, settingsRes, liveDrop] = await Promise.all([
      neonQuery(`
        SELECT p.id as playlist_id, p.name as playlist_name, p.activated_at,
               s.id, s.title, s.dj_name, s.audio_url, s.cover_url, s.duration, s.duration_sec, s.genre, pt.position
        FROM radio_playlists p
        JOIN radio_playlist_tracks pt ON pt.playlist_id = p.id
        JOIN radio_sets s ON s.id = pt.track_id AND s.deleted_at IS NULL AND (s.is_active = true OR s.is_active IS NULL)
        WHERE p.is_broadcast_active = true AND p.deleted_at IS NULL
        ORDER BY pt.position ASC, pt.id ASC
      `).catch(() => ({ rows: [] })),
      neonQuery(
        "SELECT broadcast_mode, active_set_id, active_started_at FROM radio_settings WHERE id = 1"
      ).catch(() => ({ rows: [] })),
      queryRecentLiveDrop(),
    ]);

    let sets: any[] = [];
    let activatedAt: string | null = null;
    let activePlaylistName: string | null = null;

    if (playlistRes.rows.length > 0) {
      sets = playlistRes.rows;
      activatedAt = playlistRes.rows[0].activated_at;
      activePlaylistName = playlistRes.rows[0].playlist_name;
    } else {
      // If no playlist explicitly marked active, activate and lock primary broadcast playlist (e.g. Millennial Hip-Hop Anthems #2)
      const defaultPlRes = await neonQuery(`
        SELECT p.id as playlist_id, p.name as playlist_name, p.activated_at,
               s.id, s.title, s.dj_name, s.audio_url, s.cover_url, s.duration, s.duration_sec, s.genre, pt.position
        FROM radio_playlists p
        JOIN radio_playlist_tracks pt ON pt.playlist_id = p.id
        JOIN radio_sets s ON s.id = pt.track_id AND s.deleted_at IS NULL AND (s.is_active = true OR s.is_active IS NULL)
        WHERE p.deleted_at IS NULL AND p.id = 2
        ORDER BY pt.position ASC, pt.id ASC
      `).catch(() => ({ rows: [] }));

      if (defaultPlRes.rows.length > 0) {
        sets = defaultPlRes.rows;
        activatedAt = defaultPlRes.rows[0].activated_at || new Date().toISOString();
        activePlaylistName = defaultPlRes.rows[0].playlist_name;
        neonQuery(`UPDATE radio_playlists SET is_broadcast_active = true, activated_at = NOW(), updated_at = NOW() WHERE id = 2`).catch(() => {});
      } else {
        const setsRes = await neonQuery(`
          SELECT id, title, dj_name, audio_url, cover_url, duration, duration_sec, genre, display_order
          FROM radio_sets
          WHERE deleted_at IS NULL AND (is_active = true OR is_active IS NULL) AND processing_status = 'ready'
          ORDER BY display_order ASC, id ASC
        `);
        sets = setsRes.rows || [];
      }
    }

    if (sets.length === 0) return null;

    const settings = settingsRes.rows[0] || {};
    const isMania = settings.broadcast_mode === "mania" && settings.active_set_id;
    const maniaIdx = isMania ? sets.findIndex((s: any) => s.id === Number(settings.active_set_id)) : -1;

    let activeIdx = 0;
    let offsetSec = 0;
    let activeMode: "autodj" | "mania" = "autodj";
    let currentTrack: any = null;
    let nextTracks: any[] = [];

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

        if (elapsed < trackDur) {
          currentTrack = maniaTrack;
          offsetSec = elapsed;
          activeMode = "mania";
          const mIdx = sets.findIndex((s: any) => s.id === maniaTrack.id);
          nextTracks = [
            sets[(mIdx + 1) % sets.length],
            sets[(mIdx + 2) % sets.length],
            sets[(mIdx + 3) % sets.length],
          ].filter(Boolean);
        } else {
          // Mania track finished: smoothly transition to the NEXT sequential track in rotation
          const endedIdx = sets.findIndex((s: any) => s.id === maniaTrack.id);
          activeIdx = endedIdx !== -1 ? (endedIdx + 1) % sets.length : 0;
          currentTrack = sets[activeIdx] || sets[0];
          offsetSec = Math.max(0, Math.min(20, elapsed - trackDur));
          activeMode = "autodj";
          nextTracks = [
            sets[(activeIdx + 1) % sets.length],
            sets[(activeIdx + 2) % sets.length],
            sets[(activeIdx + 3) % sets.length],
          ].filter(Boolean);
          neonQuery("UPDATE radio_settings SET broadcast_mode = 'autodj', active_set_id = NULL, updated_at = NOW() WHERE id = 1").catch(() => {});
        }
      }
    }

    if (activeMode === "autodj" || !currentTrack) {
      const totalDurationSec = sets.reduce((acc: number, s: any) => acc + (s.duration_sec || 180), 0);
      const nowSec = Math.floor(Date.now() / 1000);
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
        const dur = sets[i].duration_sec || 180;
        if (cumulative + dur > cycleSec) {
          activeIdx = i;
          offsetSec = cycleSec - cumulative;
          break;
        }
        cumulative += dur;
      }

      currentTrack = sets[activeIdx] || sets[0];
      nextTracks = [
        sets[(activeIdx + 1) % sets.length],
        sets[(activeIdx + 2) % sets.length],
        sets[(activeIdx + 3) % sets.length],
      ].filter(Boolean);
    }

    if (!currentTrack) return null;

    return {
      offline: false,
      stale: false,
      mode: activeMode,
      playlist_id: playlistRes.rows[0]?.playlist_id || null,
      playlist_name: activePlaylistName,
      now_playing: {
        id: currentTrack.id,
        title: formatTrackTitle(currentTrack.title),
        artist: currentTrack.dj_name,
        thumbnail: currentTrack.cover_url,
        elapsed: offsetSec,
        duration: currentTrack.duration_sec || 180,
        audio_url: currentTrack.audio_url,
        video_id: `set-${currentTrack.id}`,
      },
      up_next: nextTracks.map((t: any) => ({
        id: t.id,
        title: formatTrackTitle(t.title),
        artist: t.dj_name,
        duration: t.duration_sec || 180,
        thumbnail: t.cover_url,
      })),
      history: [],
      live_drop: liveDrop,
      target_duration_sec: 2.0,
    };
  } catch (err: any) {
    console.error("[api/radio/live] Fallback query failed:", err?.message || err);
    return null;
  }
}

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "User-Agent": "GoodlifeRadio-BFF/1.0",
      },
    });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

export async function GET() {
  const upstreamBase = process.env.RADIO_UPSTREAM_URL?.trim();

  // 1. Check current station broadcast mode from database (Cloudflare virtual schedule is primary)
  let broadcastMode = "autodj";
  try {
    const settingsRes = await neonQuery(
      "SELECT broadcast_mode FROM radio_settings WHERE id = 1"
    );
    if (settingsRes.rows[0]?.broadcast_mode) {
      broadcastMode = settingsRes.rows[0].broadcast_mode;
    }
  } catch {}

  // 2. If station is in autodj or mania mode, Cloudflare R2 virtual timeline is the primary playout
  if (broadcastMode !== "live" || !upstreamBase) {
    const fallback = await getTimelineFallback();
    if (fallback) {
      return NextResponse.json(fallback, {
        status: 200,
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        },
      });
    }

    return NextResponse.json(
      {
        offline: true,
        reason: "No active radio sets available",
        now_playing: null,
        up_next: [],
        history: [],
        stale: false,
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        },
      }
    );
  }

  // 3. Station is in explicit live stage mode: query upstream relay with 3000ms timeout
  const cleanBase = upstreamBase.replace(/\/+$/, "");
  const timeoutMs = 3000;

  try {
    const [nowRes, nextRes, histRes] = await Promise.all([
      fetchWithTimeout(`${cleanBase}/api/now-playing`, timeoutMs),
      fetchWithTimeout(`${cleanBase}/api/up-next`, timeoutMs),
      fetchWithTimeout(`${cleanBase}/api/history`, timeoutMs),
    ]);

    if (!nowRes.ok) {
      throw new Error(`now-playing responded with status ${nowRes.status}`);
    }

    const nowPlaying = await nowRes.json();
    const upNext = nextRes.ok ? await nextRes.json().catch(() => []) : [];
    const history = histRes.ok ? await histRes.json().catch(() => []) : [];
    const liveDrop = await queryRecentLiveDrop();

    if (nowPlaying && nowPlaying.title) {
      nowPlaying.title = formatTrackTitle(nowPlaying.title);
    }
    const cleanUpNext = Array.isArray(upNext)
      ? upNext.slice(0, 5).map((t: any) => ({
          ...t,
          title: formatTrackTitle(t?.title),
        }))
      : [];

    const liveData: LiveCachedState = {
      nowPlaying,
      upNext: cleanUpNext,
      history: Array.isArray(history) ? history.slice(0, 10) : [],
      ts: Date.now(),
    };

    _cachedLiveState = liveData;

    return NextResponse.json(
      {
        offline: false,
        stale: false,
        now_playing: liveData.nowPlaying,
        up_next: liveData.upNext,
        history: liveData.history,
        live_drop: liveDrop,
        target_duration_sec: 2.0,
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        },
      }
    );
  } catch (err: any) {
    console.warn("[api/radio/live] Upstream fetch failed or timed out:", err?.message || err);

    // If we have fresh cached data (< 15s), serve it with stale: true; otherwise advance timeline via fallback
    if (_cachedLiveState && Date.now() - _cachedLiveState.ts < 15000) {
      return NextResponse.json(
        {
          offline: false,
          stale: true,
          now_playing: _cachedLiveState.nowPlaying,
          up_next: _cachedLiveState.upNext,
          history: _cachedLiveState.history,
          target_duration_sec: 2.0,
        },
        {
          status: 200,
          headers: {
            "Cache-Control": "public, s-maxage=5, stale-while-revalidate=15",
          },
        }
      );
    }

    // 24/7 Virtual Playout Timeline Fallback
    const fallback = await getTimelineFallback();
    if (fallback) {
      return NextResponse.json(fallback, {
        status: 200,
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        },
      });
    }

    // Completely unavailable without cached fallback -> honest offline state
    return NextResponse.json(
      {
        offline: true,
        stale: true,
        reason: "Upstream server unreachable",
        now_playing: null,
        up_next: [],
        history: [],
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
