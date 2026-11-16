import { NextResponse } from "next/server";
import { neonQuery } from "@/lib/supabase-db";
import { formatTrackTitle } from "@/lib/radio/media-helpers";
import { getActiveListenersCount } from "@/lib/radio/listener-tracker";
import { withPlayback } from "@/lib/radio/playback";

export const dynamic = "force-dynamic";

interface LiveCachedState {
  nowPlaying: any;
  upNext: any[];
  history: any[];
  ts: number;
}

import { getPlayoutCache, setPlayoutCache, type RadioPlayoutDbCache } from "@/lib/radio/playout-cache";

let _cachedLiveState: LiveCachedState | null = null;
const PLAYOUT_CACHE_TTL_MS = 5_000; // 5 seconds (fast response for track skips and mode changes)

// 2.5-second instance cache for live-drop broadcast check (stays within 2-3s delivery window)
interface LiveDropCache {
  drop: any | null;
  timestamp: number;
}

let _liveDropCache: LiveDropCache | null = null;
const LIVE_DROP_CACHE_TTL_MS = 2_500; // 2.5 seconds

async function queryRecentLiveDrop() {
  try {
    const dropRes = await neonQuery(
      `SELECT id, persona, mood, title, script, audio_url, created_at,
              ROUND(EXTRACT(EPOCH FROM (NOW() - created_at))) as age_seconds
       FROM radio_drops
       WHERE timing_type IN ('live_inject', 'live_drop')
         AND audio_url IS NOT NULL
         AND audio_url NOT LIKE 'blob:%'
         AND created_at > NOW() - INTERVAL '90 seconds'
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

async function getCachedRecentLiveDrop() {
  const now = Date.now();
  if (_liveDropCache && now - _liveDropCache.timestamp < LIVE_DROP_CACHE_TTL_MS) {
    return _liveDropCache.drop;
  }
  const drop = await queryRecentLiveDrop();
  _liveDropCache = { drop, timestamp: now };
  return drop;
}

async function getLiveSlotOnAir() {
  try {
    const res = await neonQuery(`
      SELECT s.id AS slot_id, s.starts_at, s.ends_at,
             sh.id AS show_id, sh.title AS show_title, sh.slug AS show_slug,
             p.id AS presenter_id,
             COALESCE(sub.dj_name, p.dj_name) AS on_air_dj_name,
             COALESCE(sub.slug, p.slug) AS on_air_dj_slug
      FROM show_slots s
      JOIN shows sh ON s.show_id = sh.id
      JOIN presenters p ON s.presenter_id = p.id
      LEFT JOIN presenters sub ON s.substitute_presenter_id = sub.id
      WHERE s.status = 'live'
      LIMIT 1;
    `);
    if (res.rows.length > 0) {
      const r = res.rows[0];
      return {
        slot_id: r.slot_id,
        show: { id: r.show_id, title: r.show_title, slug: r.show_slug },
        presenter: { id: r.presenter_id, dj_name: r.on_air_dj_name, slug: r.on_air_dj_slug },
        starts_at: r.starts_at,
        ends_at: r.ends_at,
        is_live: true,
      };
    }
  } catch {}
  return null;
}

async function getCachedPlayoutData(): Promise<RadioPlayoutDbCache> {
  const now = Date.now();
  const cached = getPlayoutCache();
  if (cached && now - cached.timestamp < PLAYOUT_CACHE_TTL_MS) {
    return cached;
  }

  // Combined single query round: fetch settings and active playlist in parallel
  const [playlistRes, settingsRes] = await Promise.all([
    neonQuery(`
      SELECT p.id as playlist_id, p.name as playlist_name, p.activated_at,
             s.id, s.title, s.dj_name, s.audio_url, s.r2_key, s.cover_url, s.duration, s.duration_sec, s.genre, pt.position
      FROM radio_playlists p
      JOIN radio_playlist_tracks pt ON pt.playlist_id = p.id
      JOIN radio_sets s ON s.id = pt.track_id AND s.deleted_at IS NULL AND (s.is_active = true OR s.is_active IS NULL)
      WHERE p.is_broadcast_active = true AND p.deleted_at IS NULL
      ORDER BY pt.position ASC, pt.id ASC
    `).catch(() => ({ rows: [] })),
    neonQuery(
      "SELECT broadcast_mode, active_set_id, active_started_at, queued_next_set_id, ai_drops_enabled, live_title, live_stream_url FROM radio_settings WHERE id = 1"
    ).catch(() => ({ rows: [] })),
  ]);

  let sets: any[] = [];
  let activatedAt: string | null = null;
  let activePlaylistName: string | null = null;
  let activePlaylistId: number | null = null;

  if (playlistRes.rows.length > 0) {
    sets = playlistRes.rows;
    activatedAt = playlistRes.rows[0].activated_at;
    activePlaylistName = playlistRes.rows[0].playlist_name;
    activePlaylistId = playlistRes.rows[0].playlist_id;
  } else {
    // Full Catalog AutoDJ rotation across all library tracks (no playlist locked)
    const setsRes = await neonQuery(`
      SELECT id, title, dj_name, audio_url, r2_key, cover_url, duration, duration_sec, genre, display_order
      FROM radio_sets
      WHERE deleted_at IS NULL AND (is_active = true OR is_active IS NULL) AND processing_status = 'ready'
      ORDER BY display_order ASC, id ASC
    `).catch(() => ({ rows: [] }));
    sets = setsRes.rows || [];
    activatedAt = null;
    activePlaylistName = null;
    activePlaylistId = null;
  }

  const settings = settingsRes.rows[0] || {};
  const freshCache: RadioPlayoutDbCache = {
    settings,
    sets,
    activatedAt,
    activePlaylistName,
    activePlaylistId,
    timestamp: now,
  };
  setPlayoutCache(freshCache);
  return freshCache;
}

async function getTimelineFallback() {
  try {
    const [cachedPlayout, liveDrop] = await Promise.all([
      getCachedPlayoutData(),
      getCachedRecentLiveDrop(),
    ]);

    const { sets, activatedAt, activePlaylistName, activePlaylistId, settings } = cachedPlayout;
    if (sets.length === 0) return null;
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

    const queuedId = settings.queued_next_set_id ? Number(settings.queued_next_set_id) : null;
    if (queuedId) {
      if (currentTrack && currentTrack.id === queuedId) {
        // Queued track is currently on air! Clear queued_next_set_id
        neonQuery("UPDATE radio_settings SET queued_next_set_id = NULL WHERE id = 1").catch(() => {});
      } else {
        // Force queued track to be #1 in Up Next
        let queuedTrack = sets.find((s: any) => s.id === queuedId);
        if (!queuedTrack) {
          try {
            const qRes = await neonQuery(
              "SELECT id, title, dj_name, audio_url, r2_key, cover_url, duration, duration_sec, genre FROM radio_sets WHERE id = $1 AND deleted_at IS NULL",
              [queuedId]
            );
            if (qRes.rows.length > 0) queuedTrack = qRes.rows[0];
          } catch {}
        }
        if (queuedTrack) {
          nextTracks = [queuedTrack, ...nextTracks.filter((s: any) => s.id !== queuedId)].slice(0, 3);
        }
      }
    }

    if (!currentTrack) return null;

    const activeListeners = await getActiveListenersCount();

    return {
      offline: false,
      stale: false,
      mode: activeMode,
      playlist_id: activePlaylistId,
      playlist_name: activePlaylistName,
      listeners_count: activeListeners,
      now_playing: withPlayback(
        {
          id: currentTrack.id,
          title: formatTrackTitle(currentTrack.title),
          artist: currentTrack.dj_name,
          thumbnail: currentTrack.cover_url,
          elapsed: offsetSec,
          duration: currentTrack.duration_sec || 180,
          audio_url: currentTrack.audio_url,
          r2_key: currentTrack.r2_key,
          video_id: `set-${currentTrack.id}`,
          listeners: {
            total: activeListeners,
            unique: activeListeners,
          },
        },
        "track"
      ),
      up_next: nextTracks.map((t: any) =>
        withPlayback(
          {
            id: t.id,
            video_id: `set-${t.id}`,
            title: formatTrackTitle(t.title),
            artist: t.dj_name,
            duration: t.duration_sec || 180,
            duration_sec: t.duration_sec || 180,
            thumbnail: t.cover_url,
            audio_url: t.audio_url,
            r2_key: t.r2_key,
          },
          "track"
        )
      ),
      history: [],
      live_drop: liveDrop ? withPlayback(liveDrop, "drop") : null,
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

  // 1. Get playout data from instance cache (combines settings & playlist queries in a 30s cache)
  const cachedPlayout = await getCachedPlayoutData();
  const broadcastMode = cachedPlayout.settings.broadcast_mode || "autodj";

  // 2. If station is in autodj or mania mode, Cloudflare R2 virtual timeline is the primary playout
  if (broadcastMode !== "live") {
    const fallback = await getTimelineFallback();
    if (fallback) {
      return NextResponse.json(fallback, {
        status: 200,
        headers: {
          "Cache-Control": "public, s-maxage=3, max-age=0, must-revalidate",
        },
      });
    }

    return NextResponse.json(
      {
        offline: true,
        reason: "No active radio sets available",
        listeners_count: 0,
        now_playing: null,
        up_next: [],
        history: [],
        stale: false,
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "public, s-maxage=3, max-age=0, must-revalidate",
        },
      }
    );
  }

  // 3. Station is in explicit live stage mode: query upstream relay with resilient timeout
  const cleanBase = upstreamBase ? upstreamBase.replace(/\/+$/, "") : null;
  const timeoutMs = 3000;
  const onAirSlot = await getLiveSlotOnAir();
  const streamUrl = process.env.RADIO_STREAM_URL?.trim() || "https://dj.darajadigital.com/hls/stream.m3u8";
  const liveTitle = cachedPlayout.settings.live_title || "GOODLIFE RADIO LIVE - ON AIR TAKEOVER";
  const defaultArtist = onAirSlot?.presenter?.dj_name || "ADMIN MASTER HARBOR / LIVE DJ";
  const defaultTitle = onAirSlot?.show?.title || liveTitle;

  try {
    let nowPlaying: any = null;
    let upNext: any[] = [];
    let history: any[] = [];

    if (cleanBase) {
      const [nowResult, nextResult, histResult] = await Promise.allSettled([
        fetchWithTimeout(`${cleanBase}/api/now-playing`, timeoutMs),
        fetchWithTimeout(`${cleanBase}/api/up-next`, timeoutMs),
        fetchWithTimeout(`${cleanBase}/api/history`, timeoutMs),
      ]);

      if (nowResult.status === "fulfilled" && nowResult.value.ok) {
        nowPlaying = await nowResult.value.json().catch(() => null);
      }

      if (nextResult.status === "fulfilled" && nextResult.value.ok) {
        upNext = await nextResult.value.json().catch(() => []);
      }

      if (histResult.status === "fulfilled" && histResult.value.ok) {
        history = await histResult.value.json().catch(() => []);
      }
    }

    const liveDrop = await queryRecentLiveDrop();

    if (!nowPlaying || !nowPlaying.title) {
      nowPlaying = {
        title: defaultTitle,
        artist: defaultArtist,
        is_live: true,
        state: "live",
        duration: 0,
        elapsed: 0,
      };
    } else {
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

    const activeListeners = await getActiveListenersCount();
    if (liveData.nowPlaying) {
      if (!liveData.nowPlaying.listeners) {
        liveData.nowPlaying.listeners = {
          total: activeListeners,
          unique: activeListeners,
        };
      }
      if (onAirSlot) {
        liveData.nowPlaying.on_air_slot = onAirSlot;
        liveData.nowPlaying.title = onAirSlot.show.title;
        liveData.nowPlaying.artist = onAirSlot.presenter.dj_name;
      }
      liveData.nowPlaying.is_live = true;
      liveData.nowPlaying.audio_url = streamUrl;
      liveData.nowPlaying.playback_url = streamUrl;
    }

    return NextResponse.json(
      {
        mode: "live",
        offline: false,
        stale: false,
        listeners_count: activeListeners,
        on_air_slot: onAirSlot,
        now_playing: liveData.nowPlaying,
        up_next: liveData.upNext,
        history: liveData.history,
        live: {
          stream_url: streamUrl,
          title: onAirSlot ? onAirSlot.show.title : liveTitle,
          is_live: true,
        },
        stream_url: streamUrl,
        live_drop: liveDrop ? withPlayback(liveDrop, "drop") : null,
        target_duration_sec: 2.0,
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "public, s-maxage=3, max-age=0, must-revalidate",
        },
      }
    );
  } catch (err: any) {
    console.warn("[api/radio/live] Upstream fetch failed or timed out:", err?.message || err);

    const activeListeners = await getActiveListenersCount();

    // In live mode, NEVER fall back to AutoDJ while radio_settings says 'live'
    return NextResponse.json(
      {
        mode: "live",
        offline: false,
        stale: true,
        listeners_count: activeListeners,
        on_air_slot: onAirSlot,
        now_playing: {
          title: defaultTitle,
          artist: defaultArtist,
          is_live: true,
          state: "live",
          duration: 0,
          elapsed: 0,
          audio_url: streamUrl,
          playback_url: streamUrl,
        },
        up_next: _cachedLiveState?.upNext || [],
        history: _cachedLiveState?.history || [],
        live: {
          stream_url: streamUrl,
          title: defaultTitle,
          is_live: true,
        },
        stream_url: streamUrl,
        target_duration_sec: 2.0,
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "public, s-maxage=3, max-age=0, must-revalidate",
        },
      }
    );
  }
}
