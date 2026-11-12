import { neonQuery } from "@/lib/supabase-db";
import { resolveCoverArt, formatTrackTitle } from "./media-helpers";
import { getActiveListenersCount } from "./listener-tracker";

export interface AuthoritativeTrack {
  id: number;
  title: string;
  artist: string;
  audio_url: string;
  cover_url: string;
  duration_sec: number;
  elapsed_sec?: number;
  time_remaining_sec?: number;
  video_id: string;
}

export interface AuthoritativePlayoutState {
  mode: "autodj" | "mania" | "live";
  playlist_id: number | null;
  playlist_name: string | null;
  loop_cycle: number;
  transition_id: string;
  current_track: AuthoritativeTrack;
  next_track: AuthoritativeTrack;
  up_next: AuthoritativeTrack[];
  upcoming_drop: {
    id: number;
    title: string;
    persona: string;
    mood: string;
    script: string;
    drop_url: string;
    target_track_id: number;
  } | null;
  active_listeners: number;
  server_timestamp: number;
}

interface PlayoutCache {
  settings: any;
  sets: any[];
  activatedAt: string | null;
  activePlaylistName: string | null;
  activePlaylistId: number | null;
  totalDurationSec: number;
  timestamp: number;
}

let _playoutDbCache: PlayoutCache | null = null;
const CACHE_TTL_MS = 3_000;

