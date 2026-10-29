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
      `SELECT id, persona, mood, title, script, audio_url, created_at
       FROM radio_drops
       WHERE timing_type = 'live_inject' AND created_at > NOW() - INTERVAL '20 seconds'
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
      };
    }
  } catch {}
  return null;
}

async function getTimelineFallback() {
  try {
    const [setsRes, settingsRes, liveDrop] = await Promise.all([
      neonQuery(`
        SELECT id, title, dj_name, audio_url, cover_url, duration, duration_sec, genre, display_order
        FROM radio_sets
        WHERE deleted_at IS NULL AND is_active = true AND processing_status = 'ready'
        ORDER BY display_order ASC, id ASC
      `),
      neonQuery(
        "SELECT broadcast_mode, active_set_id, active_started_at FROM radio_settings WHERE id = 1"
      ).catch(() => ({ rows: [] })),
      queryRecentLiveDrop(),
    ]);

    const sets = setsRes.rows || [];
    if (sets.length === 0) return null;

    const settings = settingsRes.rows[0] || {};
    const isMania = settings.broadcast_mode === "mania" && settings.active_set_id;
    const maniaIdx = isMania ? sets.findIndex((s: any) => s.id === Number(settings.active_set_id)) : -1;

    let activeIdx = 0;
    let offsetSec = 0;
    let activeMode: "autodj" | "mania" = "autodj";

    if (isMania && maniaIdx !== -1) {
      const trackDur = (sets[maniaIdx].duration_sec && sets[maniaIdx].duration_sec > 0) ? sets[maniaIdx].duration_sec : 180;
      const startedAtMs = settings.active_started_at ? new Date(settings.active_started_at).getTime() : Date.now();
      const elapsed = Math.max(0, Math.floor((Date.now() - startedAtMs) / 1000));

      if (elapsed < trackDur) {
        activeIdx = maniaIdx;
        offsetSec = elapsed;
        activeMode = "mania";
      } else {
        neonQuery("UPDATE radio_settings SET broadcast_mode = 'autodj', active_set_id = NULL, updated_at = NOW() WHERE id = 1").catch(() => {});
      }
    }

    if (activeMode === "autodj") {
      const totalDurationSec = sets.reduce((acc: number, s: any) => acc + (s.duration_sec || 180), 0);
      const nowSec = Math.floor(Date.now() / 1000);
      const cycleSec = totalDurationSec > 0 ? (nowSec % totalDurationSec) : 0;
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
    }

    const currentTrack = sets[activeIdx];
    const nextTracks = [
      sets[(activeIdx + 1) % sets.length],
      sets[(activeIdx + 2) % sets.length],
      sets[(activeIdx + 3) % sets.length],
    ].filter(Boolean);

    return {
      offline: false,
      stale: false,
      mode: activeMode,
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
  const upstreamBase = process.env.RADIO_UPSTREAM_URL;

  // If no upstream server is configured, smoothly fall back to 24/7 virtual schedule
  if (!upstreamBase || upstreamBase.trim() === "") {
    const fallback = await getTimelineFallback();
    if (fallback) {
      return NextResponse.json(fallback, {
        status: 200,
        headers: {
          "Cache-Control": "public, s-maxage=5, stale-while-revalidate=15",
        },
      });
    }

    return NextResponse.json(
      {
        offline: true,
        reason: "RADIO_UPSTREAM_URL is not configured",
        now_playing: null,
        up_next: [],
        history: [],
        stale: false,
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "public, s-maxage=5, stale-while-revalidate=15",
        },
      }
    );
  }

  const cleanBase = upstreamBase.trim().replace(/\/+$/, "");
  const timeoutMs = 3000; // Strictly 3-second upstream timeout

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
          "Cache-Control": "public, s-maxage=5, stale-while-revalidate=15",
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
          "Cache-Control": "public, s-maxage=5, stale-while-revalidate=15",
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
          "Cache-Control": "public, s-maxage=5, stale-while-revalidate=15",
        },
      }
    );
  }
}