async function getCachedPlayoutDb(): Promise<PlayoutCache> {
  const now = Date.now();
  if (_playoutDbCache && now - _playoutDbCache.timestamp < CACHE_TTL_MS) {
    return _playoutDbCache;
  }

  const [playlistRes, settingsRes] = await Promise.all([
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
      "SELECT broadcast_mode, active_set_id, active_started_at, radio_enabled FROM radio_settings WHERE id = 1"
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
    const setsRes = await neonQuery(`
      SELECT id, title, dj_name, audio_url, cover_url, duration, duration_sec, genre, display_order
      FROM radio_sets
      WHERE deleted_at IS NULL AND (is_active = true OR is_active IS NULL) AND processing_status = 'ready'
      ORDER BY display_order ASC, id ASC
    `).catch(() => ({ rows: [] }));
    sets = setsRes.rows || [];
    activatedAt = null;
    activePlaylistName = null;
    activePlaylistId = null;
  }

  const normalizedSets = sets.map((s: any) => ({
    ...s,
    cover_url: resolveCoverArt(s.cover_url),
    duration_sec: (s.duration_sec && s.duration_sec > 0) ? s.duration_sec : 180,
  }));

  const totalDurationSec = normalizedSets.reduce((acc: number, s: any) => acc + s.duration_sec, 0);
  const settings = settingsRes.rows?.[0] || { broadcast_mode: "autodj" };

  _playoutDbCache = {
    settings,
    sets: normalizedSets,
    activatedAt,
    activePlaylistName,
    activePlaylistId,
    totalDurationSec,
    timestamp: now,
  };

  return _playoutDbCache;
}

export async function getAuthoritativePlayoutState(): Promise<AuthoritativePlayoutState | null> {
  const cached = await getCachedPlayoutDb();
  const { settings, sets, activatedAt, activePlaylistName, activePlaylistId, totalDurationSec } = cached;

  if (sets.length === 0 || totalDurationSec <= 0) {
    return null;
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const isMania = settings.broadcast_mode === "mania" && settings.active_set_id;
  const maniaIdx = isMania ? sets.findIndex((s: any) => s.id === Number(settings.active_set_id)) : -1;

  let activeIdx = 0;
  let offsetSec = 0;
  let activeMode: "autodj" | "mania" = "autodj";
  let loopCycle = 0;

  if (isMania) {
    let maniaTrack = maniaIdx !== -1 ? sets[maniaIdx] : null;
    if (!maniaTrack && settings.active_set_id) {
      try {
        const directSetRes = await neonQuery(
          `SELECT id, title, dj_name, audio_url, cover_url, duration_sec, genre 
           FROM radio_sets WHERE id = $1 AND deleted_at IS NULL`,
          [Number(settings.active_set_id)]
        );
        if (directSetRes.rows.length > 0) {
          maniaTrack = {
            ...directSetRes.rows[0],
            cover_url: resolveCoverArt(directSetRes.rows[0].cover_url),
            duration_sec: directSetRes.rows[0].duration_sec || 180,
          };
        }
      } catch {}
    }

    if (maniaTrack) {
      const trackDur = maniaTrack.duration_sec || 180;
      const startedAtMs = settings.active_started_at ? new Date(settings.active_started_at).getTime() : Date.now();
      const elapsed = Math.max(0, Math.floor((Date.now() - startedAtMs) / 1000));

      if (elapsed < trackDur) {
        activeMode = "mania";
        offsetSec = elapsed;
        activeIdx = maniaIdx !== -1 ? maniaIdx : 0;
      } else {
        // Track completed: auto-advance
        const endedIdx = sets.findIndex((s: any) => s.id === maniaTrack.id);
        activeIdx = endedIdx !== -1 ? (endedIdx + 1) % sets.length : 0;
        offsetSec = Math.max(0, Math.min(20, elapsed - trackDur));
        activeMode = "autodj";
        neonQuery("UPDATE radio_settings SET broadcast_mode = 'autodj', active_set_id = NULL, updated_at = NOW() WHERE id = 1").catch(() => {});
      }
    }
  }

  if (activeMode === "autodj") {
    let cycleSec = 0;
    if (activatedAt) {
      const activatedAtSec = Math.floor(new Date(activatedAt).getTime() / 1000);
      const elapsedSinceActivation = Math.max(0, nowSec - activatedAtSec);
      cycleSec = totalDurationSec > 0 ? (elapsedSinceActivation % totalDurationSec) : 0;
      loopCycle = totalDurationSec > 0 ? Math.floor(elapsedSinceActivation / totalDurationSec) : 0;
    } else {
      cycleSec = totalDurationSec > 0 ? (nowSec % totalDurationSec) : 0;
      loopCycle = totalDurationSec > 0 ? Math.floor(nowSec / totalDurationSec) : 0;
    }

    let cumulative = 0;
    for (let i = 0; i < sets.length; i++) {
      const dur = sets[i].duration_sec;
      if (cumulative + dur > cycleSec) {
        activeIdx = i;
        offsetSec = cycleSec - cumulative;
        break;
      }
      cumulative += dur;
    }
  }

  const currentRaw = sets[activeIdx] || sets[0];
  const nextIdx = (activeIdx + 1) % sets.length;
  const nextRaw = sets[nextIdx];

  const currentTrack: AuthoritativeTrack = {
    id: currentRaw.id,
    title: formatTrackTitle(currentRaw.title),
    artist: currentRaw.dj_name,
    audio_url: currentRaw.audio_url,
    cover_url: currentRaw.cover_url,
    duration_sec: currentRaw.duration_sec,
    elapsed_sec: offsetSec,
    time_remaining_sec: Math.max(0, currentRaw.duration_sec - offsetSec),
    video_id: `set-${currentRaw.id}`,
  };

  const nextTrack: AuthoritativeTrack = {
    id: nextRaw.id,
    title: formatTrackTitle(nextRaw.title),
    artist: nextRaw.dj_name,
    audio_url: nextRaw.audio_url,
    cover_url: nextRaw.cover_url,
    duration_sec: nextRaw.duration_sec,
    video_id: `set-${nextRaw.id}`,
  };

  const upNext: AuthoritativeTrack[] = [
    nextTrack,
    sets[(nextIdx + 1) % sets.length],
    sets[(nextIdx + 2) % sets.length],
  ].filter(Boolean).map((t: any) => ({
    id: t.id,
    title: formatTrackTitle(t.title),
    artist: t.dj_name,
    audio_url: t.audio_url,
    cover_url: t.cover_url,
    duration_sec: t.duration_sec,
    video_id: `set-${t.id}`,
  }));

  const playlistScope = activePlaylistId ? `pl_${activePlaylistId}` : "catalog";
  const transitionId = `${playlistScope}:loop_${loopCycle}:trk_${currentTrack.id}->trk_${nextTrack.id}`;

  // Fetch upcoming ready drop for next track
  let upcomingDrop = null;
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
      upcomingDrop = dropRes.rows[0];
    }
  } catch {}

  const activeListeners = await getActiveListenersCount();

  return {
    mode: activeMode,
    playlist_id: activePlaylistId,
    playlist_name: activePlaylistName,
    loop_cycle: loopCycle,
    transition_id: transitionId,
    current_track: currentTrack,
    next_track: nextTrack,
    up_next: upNext,
    upcoming_drop: upcomingDrop,
    active_listeners: activeListeners,
    server_timestamp: nowSec,
  };
}
