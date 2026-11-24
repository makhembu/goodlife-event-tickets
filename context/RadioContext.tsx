"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import { usePathname } from "next/navigation";
import {
  RadioSet,
  RadioPublicState,
  AudioQuality,
  BroadcastMode,
  RadioDrop,
  LiveNowPlayingTrack,
  LiveQueueItem,
  LiveHistoryItem,
  RadioLiveBffResponse,
} from "@/lib/radio/types";
import {
  RadioEngineState,
  RADIO_TIMING,
  computeRadioTiming,
  DEFAULT_TARGET_DURATION_SEC,
} from "@/lib/radio/config";
import {
  resolveCoverArt,
  formatTrackTitle,
  buildSongSearchUrls,
  SongSearchLink,
} from "@/lib/radio/media-helpers";
import { resolveLiveStreamUrl } from "@/lib/radio/bitrate";

const LIVE_EXIT_MS = 10_000;
const MODE_FRESH_MS = 15_000;

function areSameAudioSrc(a?: string | null, b?: string | null): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  if (typeof window === "undefined") return a === b;
  try {
    const urlA = new URL(a, window.location.href).href;
    const urlB = new URL(b, window.location.href).href;
    return urlA === urlB;
  } catch {
    return a === b;
  }
}

const loadPolicy = (ttfb: number, total: number, timeoutRetries: number, errorRetries: number) => ({
  default: {
    maxTimeToFirstByteMs: ttfb,
    maxLoadTimeMs: total,
    timeoutRetry: { maxNumRetry: timeoutRetries, retryDelayMs: 0, maxRetryDelayMs: 0 },
    errorRetry: { maxNumRetry: errorRetries, retryDelayMs: 1000, maxRetryDelayMs: 8000 },
  },
});

// Tuned for immediate live playback & low startup latency on Android (hls.js)
const LIVE_HLS_CONFIG: any = {
  lowLatencyMode: false,
  enableWorker: true,
  liveSyncDurationCount: 3,          // Resilient 3-segment live edge depth
  liveMaxLatencyDurationCount: 6,    // Prevents lagging too far behind
  maxBufferLength: 10,               // 10s is responsive yet safe on 3G/4G
  maxMaxBufferLength: 20,
  backBufferLength: 10,
  maxBufferHole: 0.5,
  nudgeMaxRetry: 10,
  manifestLoadPolicy: loadPolicy(4000, 10000, 3, 4),
  levelLoadPolicy: loadPolicy(4000, 10000, 3, 4),
  fragLoadPolicy: loadPolicy(5000, 15000, 3, 4),
};

function shouldUseNativeHls(audio: HTMLAudioElement) {
  if (!audio.canPlayType("application/vnd.apple.mpegurl")) return false;
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return (
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1) ||
    /^((?!chrome|android).)*safari/i.test(ua)
  );
}

export interface ActivePlaylist {
  id: number;
  name: string;
  slug?: string;
  description?: string;
  cover_url?: string;
  genre?: string;
  trackIndex: number;
  tracks: RadioSet[];
}

export interface RadioContextType {
  // Playback engine state machine
  engineState: RadioEngineState;
  isPlaying: boolean;
  isLive: boolean;
  broadcastMode: BroadcastMode;
  statusText: string;

  // Track metadata (honest, derived from real stream/endpoints)
  title: string;
  artist: string | null;
  coverUrl: string;
  thought: string | null;
  daypart: string | null;
  elapsed: number;
  duration: number;
  currentTime: number;
  progress: number;
  progressPercent: number;
  hasValidProgress: boolean;
  searchLinks: SongSearchLink[];

  // Real queue and history
  queue: RadioSet[];
  upNext: LiveQueueItem[];
  history: LiveHistoryItem[];
  streamTargetDurationSec: number;
  isStale: boolean;

  // Audio controls & settings
  volume: number;
  isMuted: boolean;
  isMinimized: boolean;
  quality: AudioQuality;
  radioEnabled: boolean;
  backupSets: RadioSet[];
  currentSet: RadioSet | null;
  isSyncedToBroadcast: boolean;
  liveTitle: string;
  liveDropFallback: boolean;
  hasLoaded: boolean;
  activeDropTitle: string | null;
  activePersona: string | null;
  activeMood: string | null;
  isDropPlaying: boolean;
  isDropUnlocked?: boolean;
  onAirSlot: any | null;

  // Curated Playlist support
  activePlaylist: ActivePlaylist | null;

  // User Actions
  togglePlay: () => void;
  unlockStationVoice?: () => Promise<void>;
  retry: () => void;
  toggleMute: () => void;
  setVolume: (v: number) => void;
  toggleMinimized: () => void;
  switchQuality: (q: AudioQuality) => void;
  switchToLive: () => void;
  switchToCurated: () => void;
  playSet: (set: RadioSet) => void;
  playPlaylist: (playlistId: number, startTrackIndex?: number) => Promise<void>;
  snapToBroadcast: () => void;
  nextTrack: () => void;
  prevTrack: () => void;
  seek: (percent: number) => void;
  airLiveDrop: (dropData: {
    audioUrl: string;
    title: string;
    persona?: string;
    script?: string;
    playLocal?: boolean;
  }) => Promise<boolean>;
  setManualDucking: (ducked: boolean) => void;
  fetchRadioState: () => Promise<void>;
  fetchRadioLive: () => Promise<void>;
  playImmediateBroadcastTrack: (track: { id: number; title: string; dj_name?: string; audio_url: string; duration_sec?: number; cover_url?: string }) => void;
}

// Safe inert default state returned when radio is disabled, unconfigured, or outside provider.
// Guarantees useRadio() NEVER throws, preventing any other page on the site from crashing.
export const INERT_RADIO_STATE: RadioContextType = {
  engineState: "offline",
  isPlaying: false,
  isLive: true,
  broadcastMode: "autodj",
  statusText: "Offline",
  title: "Station Rotation Active",
  artist: null,
  coverUrl: "/flyer.png",
  thought: null,
  daypart: null,
  elapsed: 0,
  duration: 0,
  currentTime: 0,
  progress: 0,
  progressPercent: 0,
  hasValidProgress: false,
  searchLinks: [],
  queue: [],
  upNext: [],
  history: [],
  streamTargetDurationSec: DEFAULT_TARGET_DURATION_SEC,
  isStale: false,
  volume: 1,
  isMuted: false,
  isMinimized: true,
  quality: "standard",
  radioEnabled: false,
  backupSets: [],
  currentSet: null,
  isSyncedToBroadcast: false,
  liveTitle: "Station Rotation Active",
  liveDropFallback: false,
  hasLoaded: true,
  activeDropTitle: null,
  activePersona: null,
  activeMood: null,
  isDropPlaying: false,
  isDropUnlocked: true,
  onAirSlot: null,
  activePlaylist: null,
  togglePlay: () => {},
  unlockStationVoice: async () => {},
  retry: () => {},
  toggleMute: () => {},
  setVolume: () => {},
  toggleMinimized: () => {},
  switchQuality: () => {},
  switchToLive: () => {},
  switchToCurated: () => {},
  playSet: () => {},
  playPlaylist: async () => {},
  snapToBroadcast: () => {},
  nextTrack: () => {},
  prevTrack: () => {},
  seek: () => {},
  airLiveDrop: async () => false,
  setManualDucking: () => {},
  fetchRadioState: async () => {},
  fetchRadioLive: async () => {},
  playImmediateBroadcastTrack: () => {},
};

const RadioContext = createContext<RadioContextType | null>(null);

const STORAGE_KEY = "gl_radio_state";
const QUALITY_KEY = "gl_audio_quality";
const CACHED_SETS_KEY = "gl_radio_cached_sets";
// All drops are dynamic, loaded from Neon DB or stream live-injected events
const DEFAULT_STATION_DROPS: RadioDrop[] = [];

const SILENT_WAV_DATA_URI =
  "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA";


import { computeLiveTimeline as computeLiveTimelineCore } from "@/lib/radio/timeline";

export function computeLiveTimeline(setsList: RadioSet[]): { index: number; offsetSec: number } {
  return computeLiveTimelineCore(setsList);
}

/**
 * Safely seeks an HTMLAudioElement to a target live offset.
 * In HTML5, setting currentTime while readyState === HAVE_NOTHING (0) is ignored
 * by the browser and resets to 0. This helper listens for loadedmetadata / canplay
 * to ensure the seek is applied as soon as the media timeline is ready, with
 * fallback verification shortly after play begins.
 */
function safeSeekAudio(audio: HTMLAudioElement, targetOffset: number, onSeekApplied?: (appliedOffset: number) => void) {
  if (targetOffset <= 0) return;

  let seekApplied = false;
  const applySeek = () => {
    if (seekApplied) return;
    try {
      const dur = audio.duration;
      if (dur && !isNaN(dur) && dur > 2) {
        if (targetOffset >= dur - 2) {
          // If target offset is at or past the end of the file, clamp near the end so the track concludes and transitions naturally to next track
          const clamped = Math.max(0, Math.floor(dur) - 2);
          audio.currentTime = clamped;
          seekApplied = true;
          onSeekApplied?.(clamped);
          return;
        }
        audio.currentTime = Math.max(0, targetOffset);
        seekApplied = true;
        onSeekApplied?.(Math.max(0, targetOffset));
      }
    } catch (e) {
      console.warn("[RadioContext] safeSeekAudio error:", e);
    }
  };

  if (audio.readyState >= 1) {
    applySeek();
  } else {
    const onReady = () => {
      audio.removeEventListener("loadedmetadata", onReady);
      audio.removeEventListener("canplay", onReady);
      applySeek();
    };
    audio.addEventListener("loadedmetadata", onReady, { once: true });
    audio.addEventListener("canplay", onReady, { once: true });
  }
}

function isPlayableAudioUrl(url?: string | null): boolean {
  if (!url || typeof url !== "string") return false;
  const clean = url.trim().toLowerCase();
  if (clean === "" || clean.startsWith("data:") || clean.includes("youtube.com") || clean.includes("youtu.be")) {
    return false;
  }
  return true;
}

function resolveAudioSource(track?: { playback_url?: string; audio_url?: string; id?: number | string; [key: string]: any } | null): string | null {
  if (!track) return null;
  if (isPlayableAudioUrl(track.playback_url)) return track.playback_url!;
  if (isPlayableAudioUrl(track.audio_url)) return track.audio_url!;
  // If track has an id, fallback to the authenticated audio playback endpoint
  const rawId = String(track.id || "").replace(/^(set-|vault-|pl-\d+-)/, "");
  const numId = parseInt(rawId, 10);
  if (Number.isFinite(numId) && numId > 0) {
    return `/api/radio/audio/track/${numId}`;
  }
  return null;
}

export function RadioProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // Runtime kill switch & configuration
  const [radioEnabled, setRadioEnabled] = useState(true);
  const [liveStreamUrl, setLiveStreamUrl] = useState<string>(
    process.env.NEXT_PUBLIC_RADIO_STREAM_URL || "https://dj.darajadigital.com/hls/stream.m3u8"
  );
  const [broadcastMode, setBroadcastMode] = useState<BroadcastMode>("autodj");
  const broadcastModeRef = useRef<BroadcastMode>("autodj");
  broadcastModeRef.current = broadcastMode;

  // Playback Engine State Machine
  const [engineState, setEngineState] = useState<RadioEngineState>("idle");
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLive, setIsLive] = useState(true);

  // Real-time listener session ID for active playout telemetry
  const listenerSessionIdRef = useRef<string>("");
  useEffect(() => {
    try {
      let sid = sessionStorage.getItem("gl_radio_session_id");
      if (!sid) {
        sid = "gl_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 9);
        sessionStorage.setItem("gl_radio_session_id", sid);
      }
      listenerSessionIdRef.current = sid;
    } catch {
      listenerSessionIdRef.current = "gl_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 9);
    }
  }, []);

  // Heartbeat loop while user is actively streaming
  useEffect(() => {
    if (!isPlaying) return;

    const ping = () => {
      const sid = listenerSessionIdRef.current;
      if (!sid) return;
      const tz = typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : null;
      fetch("/api/radio/heartbeat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: sid, action: "ping", client: "listener", tz }),
        keepalive: true,
      }).catch(() => {});
    };

    ping();
    // 28s ping cadence comfortably stays within the 60s active threshold while cutting pings by ~35%
    const interval = setInterval(ping, 28000);

    return () => {
      clearInterval(interval);
      const sid = listenerSessionIdRef.current;
      if (sid && typeof navigator !== "undefined" && navigator.sendBeacon) {
        navigator.sendBeacon(
          "/api/radio/heartbeat",
          JSON.stringify({ sessionId: sid, action: "leave", client: "listener" })
        );
      }
    };
  }, [isPlaying]);

  // Real stream metadata
  const [nowPlayingTrack, setNowPlayingTrack] = useState<LiveNowPlayingTrack | null>(null);
  const [upNextQueue, setUpNextQueue] = useState<LiveQueueItem[]>([]);
  const [historyList, setHistoryList] = useState<LiveHistoryItem[]>([]);
  const [isStale, setIsStale] = useState(false);
  const [targetDurationSec, setTargetDurationSec] = useState<number>(DEFAULT_TARGET_DURATION_SEC);

  // Audio settings
  const [volume, setVolumeState] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isMinimized, setIsMinimized] = useState(true);
  const [quality, setQuality] = useState<AudioQuality>("standard");
  const [onAirSlot, setOnAirSlot] = useState<any | null>(null);

  // Backup sets & vault
  const [backupSets, setBackupSets] = useState<RadioSet[]>([]);
  const [currentBackupIndex, setCurrentBackupIndex] = useState(0);
  const [hasLoaded, setHasLoaded] = useState(false);

  // Active Curated Playlist State
  const [activePlaylist, setActivePlaylist] = useState<ActivePlaylist | null>(null);
  const activePlaylistRef = useRef<ActivePlaylist | null>(null);
  activePlaylistRef.current = activePlaylist;
  const currentBroadcastPlaylistNameRef = useRef<string | null>(null);
  const currentBroadcastPlaylistIdRef = useRef<number | null>(null);
  // Station Drops Playout State
  const [isDropPlaying, setIsDropPlaying] = useState(false);
  const [activeDropTitle, setActiveDropTitle] = useState<string | null>(null);
  const [activePersona, setActivePersona] = useState<string | null>(null);
  const [activeMood, setActiveMood] = useState<string | null>(null);
  const availableDropsRef = useRef<RadioDrop[]>([]);
  const aiDropsEnabledRef = useRef<boolean>(true);
  const dropUnlockedRef = useRef<boolean>(false);
  const [isDropUnlocked, setIsDropUnlocked] = useState<boolean>(true);
  const firedDropIdsRef = useRef<Set<string | number>>(new Set());
  const firedLiveDropIdsRef = useRef<Set<string | number>>(new Set());
  const currentDropIndexRef = useRef<number>(0);
  const isDropPlayingRef = useRef(false);
  useEffect(() => {
    isDropPlayingRef.current = isDropPlaying;
  }, [isDropPlaying]);
  const lastPrefetchedTrackKeyRef = useRef<string | null>(null);
  const isPrefetchingDropRef = useRef<boolean>(false);
  const hasFiredOutroDropRef = useRef<boolean>(false);
  const swellIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const triggerOutroDropCrossoverRef = useRef<() => void>(() => {});
  const lastLiveDropIdRef = useRef<string | number | null>(null);
  const lastDropPlayedTimestampRef = useRef<number>(0);
  const isTransitioningRef = useRef<boolean>(false);
  const isGeneratingDropRef = useRef<boolean>(false);
  const lastManualSwitchAtRef = useRef<number>(0);

  // Dual-Cadence & Multi-Drop Stacking Tracking (every 2 tracks + every 15 minutes)
  const tracksSinceLastDropRef = useRef<number>(0);
  const lastClockDropTimestampRef = useRef<number>(Date.now());
  const dropAudioQueueRef = useRef<RadioDrop[]>([]);


  // Smooth local progress interpolation anchored at poll time
  const [interpolatedElapsed, setInterpolatedElapsed] = useState(0);
  const lastPollElapsedRef = useRef(0);
  const lastPollTimestampRef = useRef(0);

  // Refs for audio elements and HLS engine
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const preloadAudioRef = useRef<HTMLAudioElement | null>(null); // Dual-deck standby & crossfader audio element
  const dropAudioRef = useRef<HTMLAudioElement | null>(null);
  const hlsRef = useRef<any>(null);
  const broadcastChannelRef = useRef<BroadcastChannel | null>(null);

  // Dual-deck broadcast engine & smooth crossfader state
  const activeDeckRef = useRef<"A" | "B">("A");
  const isCrossfadingRef = useRef(false);
  const crossfadeTimerRef = useRef<NodeJS.Timeout | null>(null);
  const hasFiredAutoDjCrossfadeRef = useRef(false);
  const executeCrossfadeRef = useRef<any>(null);

  // Stale-stream and stall detection refs
  const timingConfigRef = useRef(RADIO_TIMING);
  const stallTimerRef = useRef<NodeJS.Timeout | null>(null);
  const stallWatchdogRef = useRef<NodeJS.Timeout | null>(null);
  const stallNudgeCountRef = useRef<number>(0);
  const hasStartedPlayingRef = useRef<{ A: boolean; B: boolean }>({ A: false, B: false });
  const trackLoadTimingRef = useRef<{
    deck: "A" | "B";
    src: string;
    targetSeek: number;
    srcSetAt: number;
    loadedMetadataAt: number | null;
    canPlayAt: number | null;
    playingAt: number | null;
    nudges: number;
  } | null>(null);
  const waitingDebounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const backupProbeTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastBufferTimeRef = useRef<number>(0);
  const lastPlaybackTimeRef = useRef<number>(0);
  const mediaRecoverCooldownRef = useRef<number>(0);
  // Measured latency dynamically updated by hls.latency in real browser; initialized to target-duration fallback estimate
  const measuredLatencyRef = useRef<number>(timingConfigRef.current.estimatedFallbackLatencySec);

  // Polling and backoff refs
  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);
  const pollBackoffMsRef = useRef<number>(10_000);
  const isPollingRef = useRef<boolean>(false);
  const stalePollCountRef = useRef<number>(0);

  // Beacon / Stats refs
  const currentTrackIdRef = useRef<string>("");
  const secondsListenedRef = useRef<number>(0);
  const hasSentBeaconRef = useRef<boolean>(false);
  const lastStateSaveRef = useRef<number>(0);

  // Mutable refs for MediaSession and event callbacks
  const isPlayingRef = useRef(isPlaying);
  isPlayingRef.current = isPlaying;
  const engineStateRef = useRef(engineState);
  engineStateRef.current = engineState;

  useEffect(() => {
    console.log("[Radio:StateTransition]", {
      engineState,
      broadcastMode,
      isPlaying,
      liveActive: liveActiveRef.current,
      deck: activeDeckRef.current,
      timestamp: new Date().toISOString(),
    });
  }, [engineState, broadcastMode, isPlaying]);
  const liveStreamUrlRef = useRef(liveStreamUrl);
  liveStreamUrlRef.current = liveStreamUrl;
  const radioEnabledRef = useRef(radioEnabled);
  radioEnabledRef.current = radioEnabled;
  const isLiveRef = useRef(isLive);
  isLiveRef.current = isLive;
  const qualityRef = useRef(quality);
  qualityRef.current = quality;
  const onAirSlotRef = useRef(onAirSlot);
  onAirSlotRef.current = onAirSlot;
  const isSyncedRef = useRef(true);
  const nowPlayingTrackRef = useRef(nowPlayingTrack);
  nowPlayingTrackRef.current = nowPlayingTrack;
  const backupSetsRef = useRef(backupSets);
  backupSetsRef.current = backupSets;
  const isMutedRef = useRef(isMuted);
  isMutedRef.current = isMuted;
  const volumeRef = useRef(volume);
  volumeRef.current = volume;

  const modeFreshAtRef = useRef(0);
  const modeProbeRef = useRef<Promise<void> | null>(null);
  const nonLiveSinceRef = useRef(0);
  const liveSinceRef = useRef<number | null>(null);
  const liveActiveRef = useRef(false);
  const liveAttachGenRef = useRef(0);
  const isReattachingRef = useRef(false);
  const liveRetryTimerRef = useRef<NodeJS.Timeout | null>(null);
  const liveWatchdogRef = useRef<NodeJS.Timeout | null>(null);
  const liveRebuildCountRef = useRef(0);
  const liveLastTimeRef = useRef(0);
  const liveLastProgressAtRef = useRef(0);
  const liveNetRetriesRef = useRef(0);
  const liveMediaRetriesRef = useRef(0);
  const recoverLiveRef = useRef<(reason: string) => void>(() => {});
  const attachLiveRef = useRef<(o?: { force?: boolean; isRecovery?: boolean; isModeSwitch?: boolean }) => Promise<void>>(async () => {});
  const startBackupMixRef = useRef<() => void>(() => {});

  const applyMode = useCallback((m: BroadcastMode) => {
    const prev = broadcastModeRef.current;
    if (prev !== m) {
      console.log("[Radio:ModeChange]", { from: prev, to: m, timestamp: new Date().toISOString() });
    }
    broadcastModeRef.current = m;
    setBroadcastMode(m);
  }, []);
  const isModeFresh = useCallback(() => Date.now() - modeFreshAtRef.current < MODE_FRESH_MS, []);

  const cancelLiveEngine = useCallback(() => {
    liveActiveRef.current = false;
    liveAttachGenRef.current++;
    if (liveRetryTimerRef.current) {
      clearTimeout(liveRetryTimerRef.current);
      liveRetryTimerRef.current = null;
    }
    if (liveWatchdogRef.current) {
      clearInterval(liveWatchdogRef.current);
      liveWatchdogRef.current = null;
    }
  }, []);

  const resolveBroadcastMode = useCallback((timeoutMs = 2500): Promise<void> => {
    if (isModeFresh()) return Promise.resolve();
    if (!modeProbeRef.current) {
      modeProbeRef.current = (async () => {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), timeoutMs);
        try {
          const res = await fetch("/api/radio/live", { signal: ctrl.signal, cache: "no-store" });
          if (!res.ok) throw new Error(String(res.status));
          const data: any = await res.json();
          if (data?.mode) {
            applyMode(data.mode);
            try { sessionStorage.setItem("gl_radio_last_mode", data.mode); } catch {}
          }
          const stream = data?.stream_url || data?.live?.stream_url;
          if (typeof stream === "string" && stream.trim()) {
            liveStreamUrlRef.current = stream.trim();
            setLiveStreamUrl(stream.trim());
          }
          modeFreshAtRef.current = Date.now();
        } catch {
          try {
            const last = sessionStorage.getItem("gl_radio_last_mode");
            if (last) applyMode(last as BroadcastMode);
          } catch {}
        } finally {
          clearTimeout(t);
          modeProbeRef.current = null;
        }
      })();
    }
    return modeProbeRef.current;
  }, [applyMode, isModeFresh]);

  // 1. Initialize State & Load Preferences from localStorage
  useEffect(() => {
    try {
      const savedQuality = localStorage.getItem(QUALITY_KEY) as AudioQuality;
      if (savedQuality === "high" || savedQuality === "standard") {
        setQuality(savedQuality);
      }
      const savedSets = localStorage.getItem(CACHED_SETS_KEY);
      if (savedSets) {
        const parsed = JSON.parse(savedSets);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setBackupSets(parsed);
          // Note: Deck A pre-warm with playlist track is REMOVED to prevent race condition over live stream
        }
      }
    } catch {}
  }, []);

  // Update timing config dynamically whenever targetDuration changes
  useEffect(() => {
    timingConfigRef.current = computeRadioTiming(targetDurationSec);
  }, [targetDurationSec]);

  // 2. Fetch Radio Settings & Kill Switch (Short cache, never throws)
  const fetchRadioState = useCallback(async () => {
    try {
      const res = await fetch("/api/radio/state");
      if (!res.ok) return;
      const data = await res.json();

      if (data.enabled !== undefined) {
        setRadioEnabled(Boolean(data.enabled));
        if (!data.enabled) {
          // Hard kill switch active: kill audio immediately
          teardownPlayback();
          setEngineState("offline");
        }
      }

      // /api/radio/live is the single source of truth for broadcast mode; do not overwrite here
      if (data.on_air_slot !== undefined) {
        setOnAirSlot(data.on_air_slot);
      }
      if (typeof data.live?.stream_url === "string") {
        setLiveStreamUrl(data.live.stream_url.trim());
      }

      if (data.ai_drops_enabled !== undefined) {
        aiDropsEnabledRef.current = data.ai_drops_enabled === true;
      }

      if (Array.isArray(data.sets) && data.sets.length > 0) {
        setBackupSets(data.sets);

        if (!aiDropsEnabledRef.current) {
          availableDropsRef.current = [];
        } else {
          if (Array.isArray(data.drops) && data.drops.length > 0) {
            availableDropsRef.current = data.drops.map((d: any) => ({
              ...d,
              audio_url: d.playback_url || d.audio_url,
            }));
          }

          // Ingest authoritative upcoming drop prepared by Home Server daemon (only if AI drops enabled)
          if (data.upcoming_drop && data.upcoming_drop.drop_url && aiDropsEnabledRef.current) {
            const u = data.upcoming_drop;
            const upcomingId = `upcoming-${u.id}`;
            if (!firedDropIdsRef.current.has(upcomingId) && !availableDropsRef.current.some((d) => d.id === upcomingId)) {
              const freshUpcomingDrop: RadioDrop = {
                id: upcomingId,
                title: u.title || `${u.persona} · Upcoming`,
                audio_url: u.drop_url,
                persona: u.persona,
                mood: u.mood,
                target_track_id: String(u.target_track_id),
                script: u.script,
              };
              availableDropsRef.current = [freshUpcomingDrop, ...availableDropsRef.current];
            }
          }
        }

        try {
          localStorage.setItem(CACHED_SETS_KEY, JSON.stringify(data.sets.slice(0, 50)));
        } catch {}
      }
    } catch (e) {
      console.warn("[RadioContext] fetchRadioState failed:", e);
    } finally {
      setHasLoaded(true);
    }
  }, []);

  // 3. Fetch Real Stream Metadata via BFF (/api/radio/live)
  const fetchRadioLive = useCallback(async () => {
    if (isPollingRef.current) return;
    if (!radioEnabledRef.current) return;
    if (isDropPlayingRef.current && !audioRef.current?.ended) return;
    if (!isLiveRef.current) return;

    isPollingRef.current = true;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 6000);
      const res = await fetch("/api/radio/live", { signal: controller.signal });
      clearTimeout(timer);

      if (!res.ok) {
        throw new Error(`BFF responded with ${res.status}`);
      }

      const data: RadioLiveBffResponse = await res.json();

      const newMode = (data as any).mode;
      if (typeof (data as any).live_since === "number") {
        liveSinceRef.current = (data as any).live_since;
      } else if (newMode && newMode !== "live") {
        liveSinceRef.current = null;
      }

      if (newMode) {
        const prevMode = broadcastModeRef.current;
        modeFreshAtRef.current = Date.now();
        try { sessionStorage.setItem("gl_radio_last_mode", newMode); } catch {}

        if (newMode === "live") {
          nonLiveSinceRef.current = 0;
          const stream = (data as any).stream_url || (data as any)?.live?.stream_url;
          if (typeof stream === "string" && stream.trim()) {
            liveStreamUrlRef.current = stream.trim();
            setLiveStreamUrl(stream.trim());
          }
          if (prevMode !== "live" || !liveActiveRef.current) {
            applyMode("live");
            if (prevMode !== "live") {
              liveSinceRef.current = Math.floor(Date.now() / 1000);
            }
            if (isPlayingRef.current) attachAndPlayLiveStream({ force: true, isModeSwitch: prevMode !== "live" });
          }
          // Note: no re-attach on "reconnecting" / "buffering". The live engine heals in place.
        } else if (prevMode === "live") {
          // Leaving live needs ~10s of continuous non-live reports (or if we are not playing)
          if (!nonLiveSinceRef.current) nonLiveSinceRef.current = Date.now();
          if (!isPlayingRef.current || Date.now() - nonLiveSinceRef.current >= LIVE_EXIT_MS) {
            nonLiveSinceRef.current = 0;
            cancelLiveEngine();
            applyMode(newMode);
            if (data.now_playing) {
              const freshTrack = {
                ...data.now_playing,
                title: formatTrackTitle(data.now_playing.title),
                elapsed: typeof data.now_playing.elapsed === "number" ? data.now_playing.elapsed : 0,
              };
              nowPlayingTrackRef.current = freshTrack;
              setNowPlayingTrack(freshTrack);
            }
            if (isPlayingRef.current) attachAndPlayLiveStream({ force: true });
          }
        } else if (prevMode !== newMode) {
          applyMode(newMode);
        }
      }

      if (data.offline) {
        if (broadcastModeRef.current !== "live" &&
            (engineStateRef.current === "live" || engineStateRef.current === "connecting")) {
          handleStreamStall();
        }
        return;
      }

      if (data.stale) {
        stalePollCountRef.current = (stalePollCountRef.current || 0) + 1;
        if (stalePollCountRef.current >= 3) {
          setIsStale(true);
        }
      } else {
        stalePollCountRef.current = 0;
        setIsStale(false);
      }
      if (data.on_air_slot !== undefined) {
        setOnAirSlot(data.on_air_slot);
      }
      if (data.target_duration_sec && data.target_duration_sec > 0) {
        setTargetDurationSec(data.target_duration_sec);
      }

      if (data.now_playing) {
        const prevPlName = currentBroadcastPlaylistNameRef.current;
        const newPlName = data.playlist_name || null;
        const isPlaylistSwitch = Boolean(prevPlName && newPlName && prevPlName !== newPlName);
        currentBroadcastPlaylistNameRef.current = newPlName;

        const prevPlId = currentBroadcastPlaylistIdRef.current;
        const newPlId = (data as any).playlist_id || null;
        const isPlaylistIdSwitch = Boolean(prevPlId && newPlId && prevPlId !== newPlId);
        currentBroadcastPlaylistIdRef.current = newPlId;

        // Adjust for Edge CDN cache age using server_time so client elapsed stays exact
        const edgeAgeSec = (data as any)?.server_time
          ? Math.max(0, Math.floor(Date.now() / 1000) - Number((data as any).server_time))
          : 0;
        const baseElapsed = typeof data.now_playing.elapsed === "number" ? data.now_playing.elapsed : 0;
        const adjustedElapsed = baseElapsed + edgeAgeSec;

        const track = {
          ...data.now_playing,
          title: formatTrackTitle(data.now_playing.title),
          elapsed: adjustedElapsed,
        };
        const newTrackId = track.video_id || `${track.title}-${track.artist || ""}`;
        const withinManualGraceWindow = Date.now() - lastManualSwitchAtRef.current < 7000;
        if (withinManualGraceWindow && newTrackId !== currentTrackIdRef.current) {
          // Ignore stale cached server poll response right after an explicit studio cue/skip
          return;
        }
        setNowPlayingTrack(track);

        // If the incoming track was a scheduled cue, automatically mark it as executed
        if ((track as any)?.is_scheduled_cue && (track as any)?.schedule_id) {
          fetch(`/api/radio/schedules/${(track as any).schedule_id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "execute" }),
          }).catch(() => {});
        }

        // Track change detection: reset beacon and listened seconds
        if (newTrackId && newTrackId !== currentTrackIdRef.current) {
          sendPlayBeaconOnce(false);
          currentTrackIdRef.current = newTrackId;
          secondsListenedRef.current = 0;
          hasSentBeaconRef.current = false;
          hasFiredOutroDropRef.current = false;
          tracksSinceLastDropRef.current += 1;

          // If in live mode, NEVER update audio src from database playlist tracks
          if (broadcastModeRef.current === "live" || (data as any)?.mode === "live") {
            return;
          }

          // Single-writer rule: do not let background polling reassign audio.src while engine is actively connecting to a user-initiated target
          if (engineStateRef.current === "connecting" && !isPlaylistSwitch && !isPlaylistIdSwitch) {
            return;
          }

          // If playing and track advances, update audio src safely without truncating playing song (AutoDJ mode only)
          const targetTrackSrc = track.playback_url || track.audio_url;
          const activeDeck = activeDeckRef.current;
          const currentDeckAudio = activeDeck === "A" ? audioRef.current : preloadAudioRef.current;
          const standbyDeckAudio = activeDeck === "A" ? preloadAudioRef.current : audioRef.current;

          if (currentDeckAudio && isPlayingRef.current && (!isDropPlayingRef.current || currentDeckAudio.ended) && targetTrackSrc) {
            // If already crossfading, do not interrupt or double-trigger
            if (isCrossfadingRef.current) {
              return;
            }

            if (!areSameAudioSrc(currentDeckAudio.src, targetTrackSrc)) {
              const audio = currentDeckAudio;
              const targetDur = nowPlayingTrack?.duration_sec || nowPlayingTrack?.duration;
              const effectiveTrackDur = (targetDur && targetDur > 10)
                ? Math.min(audio.duration || Infinity, targetDur)
                : (audio.duration || 0);
              const remaining = (effectiveTrackDur && !isNaN(effectiveTrackDur) && audio.currentTime)
                ? effectiveTrackDur - audio.currentTime
                : 0;

              // Guard against premature cutoff: swap if in outro window (<=15s), song has stopped/ended,
              // playlist changed, DJ locked a new track in Mania mode, track just started, or diverged >15s
              const isOutroWindow = remaining > 0 && remaining <= 15;
              const isStalledOrEnded = audio.ended || audio.paused || remaining <= 0;
              const isDjManiaOverride = (data as any)?.mode === "mania";
              const isExplicitPlaylistChange = isPlaylistSwitch || isPlaylistIdSwitch;
              const hasDivergedSignificantly = Math.abs((audio.currentTime || 0) - (track.elapsed || 0)) > 20;

              if (
                isExplicitPlaylistChange ||
                isDjManiaOverride ||
                isStalledOrEnded ||
                isOutroWindow ||
                hasDivergedSignificantly
              ) {
                if (!isTransitioningRef.current) {
                  isTransitioningRef.current = true;
                  const targetSeek = track.elapsed || 0;
                  const newAudioSrc = track.playback_url || track.audio_url;

                  // Keep audible ducked bed volume if drop is currently finishing over the transition
                  const masterVol = isMutedRef.current ? 0 : (volumeRef.current || 1);
                  const duckedVol = masterVol > 0 ? Math.max(0.24, Math.min(0.36, masterVol * 0.30)) : 0;
                  audio.volume = isDropPlayingRef.current ? duckedVol : masterVol;

                  // Strictly pause standby deck so two tracks never overlap during poll advance
                  if (standbyDeckAudio) {
                    try {
                      standbyDeckAudio.pause();
                      standbyDeckAudio.currentTime = 0;
                    } catch {}
                  }

                  // Update audio source directly without calling audio.load() which wipes the background audio session on mobile
                  if (newAudioSrc && !areSameAudioSrc(audio.src, newAudioSrc)) {
                    audio.src = newAudioSrc;
                    safeSeekAudio(audio, targetSeek);
                  }
                  audio.play().then(() => {
                    isTransitioningRef.current = false;
                    setIsPlaying(true);
                    setEngineState("live");
                  }).catch((playErr) => {
                    if (playErr?.name !== "AbortError") {
                      console.debug("[RadioContext] auto-play on skip/advance error:", playErr);
                    }
                    isTransitioningRef.current = false;
                  });
                }
              }
            }
          }
        }

        // Anchor local progress interpolation
        if (typeof track.elapsed === "number" && typeof track.duration === "number" && track.duration > 0) {
          lastPollElapsedRef.current = track.elapsed;
          lastPollTimestampRef.current = Date.now();
          setInterpolatedElapsed(track.elapsed);
        }
      }

      if (Array.isArray(data.up_next)) {
        setUpNextQueue(data.up_next.map((t: any) => ({
          ...t,
          title: formatTrackTitle(t?.title),
        })));
      }
      if (Array.isArray(data.history)) {
        setHistoryList(data.history);
      }

      // Live injected drop broadcast listener: trigger live drop mid-song for all listeners
      if (
        data.live_drop &&
        data.live_drop.id &&
        data.live_drop.id !== lastLiveDropIdRef.current &&
        !firedLiveDropIdsRef.current.has(data.live_drop.id)
      ) {
        lastLiveDropIdRef.current = data.live_drop.id;
        firedLiveDropIdsRef.current.add(data.live_drop.id);
        firedDropIdsRef.current.add(data.live_drop.id);
        const dropFiredTime = data.live_drop.fired_at ? new Date(data.live_drop.fired_at).getTime() : Date.now();
        const ageSec = typeof data.live_drop.age_seconds === "number"
          ? data.live_drop.age_seconds
          : Math.abs(Math.floor((Date.now() - dropFiredTime) / 1000));
        const dropSrc = data.live_drop.playback_url || data.live_drop.audio_url;
        if (ageSec <= 90 && isPlayingRef.current && (audioRef.current || preloadAudioRef.current) && dropSrc) {
          console.log(`[RadioContext] 🔴 Stream live drop detected: "${data.live_drop.title}" (${data.live_drop.persona})`);
          triggerLiveInjectedDrop({
            ...data.live_drop,
            audio_url: dropSrc,
            playback_url: dropSrc,
          });
        }
      }

      // Reset poll backoff on successful response
      pollBackoffMsRef.current = timingConfigRef.current.metadataPollIntervalMs;
    } catch (err: any) {
      if (err?.name === "AbortError") {
        return;
      }
      console.warn("[RadioContext] Live metadata poll error:", err);
      // Exponential backoff up to max
      pollBackoffMsRef.current = Math.min(
        pollBackoffMsRef.current * 1.5,
        timingConfigRef.current.metadataErrorBackoffMaxMs
      );
    } finally {
      isPollingRef.current = false;
    }
  }, []);

  // 4. Scoped Inactivity-Aware Polling Loop
  // Only polls when /radio is open or audio is playing AND tab is visible
  useEffect(() => {
    let isCancelled = false;

    const scheduleNextPoll = () => {
      if (isCancelled) return;
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);

      const isOnRadioPage = pathname?.startsWith("/radio");
      const isOnStudioPage = pathname?.startsWith("/admin/radio");
      const isViewingRadio = Boolean(isOnRadioPage || isOnStudioPage);
      const isVisible = typeof document !== "undefined" && document.visibilityState === "visible";

      // Polling criteria:
      // 1. Audio is actively playing (MUST poll even if phone screen is locked/backgrounded so live broadcast track changes in pocket!)
      // 2. OR user is viewing the radio page / broadcast studio and tab is visible
      const shouldPoll = radioEnabled && (isPlaying || (isViewingRadio && isVisible));

      if (!shouldPoll) {
        // Pause polling until resumed (e.g. paused audio on non-radio page or hidden inactive tab)
        return;
      }

      // Polling cadence: 5s active playing, 10s background/locked display playing, 30s when paused/viewing
      const baseCadenceMs = isPlaying && !isVisible
        ? 10000
        : (isOnRadioPage && isPlaying) ? 5000 : 30000;
      const cadenceMs = isOnStudioPage && isVisible ? Math.min(baseCadenceMs, 6000) : baseCadenceMs;
      pollTimerRef.current = setTimeout(async () => {
        await fetchRadioLive();
        scheduleNextPoll();
      }, cadenceMs);
    };

    const isOnRadioPage = pathname?.startsWith("/radio");
    const isOnStudioPage = pathname?.startsWith("/admin/radio");
    const shouldActivate = radioEnabled && (isOnRadioPage || isOnStudioPage || isPlaying);

    if (!shouldActivate) {
      // Strictly ZERO radio network requests on checkout or non-radio pages before user presses play
      return;
    }

    fetchRadioState();
    fetchRadioLive();
    scheduleNextPoll();

    const handleVisibilityChange = () => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        pollBackoffMsRef.current = timingConfigRef.current.metadataPollIntervalMs;
        fetchRadioLive();
        scheduleNextPoll();
      }
    };

    const handleOnline = () => {
      if (engineStateRef.current === "offline") {
        setEngineState("idle");
      }
      fetchRadioLive();
      scheduleNextPoll();
    };

    const handleOffline = () => {
      setEngineState("offline");
    };

    window.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      isCancelled = true;
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
      window.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [radioEnabled, isPlaying, pathname, fetchRadioState, fetchRadioLive]);

  // 5. Smooth Local Progress Interpolation (Between polls, using real audio duration)
  useEffect(() => {
    if (!isPlaying) {
      return;
    }

    const interval = setInterval(() => {
      if (!lastPollTimestampRef.current) return;
      const secondsSincePoll = (Date.now() - lastPollTimestampRef.current) / 1000;
      const audioEl = audioRef.current;
      const hasRealAudioMeta = Boolean(
        audioEl &&
        audioEl.duration &&
        !isNaN(audioEl.duration) &&
        isFinite(audioEl.duration) &&
        audioEl.duration > 0
      );
      const trackDuration = hasRealAudioMeta
        ? Math.floor(audioEl!.duration)
        : (nowPlayingTrack?.duration && nowPlayingTrack.duration > 0 ? nowPlayingTrack.duration : 180);
      const current = hasRealAudioMeta && !audioEl!.paused
        ? audioEl!.currentTime
        : (lastPollElapsedRef.current + secondsSincePoll);
      const clamped = Math.min(current, trackDuration);
      setInterpolatedElapsed(clamped);

      // Track actual listening time
      secondsListenedRef.current += 1;
      if (secondsListenedRef.current >= 20 && !hasSentBeaconRef.current) {
        sendPlayBeaconOnce(false);
      }

      // 15s Outro Crossover Trigger: Drop starts 15 seconds before the track ends, continuing across next track start
      const djLive = broadcastModeRef.current === "live";
      const remainingSec = trackDuration - clamped;
      if (!djLive && aiDropsEnabledRef.current && availableDropsRef.current.length > 0 && remainingSec <= 15 && remainingSec > 2 && !hasFiredOutroDropRef.current && !isDropPlayingRef.current) {
        triggerOutroDropCrossoverRef.current();
      }

      // Preload next matching drop if available from station pool (pre-mastered on Home Server)
      if (!djLive && aiDropsEnabledRef.current && clamped >= 3 && availableDropsRef.current.length > 0 && !isPrefetchingDropRef.current) {
        let nextCandidate: any = (upNextQueue && upNextQueue.length > 0) ? upNextQueue[0] : null;
        if (!nextCandidate && backupSetsRef.current.length > 0) {
          const sets = backupSetsRef.current;
          const rawId = currentTrackIdRef.current || "";
          const cleanId = rawId.replace(/^set-/, "");
          let cIdx = sets.findIndex(
            (s) => String(s.id) === cleanId
          );
          if (cIdx === -1) cIdx = 0;
          const nIdx = (cIdx + 1) % sets.length;
          nextCandidate = sets[nIdx];
        }

        if (nextCandidate && nextCandidate.title) {
          const nextKey = `${(nextCandidate as any).id || ""}-${nextCandidate.title}`;
          if (lastPrefetchedTrackKeyRef.current !== nextKey) {
            lastPrefetchedTrackKeyRef.current = nextKey;
            isPrefetchingDropRef.current = true;
            const targetId = String((nextCandidate as any).id || "");
            const targetTitle = (nextCandidate.title || "").toLowerCase().trim();
            const matchedDrop = availableDropsRef.current.find((d) =>
              (d.target_track_id && String(d.target_track_id) === targetId) ||
              (d.target_track_title && targetTitle.includes(d.target_track_title.toLowerCase().trim()))
            );
            const dropSrc = matchedDrop?.playback_url || matchedDrop?.audio_url;
            if (dropSrc && typeof Audio !== "undefined") {
              const pre = new Audio();
              pre.preload = "auto";
              if (pre.src !== dropSrc) pre.src = dropSrc;
            }
            isPrefetchingDropRef.current = false;
          }
        }
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [isPlaying, nowPlayingTrack?.duration, pathname, upNextQueue]);

  // 6. BroadcastChannel Multi-Tab Conflict Resolution
  useEffect(() => {
    if (typeof window === "undefined" || !("BroadcastChannel" in window)) return;
    const channel = new BroadcastChannel("goodlife_radio_tab_sync");
    broadcastChannelRef.current = channel;

    channel.onmessage = (event) => {
      if (event.data?.type === "PLAY") {
        // Another tab started playback: pause this tab gracefully
        teardownPlayback();
        setIsPlaying(false);
        setEngineState("paused");
      } else if (event.data?.type === "QUEUE_NEXT") {
        fetchRadioLive();
      }
    };

    return () => {
      channel.close();
      broadcastChannelRef.current = null;
    };
  }, []);

  const notifyOtherTabsPlay = () => {
    try {
      broadcastChannelRef.current?.postMessage({ type: "PLAY" });
    } catch {}
  };

  // 7. Stats Beacon Sender (Validated, Kenyan DPA compliant)
  const sendPlayBeaconOnce = (completed: boolean) => {
    if (hasSentBeaconRef.current && !completed) return;
    const currentId = currentTrackIdRef.current;
    if (!currentId) return;

    try {
      const isLive = broadcastModeRef.current === "live" || engineStateRef.current === "live";
      const activeBackup = backupSetsRef.current.find((s) => String(s.id) === currentId);

      const payload = isLive
        ? {
            mode: "live",
            seconds_listened: Math.round(secondsListenedRef.current),
            quality: qualityRef.current,
          }
        : {
            set_id: activeBackup ? activeBackup.id : 1,
            seconds_listened: Math.round(secondsListenedRef.current),
            completed,
            quality: qualityRef.current,
          };

      navigator.sendBeacon?.("/api/radio/play-event", JSON.stringify(payload));
      if (completed || secondsListenedRef.current >= 20) {
        hasSentBeaconRef.current = true;
      }
    } catch {}
  };

  // 8. Stream Teardown: Pause = Disconnect (Releases buffers, stops loading)
  const teardownPlayback = useCallback(() => {
    cancelLiveEngine();
    activeDeckRef.current = "A";

    if (waitingDebounceTimerRef.current) {
      clearTimeout(waitingDebounceTimerRef.current);
      waitingDebounceTimerRef.current = null;
    }
    if (stallWatchdogRef.current) {
      clearTimeout(stallWatchdogRef.current);
      stallWatchdogRef.current = null;
    }
    if (stallTimerRef.current) {
      clearTimeout(stallTimerRef.current);
      stallTimerRef.current = null;
    }
    if (backupProbeTimerRef.current) {
      clearTimeout(backupProbeTimerRef.current);
      backupProbeTimerRef.current = null;
    }

    if (crossfadeTimerRef.current) {
      clearInterval(crossfadeTimerRef.current);
      crossfadeTimerRef.current = null;
    }
    isCrossfadingRef.current = false;

    if (hlsRef.current) {
      try {
        hlsRef.current.stopLoad();
        hlsRef.current.detachMedia();
        hlsRef.current.destroy();
      } catch {}
      hlsRef.current = null;
    }

    if (audioRef.current) {
      try {
        audioRef.current.pause();
        // Do NOT call removeAttribute("src") or load() — preserves mobile user gesture unlock
      } catch {}
    }
    if (preloadAudioRef.current) {
      try {
        preloadAudioRef.current.pause();
        // Do NOT call removeAttribute("src") or load() — preserves mobile user gesture unlock
      } catch {}
    }
    /* teardownDropSnippet_done */
    if (dropAudioRef.current) {
      try {
        dropAudioRef.current.pause();
        // Do NOT call removeAttribute("src") or load() — preserves mobile user gesture unlock
      } catch {}
    }
    setIsDropPlaying(false);
    setActiveDropTitle(null);
    setActivePersona(null);
    setActiveMood(null);

  }, [cancelLiveEngine]);

  // 9. Stale Stream & Reconnect -> Backup Mix Failover Pipeline
  const handleStreamStall = useCallback(() => {
    if (broadcastModeRef.current === "live" || liveActiveRef.current) {
      setEngineState("buffering");
      return;
    }
    if (engineStateRef.current === "reconnecting" || engineStateRef.current === "backup-mix") {
      return;
    }

    setEngineState("reconnecting");

    if (stallTimerRef.current) clearTimeout(stallTimerRef.current);
    stallTimerRef.current = setTimeout(() => {
      if (engineStateRef.current === "reconnecting") {
        if (broadcastModeRef.current === "live" || liveActiveRef.current) {
          setEngineState("buffering");
          return;
        }
        if (backupSetsRef.current.length > 0) {
          startBackupMixRef.current();
        } else {
          setEngineState("error");
        }
      }
    }, timingConfigRef.current.backupMixThresholdMs);
  }, []);

  const startBackupMix = useCallback(() => {
    if (broadcastModeRef.current === "live" || liveActiveRef.current) {
      setEngineState("buffering");
      return;
    }
    setEngineState("backup-mix");
    if (backupSets.length === 0 || !audioRef.current) {
      setEngineState("error");
      return;
    }

    const backupTrack = backupSets[currentBackupIndex % backupSets.length];
    if (backupTrack) {
      // Synchronize metadata with backup track so visual display and audio match 100%
      setNowPlayingTrack({
        title: formatTrackTitle(backupTrack.title),
        artist: backupTrack.dj_name,
        thumbnail: backupTrack.cover_url,
        elapsed: 0,
        duration: backupTrack.duration_sec || 180,
        audio_url: backupTrack.audio_url,
        video_id: `set-${backupTrack.id}`,
      });
      setInterpolatedElapsed(0);
      lastPollElapsedRef.current = 0;
      lastPollTimestampRef.current = Date.now();

      // Synchronize Up Next queue
      const upcoming = [
        backupSets[(currentBackupIndex + 1) % backupSets.length],
        backupSets[(currentBackupIndex + 2) % backupSets.length],
        backupSets[(currentBackupIndex + 3) % backupSets.length],
      ].filter(Boolean).map((t) => ({
        id: t.id,
        video_id: `set-${t.id}`,
        title: formatTrackTitle(t.title),
        artist: t.dj_name,
        duration: t.duration_sec || 180,
        thumbnail: t.cover_url,
      }));
      setUpNextQueue(upcoming);

      const backupSrc = backupTrack.playback_url || backupTrack.audio_url;
      if (backupSrc && audioRef.current.src !== backupSrc) {
        audioRef.current.src = backupSrc;
      }
      audioRef.current
        .play()
        .then(() => setIsPlaying(true))
        .catch(() => {
          setIsPlaying(false);
          setEngineState("error");
        });
    }

    // While in backup mix, probe live stream in background to return when live recovers
    if (backupProbeTimerRef.current) clearInterval(backupProbeTimerRef.current);
    backupProbeTimerRef.current = setInterval(async () => {
      const url = liveStreamUrlRef.current;
      if (!url) return;
      try {
        const controller = new AbortController();
        const t = setTimeout(() => controller.abort(), 2500);
        const res = await fetch(url, { method: "HEAD", signal: controller.signal });
        clearTimeout(t);
        if (res.ok && engineStateRef.current === "backup-mix") {
          clearInterval(backupProbeTimerRef.current!);
          backupProbeTimerRef.current = null;
          attachAndPlayLiveStream();
        }
      } catch {}
    }, timingConfigRef.current.manifestProbeIntervalMs);
  }, [backupSets, currentBackupIndex]);
  startBackupMixRef.current = startBackupMix;

  // 10. Live Playback Engine: Plays synchronized R2 festival track in autodj/mania; plays HLS in live mode
  const attachAndPlayLiveStream = useCallback(async (opts?: { force?: boolean; isRecovery?: boolean; isModeSwitch?: boolean }): Promise<void> => {
    if (!radioEnabledRef.current) {
      setEngineState("offline");
      setIsPlaying(false);
      return;
    }

    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setEngineState("offline");
      setIsPlaying(false);
      return;
    }

    const rawStreamUrl = liveStreamUrlRef.current || "https://dj.darajadigital.com/hls/stream.m3u8";
    const streamUrl = resolveLiveStreamUrl(rawStreamUrl, qualityRef.current);
    const currentMode = broadcastModeRef.current;


    // Helper: Play the synchronized R2 festival track directly (AutoDJ mode only)
    const playCurrentTrackAudio = async () => {
      if (broadcastModeRef.current === "live") {
        return;
      }
      cancelLiveEngine();
      const audio = audioRef.current;
      if (!audio) return;

      let track = nowPlayingTrackRef.current;
      const timeSinceLastPoll = lastPollTimestampRef.current > 0
        ? Math.max(0, (Date.now() - lastPollTimestampRef.current) / 1000)
        : 0;
      const isTrackStaleOrFinished = !track || (!track.playback_url && !track.audio_url) || (
        Boolean(track.duration && track.duration > 0 && ((track.elapsed || 0) + timeSinceLastPoll) >= track.duration)
      );

      let activeAudioUrl = resolveAudioSource(track) || resolveAudioSource(backupSetsRef.current[0]);
      if (!activeAudioUrl) {
        activeAudioUrl = "/api/radio/audio/track/20";
      }

      // Fast-path: Set the audio source immediately if already known so the browser decoder starts pre-buffering
      if (activeAudioUrl && audio.src !== activeAudioUrl) {
        audio.src = activeAudioUrl;
        audio.preload = "auto";
      }

      // If track is missing or stale, refresh live track asynchronously without blocking immediate play
      if (isTrackStaleOrFinished) {
        fetch("/api/radio/live")
          .then((res) => (res.ok ? res.json() : null))
          .then((data) => {
            if (data?.now_playing?.playback_url || data?.now_playing?.audio_url) {
              const freshTrack = {
                ...data.now_playing,
                title: formatTrackTitle(data.now_playing.title),
              };
              nowPlayingTrackRef.current = freshTrack;
              setNowPlayingTrack(freshTrack);
              lastPollElapsedRef.current = freshTrack.elapsed || 0;
              lastPollTimestampRef.current = Date.now();
              setInterpolatedElapsed(freshTrack.elapsed || 0);

              const freshAudioSrc = resolveAudioSource(freshTrack);
              const curAudio = activeDeckRef.current === "A" ? audioRef.current : preloadAudioRef.current;
              if (freshAudioSrc && curAudio && isPlayingRef.current && !areSameAudioSrc(curAudio.src, freshAudioSrc)) {
                curAudio.src = freshAudioSrc;
                safeSeekAudio(curAudio, freshTrack.elapsed || 0);
                curAudio.play().catch(() => {});
              }
            }
          })
          .catch(() => {});
      }

      // Clean up previous HLS and crossfader timers without wiping audio elements
      if (hlsRef.current) {
        try {
          hlsRef.current.stopLoad();
          hlsRef.current.detachMedia();
          hlsRef.current.destroy();
        } catch {}
        hlsRef.current = null;
      }
      if (stallTimerRef.current) {
        clearTimeout(stallTimerRef.current);
        stallTimerRef.current = null;
      }
      if (crossfadeTimerRef.current) {
        clearInterval(crossfadeTimerRef.current);
        crossfadeTimerRef.current = null;
      }
      isCrossfadingRef.current = false;

      setEngineState("live");
      setIsLive(true);
      notifyOtherTabsPlay();

      // Compute precise live offset (accounting for seconds since poll was received)
      let seekOffset = 0;
      if (track?.elapsed !== undefined) {
        const secondsSincePoll = lastPollTimestampRef.current > 0
          ? Math.max(0, (Date.now() - lastPollTimestampRef.current) / 1000)
          : 0;
        seekOffset = (track.elapsed || 0) + secondsSincePoll;
        if (track.duration && track.duration > 2) {
          seekOffset = Math.min(seekOffset, track.duration - 1);
        }
        seekOffset = Math.max(0, seekOffset);
      }

      if (activeAudioUrl && audio.src !== activeAudioUrl) {
        audio.src = activeAudioUrl;
      }
      audio.volume = isMutedRef.current ? 0 : volumeRef.current;

      hasStartedPlayingRef.current.A = false;
      const now = performance.now();
      trackLoadTimingRef.current = {
        deck: "A",
        src: activeAudioUrl,
        targetSeek: seekOffset,
        srcSetAt: now,
        loadedMetadataAt: null,
        canPlayAt: null,
        playingAt: null,
        nudges: 0,
      };

      const recordMetadata = () => {
        if (trackLoadTimingRef.current) {
          trackLoadTimingRef.current.loadedMetadataAt = performance.now();
          console.log("[Radio:Timing] loadedmetadata", {
            deck: "A",
            duration: audio.duration,
            elapsedFromSrcSetMs: Math.round(trackLoadTimingRef.current.loadedMetadataAt - trackLoadTimingRef.current.srcSetAt),
          });
        }
      };
      const recordCanPlay = () => {
        if (trackLoadTimingRef.current) {
          trackLoadTimingRef.current.canPlayAt = performance.now();
          console.log("[Radio:Timing] canplay", {
            deck: "A",
            readyState: audio.readyState,
            elapsedFromSrcSetMs: Math.round(trackLoadTimingRef.current.canPlayAt - trackLoadTimingRef.current.srcSetAt),
          });
        }
      };
      audio.addEventListener("loadedmetadata", recordMetadata, { once: true });
      audio.addEventListener("canplay", recordCanPlay, { once: true });

      safeSeekAudio(audio, seekOffset, (applied) => {
        console.log("[Radio:Timing] safeSeekApplied", {
          deck: "A",
          targetSeek: seekOffset,
          appliedSeek: applied,
          readyState: audio.readyState,
          elapsedFromSrcSetMs: Math.round(performance.now() - now),
        });
      });

      try {
        await audio.play();
        setIsPlaying(true);
      } catch (err: any) {
        if (err?.name === "AbortError") {
          return; // Superceded by another valid track load, do not transition to error state
        }
        console.warn("[RadioContext] audio.play() error:", err);
        if (err?.name === "NotAllowedError") {
          setEngineState("idle");
          setIsPlaying(false);
        } else {
          setEngineState("error");
          setIsPlaying(false);
        }
      }
    };

    // If station is in autodj or mania mode, or no live stream is set: play festival track directly
    if (currentMode !== "live" || !streamUrl || streamUrl.trim() === "") {
      await playCurrentTrackAudio();
      return;
    }

    // ───────── External Live DJ stream: from here the client NEVER falls back to an AutoDJ song ─────────
    if (!opts?.force && liveActiveRef.current) return; // Idempotent: already on the live stream

    isReattachingRef.current = true;
    teardownPlayback();
    liveActiveRef.current = true;
    const gen = liveAttachGenRef.current;
    const isStale = () => gen !== liveAttachGenRef.current || !liveActiveRef.current;
    const settle = () => setTimeout(() => { isReattachingRef.current = false; }, 1500);

    setEngineState("connecting");
    setIsLive(true);
    notifyOtherTabsPlay();

    const audio = audioRef.current;
    if (!audio) {
      liveActiveRef.current = false;
      settle();
      return;
    }

    // Strictly pause and silence Deck B (AutoDJ standby) so only the live stream can play
    if (preloadAudioRef.current) {
      try {
        preloadAudioRef.current.pause();
        preloadAudioRef.current.currentTime = 0;
        preloadAudioRef.current.removeAttribute("src");
        preloadAudioRef.current.load();
      } catch {}
    }
    try {
      audio.pause();
      audio.currentTime = 0;
    } catch {}

    audio.volume = isMutedRef.current ? 0 : volumeRef.current;

    // Recovery = same URL, same element, exponential backoff. Never a song.
    const rebuild = (reason: string) => {
      if (isStale() || liveRetryTimerRef.current) return;
      const n = liveRebuildCountRef.current++;
      const delay = Math.min(500 * (n === 0 ? 1 : 2 ** Math.min(n, 3)), 6000);
      console.debug("[Radio:StreamReconnect]", { timestamp: new Date().toISOString(), reason, streamUrl, attempt: n + 1, delayMs: delay });
      setEngineState("buffering");
      liveRetryTimerRef.current = setTimeout(() => {
        liveRetryTimerRef.current = null;
        if (!isStale()) attachLiveRef.current({ force: true, isRecovery: true });
      }, delay);
    };
    recoverLiveRef.current = rebuild;

    // Frozen-playhead watchdog: the only escalation path for silent stalls
    const startWatchdog = () => {
      if (liveWatchdogRef.current) clearInterval(liveWatchdogRef.current);
      liveLastProgressAtRef.current = Date.now();
      liveWatchdogRef.current = setInterval(() => {
        if (isStale()) return;
        const a = audioRef.current;
        if (!a || a.paused) {
          liveLastProgressAtRef.current = Date.now();
          return;
        }
        if (Date.now() - liveLastProgressAtRef.current > 7000) {
          liveLastProgressAtRef.current = Date.now();
          rebuild("frozen-playhead");
        }
      }, 2000);
    };

    const onPlayRejected = (err: any) => {
      if (isStale()) return;
      if (err?.name === "NotAllowedError") {
        cancelLiveEngine();
        setEngineState("idle");
        setIsPlaying(false);
      } else {
        rebuild("play-rejected");
      }
    };

    // Direct MP3 Icecast Stream or Apple-native Safari HLS
    if (!streamUrl.includes(".m3u8") || shouldUseNativeHls(audio)) {
      audio.src = streamUrl;
      audio.play()
        .then(() => {
          if (!isStale()) {
            setEngineState("live");
            setIsPlaying(true);
            startWatchdog();
          }
        })
        .catch(onPlayRejected);
      settle();
      return;
    }

    // hls.js (Android Chrome, desktop browsers)
    try {
      const { default: Hls } = await import("hls.js");
      if (isStale()) return;
      if (!Hls.isSupported()) {
        console.warn("[RadioContext] HLS is not supported on this browser and stream requires HLS");
        setEngineState("error");
        return;
      }

      const hls = new Hls(LIVE_HLS_CONFIG);
      hlsRef.current = hls;
      hls.loadSource(streamUrl);
      hls.attachMedia(audio);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        if (isStale()) return;
        audio.play()
          .then(() => {
            if (!isStale()) {
              setEngineState("live");
              setIsPlaying(true);
              startWatchdog();
            }
          })
          .catch(onPlayRejected);
      });

      hls.on(Hls.Events.FRAG_BUFFERED, () => {
        liveNetRetriesRef.current = 0;
        liveMediaRetriesRef.current = 0;
        // Rely purely on HLS.js liveSyncDurationCount (3 segments = ~12s buffer depth)
        // rather than seeking to edge - 1.5s, which previously starved the buffer and caused stall loops.
      });

      hls.on(Hls.Events.ERROR, (_e: any, data: any) => {
        if (isStale()) return;
        if (!data?.fatal) {
          if (data?.details === Hls.ErrorDetails.BUFFER_STALLED_ERROR) {
            let bufferedAheadSec = 0;
            try {
              const buffered = audio.buffered;
              const ct = audio.currentTime;
              for (let i = 0; i < buffered.length; i++) {
                if (buffered.start(i) <= ct && ct <= buffered.end(i)) {
                  bufferedAheadSec = Math.max(0, buffered.end(i) - ct);
                  break;
                }
              }
            } catch {}

            const targetDuration = hls.levels?.[hls.currentLevel]?.details?.targetduration ?? null;
            const fragmentCount = hls.levels?.[hls.currentLevel]?.details?.fragments?.length ?? null;

            console.debug("[Radio:BufferStalled]", {
              timestamp: new Date().toISOString(),
              latency: hls.latency,
              targetLatency: hls.targetLatency,
              bufferedAheadSec,
              targetDuration,
              fragmentCount,
              liveSyncDurationCount: LIVE_HLS_CONFIG.liveSyncDurationCount,
              streamUrl,
            });
            setEngineState("buffering");
          }
          return; // non-fatal: hls.js self-heals in-flight
        }
        console.error("[Radio:StreamFatalError]", {
          timestamp: new Date().toISOString(),
          type: data.type,
          details: data.details,
          fatal: data.fatal,
          streamUrl,
          httpStatus: data?.response?.code,
          httpText: data?.response?.text,
        });
        switch (data.type) {
          case Hls.ErrorTypes.NETWORK_ERROR: {
            const n = liveNetRetriesRef.current++;
            if (n >= 6) {
              console.error("[Radio:StreamFatalError] Network retries exhausted (>=6 attempts)");
              rebuild("network-exhausted");
              return;
            }
            setEngineState("buffering");
            setTimeout(() => {
              if (!isStale()) {
                console.debug("[Radio:StreamRetry]", { timestamp: new Date().toISOString(), attempt: n + 1 });
                try { hls.startLoad(-1); } catch (loadErr) {
                  console.error("[Radio:StreamError]", { timestamp: new Date().toISOString(), loadErr });
                }
              }
            }, Math.min(1000 * 2 ** n, 8000));
            return;
          }
          case Hls.ErrorTypes.MEDIA_ERROR: {
            const m = liveMediaRetriesRef.current++;
            try {
              if (m === 0) hls.recoverMediaError();
              else if (m === 1) {
                hls.swapAudioCodec();
                hls.recoverMediaError();
              } else {
                rebuild("media");
              }
            } catch {
              rebuild("media-throw");
            }
            return;
          }
          default:
            rebuild("fatal-" + data.type);
        }
      });
    } catch {
      rebuild("hls-import-failed");
    } finally {
      settle();
    }
  }, [cancelLiveEngine, teardownPlayback]);
  attachLiveRef.current = attachAndPlayLiveStream;

  // 11. Stalled playback buffer watchdog & AutoDJ natural crossfader
  const handleTimeUpdate = useCallback(
    (deck: "A" | "B") => {
      if (deck !== activeDeckRef.current) return;
      const audio = deck === "A" ? audioRef.current : preloadAudioRef.current;
      if (!audio) return;

      if (liveActiveRef.current || broadcastModeRef.current === "live") {
        if (audio.currentTime !== liveLastTimeRef.current) {
          liveLastTimeRef.current = audio.currentTime;
          liveLastProgressAtRef.current = Date.now();
          liveRebuildCountRef.current = 0;
          if (engineStateRef.current === "buffering" || engineStateRef.current === "reconnecting") {
            setEngineState("live");
          }
        }
        return; // none of the AutoDJ crossfade logic applies to the live DJ stream
      }

      const cur = audio.currentTime;
      // Cap effective duration to database duration if audio file has trailing silence
      const targetDur = nowPlayingTrack?.duration_sec || nowPlayingTrack?.duration;
      const targetTrackDur = (targetDur && targetDur > 10)
        ? targetDur
        : undefined;
      const effectiveDur = targetTrackDur
        ? Math.min(audio.duration || Infinity, targetTrackDur)
        : (audio.duration || 0);

      if (!isLiveRef.current && effectiveDur && !isNaN(effectiveDur) && effectiveDur > 0) {
        setInterpolatedElapsed(cur);
      }

      if (cur > lastPlaybackTimeRef.current) {
        lastPlaybackTimeRef.current = cur;
        if (engineStateRef.current === "reconnecting") {
          setEngineState("live");
          if (stallTimerRef.current) {
            clearTimeout(stallTimerRef.current);
            stallTimerRef.current = null;
          }
        }
      }

      // 🎚️ AutoDJ natural smooth crossfade in the last 3.5 seconds
      if (effectiveDur && !isNaN(effectiveDur) && effectiveDur > 12 && !isCrossfadingRef.current && isLiveRef.current) {
        const remaining = effectiveDur - cur;
        if (remaining <= 3.5 && remaining > -1.0 && !hasFiredAutoDjCrossfadeRef.current) {
          hasFiredAutoDjCrossfadeRef.current = true;
          let nextCandidate: any = (upNextQueue && upNextQueue.length > 0) ? upNextQueue[0] : null;
          if (!(nextCandidate?.playback_url || nextCandidate?.audio_url) && backupSetsRef.current.length > 0) {
            const rawEndedId = currentTrackIdRef.current || "";
            const cleanEndedId = rawEndedId.replace(/^(set-|vault-|pl-\d+-)/, "");
            const sets = backupSetsRef.current;
            const curIdx = sets.findIndex(
              (s) => String(s.id) === cleanEndedId
            );
            const nIdx = curIdx !== -1 ? (curIdx + 1) % sets.length : 0;
            if (sets[nIdx]?.playback_url || sets[nIdx]?.audio_url) {
              nextCandidate = sets[nIdx];
            }
          }
          if ((nextCandidate?.playback_url || nextCandidate?.audio_url) && executeCrossfadeRef.current) {
            console.log(`[RadioContext] 🎚️ AutoDJ natural crossfade blending into "${nextCandidate.title}"`);
            executeCrossfadeRef.current(nextCandidate, { fast: false });
            setNowPlayingTrack({
              ...nextCandidate,
              title: formatTrackTitle(nextCandidate.title),
              elapsed: 0,
              duration: nextCandidate.duration_sec || nextCandidate.duration || 180,
            });
            currentTrackIdRef.current = nextCandidate.video_id || `set-${nextCandidate.id}`;
            setInterpolatedElapsed(0);
            lastPollElapsedRef.current = 0;
            lastPollTimestampRef.current = Date.now();
            setUpNextQueue((prev) => (prev.length > 0 && prev[0].id === nextCandidate.id ? prev.slice(1) : prev));
            fetchRadioLive();
          }
        }
      }
    },
    [upNextQueue]
  );

  // 12. MediaSession API (Lockscreen & Bluetooth Controls)
  const togglePlayDispatcherRef = useRef<() => void>(() => {});
  const nextTrackDispatcherRef = useRef<() => void>(() => {});
  const prevTrackDispatcherRef = useRef<() => void>(() => {});
  const seekDispatcherRef = useRef<(pct: number) => void>(() => {});
  useEffect(() => {
    togglePlayDispatcherRef.current = () => togglePlay();
    nextTrackDispatcherRef.current = () => advanceBroadcastTrack(true);
    prevTrackDispatcherRef.current = () => prevTrack();
  });

  useEffect(() => {
    if (typeof window === "undefined" || !("mediaSession" in navigator)) return;

    const showTitle = onAirSlot?.show?.title || (isLive ? (nowPlayingTrack?.title || "GOODLIFE LIVE") : null);
    const presenterName = onAirSlot?.presenter?.dj_name;

    let displayTitle = formatTrackTitle(nowPlayingTrack?.title);
    let displayArtist = nowPlayingTrack?.artist || presenterName || "GOODLIFE Radio 254";
    let displayAlbum = showTitle
      ? `${showTitle} · GOODLIFE Radio 254`
      : "GOODLIFE Radio 254 (Nairobi)";

    if (showTitle && displayTitle && displayTitle !== showTitle) {
      displayAlbum = `${showTitle} · GOODLIFE Radio 254`;
      if (presenterName && !displayArtist.includes(presenterName)) {
        displayArtist = `${displayArtist} · DJ ${presenterName}`;
      }
    } else if (showTitle && !displayTitle) {
      displayTitle = showTitle;
      displayArtist = presenterName || "Resident DJ";
    }

    const artworkUrl = resolveCoverArt(nowPlayingTrack?.thumbnail);

    navigator.mediaSession.metadata = new MediaMetadata({
      title: displayTitle,
      artist: displayArtist,
      album: displayAlbum,
      artwork: [
        {
          src: artworkUrl,
          sizes: "512x512",
          type: "image/png",
        },
        {
          src: artworkUrl,
          sizes: "320x180",
          type: "image/jpeg",
        },
      ],
    });

    // Keep playbackState accurate for lock screen & bluetooth controls
    if ("playbackState" in navigator.mediaSession) {
      if (!isPlaying || engineState === "offline") {
        navigator.mediaSession.playbackState = "paused";
      } else {
        navigator.mediaSession.playbackState = "playing";
      }
    }

    const trackDuration = nowPlayingTrack?.duration && nowPlayingTrack.duration > 0 ? nowPlayingTrack.duration : (audioRef.current?.duration || 0);
    const currentPos = audioRef.current?.currentTime || 0;

    // Keep positionState accurate where it applies (non-live / recorded set)
    if ("setPositionState" in navigator.mediaSession) {
      try {
        if (!isLive && trackDuration > 0 && currentPos >= 0) {
          navigator.mediaSession.setPositionState({
            duration: Math.max(trackDuration, 1),
            playbackRate: 1,
            position: Math.min(Math.max(0, currentPos), trackDuration),
          });
        } else {
          navigator.mediaSession.setPositionState(null as any);
        }
      } catch {}
    }

    navigator.mediaSession.setActionHandler("seekto", !isLive ? (details) => {
      if (details.seekTime !== undefined && trackDuration > 0) {
        const percent = (details.seekTime / trackDuration) * 100;
        seekDispatcherRef.current(percent);
      }
    } : null);
    navigator.mediaSession.setActionHandler("seekforward", null);
    navigator.mediaSession.setActionHandler("seekbackward", null);

    // Support hardware headset buttons & phone lock-screen skip in background
    navigator.mediaSession.setActionHandler("previoustrack", () => prevTrackDispatcherRef.current());
    navigator.mediaSession.setActionHandler("nexttrack", () => nextTrackDispatcherRef.current());

    navigator.mediaSession.setActionHandler("play", () => togglePlayDispatcherRef.current());
    navigator.mediaSession.setActionHandler("pause", () => togglePlayDispatcherRef.current());
    navigator.mediaSession.setActionHandler("stop", () => togglePlayDispatcherRef.current());
  }, [nowPlayingTrack, onAirSlot, isPlaying, isLive, engineState]);

  
  // Helper: Smooth volume swell when drop concludes (the broadcast beat drop)
  const swellMusicToFullVolume = useCallback(() => {
    if (swellIntervalRef.current) {
      clearInterval(swellIntervalRef.current);
      swellIntervalRef.current = null;
    }
    const masterVol = isMutedRef.current ? 0 : volumeRef.current;
    const duckedVol = masterVol > 0 ? Math.max(0.24, Math.min(0.36, masterVol * 0.30)) : 0;
    const activeAudio = activeDeckRef.current === "A" ? audioRef.current : preloadAudioRef.current;
    const startVol = activeAudio ? activeAudio.volume : duckedVol;
    const target = isMutedRef.current ? 0 : volumeRef.current;
    if (startVol >= target || target <= 0) {
      if (activeAudio) activeAudio.volume = target;
      if (audioRef.current) audioRef.current.volume = target;
      return;
    }
    const startTime = Date.now();
    const swellDuration = 400; // 400ms broadcast beat drop swell
    swellIntervalRef.current = setInterval(() => {
      const progress = Math.min(1, (Date.now() - startTime) / swellDuration);
      const curVol = startVol + (target - startVol) * progress;
      if (activeAudio) {
        activeAudio.volume = curVol;
      }
      if (audioRef.current) {
        audioRef.current.volume = curVol;
      }
      if (progress >= 1) {
        if (swellIntervalRef.current) clearInterval(swellIntervalRef.current);
        swellIntervalRef.current = null;
      }
    }, 25);
  }, []);

  // Live Drop Injection Engine: ducks current track mid-song, plays voice drop for all listeners, then swells back
  const triggerLiveInjectedDrop = useCallback(
    (liveDrop: { id: string | number; title?: string; persona?: string; audio_url: string; playback_url?: string }) => {
      const dropSrc = liveDrop.playback_url || liveDrop.audio_url;
      if (!dropAudioRef.current || !dropSrc) return;
      const dropAudio = dropAudioRef.current;
      const activeAudio = activeDeckRef.current === "A" ? audioRef.current : preloadAudioRef.current;

      const masterVol = isMutedRef.current ? 0 : (volumeRef.current || 1);
      const duckedVol = masterVol > 0 ? Math.max(0.24, Math.min(0.36, masterVol * 0.30)) : 0;

      isDropPlayingRef.current = true;
      setIsDropPlaying(true);
      setActiveDropTitle(liveDrop.title || "Live Air Drop");
      setActivePersona(liveDrop.persona || "Station DJ");
      setActiveMood("live");
      lastDropPlayedTimestampRef.current = Date.now();

      // Duck currently playing music bed to audible low level (-10dB to -12dB) immediately
      if (activeAudio && isPlayingRef.current) {
        activeAudio.volume = duckedVol;
      }

      // Safety watchdog: initialized generously (90s) so long voice drops never cut out early
      let dropWatchdog: NodeJS.Timeout | null = setTimeout(() => {
        if (isDropPlayingRef.current) {
          console.warn("[RadioContext] Live drop safety watchdog timeout (90s), releasing duck");
          onDropDone();
        }
      }, 90000);

      const onMetadataLoaded = () => {
        if (Number.isFinite(dropAudio.duration) && dropAudio.duration > 0) {
          if (dropWatchdog) clearTimeout(dropWatchdog);
          // Set watchdog to exact drop duration + 10s grace period (minimum 30s)
          const timeoutMs = Math.max(30000, Math.round((dropAudio.duration + 10) * 1000));
          dropWatchdog = setTimeout(() => {
            if (isDropPlayingRef.current) {
              console.warn(`[RadioContext] Live drop watchdog timeout (${Math.round(timeoutMs / 1000)}s), releasing duck`);
              onDropDone();
            }
          }, timeoutMs);
        }
      };

      const onDropDone = () => {
        if (dropWatchdog) {
          clearTimeout(dropWatchdog);
          dropWatchdog = null;
        }
        dropAudio.removeEventListener("loadedmetadata", onMetadataLoaded);
        dropAudio.removeEventListener("ended", onDropDone);
        dropAudio.removeEventListener("error", onDropDone);
        isDropPlayingRef.current = false;
        setIsDropPlaying(false);
        setActiveDropTitle(null);
        setActivePersona(null);
        setActiveMood(null);
        if (activeAudio) {
          swellMusicToFullVolume();
          if (activeAudio.ended && isPlayingRef.current) {
            let nextCandidate: any = (upNextQueue && upNextQueue.length > 0) ? upNextQueue[0] : null;
            if (!nextCandidate && backupSetsRef.current.length > 0) {
              const rawEndedId = currentTrackIdRef.current || "";
              const cleanEndedId = rawEndedId.replace(/^(set-|vault-|pl-\d+-)/, "");
              const sets = backupSetsRef.current;
              const curIdx = sets.findIndex((s) => String(s.id) === cleanEndedId);
              const nIdx = curIdx !== -1 ? (curIdx + 1) % sets.length : 0;
              nextCandidate = sets[nIdx];
            }
            if (nextCandidate && executeCrossfadeRef.current) {
              executeCrossfadeRef.current(nextCandidate, { fast: true });
            }
          }
        }
      };

      dropAudio.addEventListener("loadedmetadata", onMetadataLoaded);
      dropAudio.addEventListener("ended", onDropDone);
      dropAudio.addEventListener("error", (e) => {
        console.warn("[RadioContext] Live drop audio error:", dropAudio.error, e);
        onDropDone();
      });
      if (dropSrc && dropAudio.src !== dropSrc) {
        dropAudio.src = dropSrc;
      }
      dropAudio.volume = masterVol;
      try {
        dropAudio.currentTime = 0;
      } catch {}
      dropAudio.play().catch((playErr: any) => {
        console.warn("[RadioContext] Live drop play error:", playErr);
        if (playErr?.name === "NotAllowedError") {
          setIsDropUnlocked(false);
        }
        onDropDone();
      });
    },
    [swellMusicToFullVolume]
  );

  // Method exposed to admin and DJ soundboard: broadcast drop to live stream.
  // By default, playLocal is false so DJs/broadcasters monitoring the broadcast stream
  // do not hear an instant local duplicate at t=0 followed by the stream audio ~12s later.
  const airLiveDrop = useCallback(
    async (dropData: {
      audioUrl: string;
      title: string;
      persona?: string;
      script?: string;
      playLocal?: boolean;
    }) => {
      try {
        const res = await fetch("/api/radio/drops/live-inject", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            audio_url: dropData.audioUrl,
            title: dropData.title,
            persona: dropData.persona,
            script: dropData.script,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.drop) {
            // Aired to live stream broadcast for all listeners!
            firedLiveDropIdsRef.current.add(data.drop.id);
            firedDropIdsRef.current.add(data.drop.id);
            lastLiveDropIdRef.current = data.drop.id;

            // Only play locally if explicitly requested (e.g. auditioning offline or local player without stream)
            if (dropData.playLocal) {
              triggerLiveInjectedDrop({
                id: data.drop.id,
                title: data.drop.title || dropData.title,
                persona: data.drop.persona || dropData.persona,
                audio_url: data.drop.audio_url || dropData.audioUrl,
                playback_url: data.drop.audio_url || dropData.audioUrl,
              });
            }
            return true;
          }
        }
      } catch (err) {
        console.warn("[RadioContext] airLiveDrop broadcast failed:", err);
      }
      return false;
    },
    [triggerLiveInjectedDrop]
  );

  const setManualDucking = useCallback(
    (ducked: boolean) => {
      const isMobileDevice = typeof window !== "undefined" && /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
      if (ducked) {
        if (swellIntervalRef.current) {
          clearInterval(swellIntervalRef.current);
          swellIntervalRef.current = null;
        }
        const masterVol = isMutedRef.current ? 0 : (volumeRef.current || 1);
        // On mobile devices, mute local speaker to 0 to eliminate mic feedback/bleed into the phone microphone
        const duckedVol = isMobileDevice ? 0 : (masterVol > 0 ? Math.max(0.08, Math.min(0.20, masterVol * 0.18)) : 0);
        const activeAudio = activeDeckRef.current === "A" ? audioRef.current : preloadAudioRef.current;
        if (activeAudio) {
          activeAudio.volume = duckedVol;
        }
      } else {
        swellMusicToFullVolume();
      }
    },
    [swellMusicToFullVolume]
  );

  // Seamless Dual-Deck Equal-Power Audio Crossfader
  // Seamlessly mixes from outgoing deck to incoming deck with zero gap, zero cutoff, and full ducking support
  const executeCrossfade = useCallback(
    (
      track: { id?: number; title: string; dj_name?: string; audio_url?: string; playback_url?: string; duration_sec?: number; cover_url?: string; [key: string]: any },
      options: { fast?: boolean; targetSeek?: number } = {}
    ) => {
      if (broadcastModeRef.current === "live" || liveActiveRef.current) return;
      const targetTrackUrl = resolveAudioSource(track);
      if (!track || !targetTrackUrl) return;
      const outgoing = activeDeckRef.current === "A" ? audioRef.current : preloadAudioRef.current;
      const incoming = activeDeckRef.current === "A" ? preloadAudioRef.current : audioRef.current;

      const masterVol = isMutedRef.current ? 0 : (volumeRef.current || 1);
      const duckedVol = masterVol > 0 ? Math.max(0.24, Math.min(0.36, masterVol * 0.30)) : 0;
      const targetVol = isDropPlayingRef.current ? duckedVol : masterVol;

      if (!incoming) {
        if (outgoing) {
          if (outgoing.src !== targetTrackUrl) {
            outgoing.src = targetTrackUrl;
          }
          outgoing.currentTime = options.targetSeek || 0;
          outgoing.volume = targetVol;
          outgoing.play().catch(() => {});
        }
        return;
      }

      if (crossfadeTimerRef.current) {
        clearInterval(crossfadeTimerRef.current);
        crossfadeTimerRef.current = null;
      }

      isCrossfadingRef.current = true;
      incoming.volume = 0;
      if (incoming.src !== targetTrackUrl) {
        incoming.src = targetTrackUrl;
        incoming.load();
      }
      incoming.currentTime = options.targetSeek || 0;

      const isOutPlaying = Boolean(
        outgoing &&
        !outgoing.paused &&
        !outgoing.ended &&
        outgoing.currentTime > 0 &&
        outgoing.src
      );
      const durationMs = options.fast ? 850 : 1300;
      const startOutVol = outgoing ? outgoing.volume : 0;

      // Zero-Silence Guarantee: Outgoing keeps playing until incoming is confirmed playing
      let hasBegunMixing = false;
      const beginCrossfadeMixing = () => {
        if (hasBegunMixing) return;
        hasBegunMixing = true;

        setIsPlaying(true);
        setEngineState("live");

        if (!isOutPlaying || startOutVol <= 0) {
          incoming.volume = targetVol;
          isCrossfadingRef.current = false;
          activeDeckRef.current = activeDeckRef.current === "A" ? "B" : "A";
          return;
        }

        const startTime = performance.now();
        crossfadeTimerRef.current = setInterval(() => {
          const elapsed = performance.now() - startTime;
          const progress = Math.min(1, elapsed / durationMs);

          // Equal-power sinusoidal curve for professional seamless radio broadcast mixing
          const outGain = Math.cos(progress * 0.5 * Math.PI);
          const inGain = Math.sin(progress * 0.5 * Math.PI);

          if (outgoing) outgoing.volume = Math.max(0, startOutVol * outGain);
          if (incoming) incoming.volume = Math.min(targetVol, targetVol * inGain);

          if (progress >= 1) {
            if (crossfadeTimerRef.current) {
              clearInterval(crossfadeTimerRef.current);
              crossfadeTimerRef.current = null;
            }
            isCrossfadingRef.current = false;
            if (outgoing) {
              try {
                outgoing.pause();
                outgoing.currentTime = 0;
                outgoing.volume = targetVol;
              } catch {}
            }
            if (incoming) incoming.volume = targetVol;
            activeDeckRef.current = activeDeckRef.current === "A" ? "B" : "A";
          }
        }, 30);
      };

      // Watchdog: If incoming is slow to buffer, DO NOT silence outgoing deck prematurely.
      // Wait up to 12s for incoming to emit frames before attempting proxy recovery.
      const bufferWatchdog = setTimeout(() => {
        if (!hasBegunMixing) {
          console.warn("[RadioContext] Incoming deck slow to buffer; waiting for data without silencing outgoing");
          if (track?.id && incoming) {
            const proxyUrl = `/api/radio/audio/track/${encodeURIComponent(track.id)}`;
            if (!areSameAudioSrc(incoming.src, proxyUrl)) {
              console.debug("[RadioContext] 🛡️ Attempting proxy recovery on incoming deck");
              incoming.src = proxyUrl;
              incoming.play().then(() => beginCrossfadeMixing()).catch(() => {});
            }
          }
        }
      }, 8000);

      const onIncomingPlaying = () => {
        clearTimeout(bufferWatchdog);
        incoming.removeEventListener("playing", onIncomingPlaying);
        beginCrossfadeMixing();
      };
      incoming.addEventListener("playing", onIncomingPlaying, { once: true });

      const playPromise = incoming.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            if (incoming.readyState >= 3) {
              clearTimeout(bufferWatchdog);
              incoming.removeEventListener("playing", onIncomingPlaying);
              beginCrossfadeMixing();
            }
          })
          .catch((err) => {
            clearTimeout(bufferWatchdog);
            incoming.removeEventListener("playing", onIncomingPlaying);
            console.warn("[RadioContext] crossfade incoming play error:", err);
            // If proxy recovery is possible, try proxy URL
            if (track?.id) {
              const proxyUrl = `/api/radio/audio/track/${encodeURIComponent(track.id)}`;
              if (incoming.src !== proxyUrl) {
                incoming.src = proxyUrl;
                incoming.play().then(() => beginCrossfadeMixing()).catch(() => {
                  isCrossfadingRef.current = false;
                  if (outgoing && isOutPlaying) outgoing.volume = targetVol;
                });
                return;
              }
            }
            isCrossfadingRef.current = false;
            if (outgoing && isOutPlaying) {
              outgoing.volume = targetVol;
            }
          });
      }
    },
    []
  );
  executeCrossfadeRef.current = executeCrossfade;

  // Instant Studio Track Switcher: smooth equal-power crossfade from playing track into target track
  const playImmediateBroadcastTrack = useCallback(
    (track: { id: number; title: string; dj_name?: string; audio_url: string; duration_sec?: number; cover_url?: string }) => {
      if (!track || !track.audio_url) return;
      if (broadcastModeRef.current === "live" || liveActiveRef.current) {
        console.warn("[Radio:Live] Ignoring studio track switch: Live DJ stream is currently active");
        return;
      }
      const formattedTitle = formatTrackTitle(track.title);
      const trackVideoId = `set-${track.id}`;
      lastManualSwitchAtRef.current = Date.now();
      setBroadcastMode("mania");
      currentTrackIdRef.current = trackVideoId;
      hasFiredOutroDropRef.current = false;
      hasFiredAutoDjCrossfadeRef.current = false;
      hasSentBeaconRef.current = false;
      secondsListenedRef.current = 0;
      lastPollElapsedRef.current = 0;
      lastPollTimestampRef.current = Date.now();
      setInterpolatedElapsed(0);

      setNowPlayingTrack({
        title: formattedTitle,
        artist: track.dj_name || "GOODLIFE Resident",
        thumbnail: track.cover_url || "/flyer.png",
        elapsed: 0,
        duration: track.duration_sec || 180,
        audio_url: track.audio_url,
        video_id: trackVideoId,
      });

      executeCrossfade(track, { fast: true, targetSeek: 0 });
    },
    [executeCrossfade]
  );

  // 12A. Outro Drop Crossover Trigger (Starts at 15s before track ends, bridges into next song)
  const triggerOutroDropCrossover = useCallback(() => {
    if (broadcastModeRef.current === "live" || liveActiveRef.current) {
      return;
    }
    if (
      !aiDropsEnabledRef.current ||
      availableDropsRef.current.length === 0 ||
      hasFiredOutroDropRef.current ||
      isDropPlayingRef.current ||
      engineStateRef.current === "paused" ||
      !radioEnabledRef.current ||
      !audioRef.current ||
      !dropAudioRef.current
    ) {
      return;
    }

    // Prevent rapid re-triggering within 20s
    if (Date.now() - lastDropPlayedTimestampRef.current < 20000) {
      return;
    }

    const dropAudio = dropAudioRef.current;
    const audio = audioRef.current;

    // 1. Accurately determine the upcoming track
    const sets = backupSetsRef.current;
    let nextTrack: any = (upNextQueue && upNextQueue.length > 0) ? upNextQueue[0] : null;
    if (!nextTrack && sets.length > 0) {
      const rawId = currentTrackIdRef.current || "";
      const cleanId = rawId.replace(/^(set-|vault-|pl-\d+-)/, "");
      let cIdx = sets.findIndex(
        (s) => String(s.id) === cleanId
      );
      if (cIdx === -1) cIdx = 0;
      const nIdx = (cIdx + 1) % sets.length;
      nextTrack = sets[nIdx];
    }

    if (!nextTrack) return;
    const targetId = String(nextTrack.id || "");
    const targetTitle = (nextTrack.title || "").toLowerCase().trim();

    if (availableDropsRef.current.length <= 1) {
      void fetchRadioState();
    }

    let drops = availableDropsRef.current.filter((d) => d.id.startsWith("dyn-") || d.id.startsWith("db-drop-") || d.audio_url);

    // Check if there is a targeted dynamic drop specifically prepared for this upcoming track!
    const hasTargetedDrop = drops.some((d) => {
      if (firedDropIdsRef.current.has(d.id)) return false;
      const idMatch = d.target_track_id && String(d.target_track_id) === targetId;
      const titleMatch = d.target_track_title && targetTitle.includes(d.target_track_title.toLowerCase().trim());
      return idMatch || titleMatch;
    });

    // Dual-cadence check: Trigger outro drop if a targeted dynamic drop is queued OR at least 2 tracks elapsed OR 15 mins passed
    const isTrackCadenceDue = tracksSinceLastDropRef.current >= 2;
    const isClockDue = (Date.now() - lastClockDropTimestampRef.current) >= 15 * 60 * 1000;
    if (!hasTargetedDrop && !isTrackCadenceDue && !isClockDue) {
      return;
    }

    if (drops.length === 0) return;

    // 2. Prioritize drop explicitly targeted to upcoming track; fallback to evergreen station ID/DJ drop
    let drop = drops.find((d) => {
      if (firedDropIdsRef.current.has(d.id)) return false;
      const idMatch = d.target_track_id && String(d.target_track_id) === targetId;
      const titleMatch = d.target_track_title && targetTitle.includes(d.target_track_title.toLowerCase().trim());
      return idMatch || titleMatch;
    });

    if (!drop) {
      // Pick an evergreen station drop that doesn't target another song
      drop = drops.find((d) => !firedDropIdsRef.current.has(d.id) && !d.target_track_title && !d.target_track_id && d.audio_url);
    }

    if (!drop && drops.length > 0) {
      // If all drops were played in this session, reset the fired set so they cycle through
      firedDropIdsRef.current.clear();
      drop = drops.find((d) => !d.target_track_title && !d.target_track_id && d.audio_url);
    }

    if (!drop) {
      console.log(`[RadioContext] ⏭️ Skipping 15s drop: No valid drop available for "${nextTrack.title}". Clean musical transition.`);
      return;
    }

    firedDropIdsRef.current.add(drop.id);
    availableDropsRef.current = availableDropsRef.current.filter((d) => d.id !== drop.id);

    lastDropPlayedTimestampRef.current = Date.now();
    tracksSinceLastDropRef.current = 0;
    if (isClockDue) {
      lastClockDropTimestampRef.current = Date.now();
    }
    hasFiredOutroDropRef.current = true;
    isDropPlayingRef.current = true;
    setIsDropPlaying(true);
    setActiveDropTitle(drop.title);
    setActivePersona(drop.persona || "GOODLIFE DJ");
    setActiveMood(drop.mood || "HYPE");

    const masterVol = isMutedRef.current ? 0 : volumeRef.current;
    const duckedVol = masterVol > 0 ? Math.max(0.24, Math.min(0.36, masterVol * 0.30)) : 0;

    // Duck outgoing/incoming music bed to an audible low bed (~30%) instead of near-silent mute
    audio.volume = duckedVol;

    const cleanupOutroDrop = () => {
      if (dropAudio) {
        dropAudio.removeEventListener("ended", onDropEnded);
        dropAudio.removeEventListener("error", onDropError);
      }
      isDropPlayingRef.current = false;
      setIsDropPlaying(false);
      setActiveDropTitle(null);
      setActivePersona(null);
      setActiveMood(null);
      swellMusicToFullVolume();
      if (audio && audio.paused && !audio.ended && isPlayingRef.current) {
        audio.play().catch(() => {});
      }
      if (audio && audio.ended && isPlayingRef.current) {
        if (nextTrack && executeCrossfadeRef.current) {
          executeCrossfadeRef.current(nextTrack, { fast: true });
          setNowPlayingTrack({
            ...nextTrack,
            title: formatTrackTitle(nextTrack.title),
            elapsed: 0,
            duration: nextTrack.duration_sec || nextTrack.duration || 180,
          });
          currentTrackIdRef.current = nextTrack.video_id || `set-${nextTrack.id}`;
          setInterpolatedElapsed(0);
          lastPollElapsedRef.current = 0;
          lastPollTimestampRef.current = Date.now();
        }
        void fetchRadioLive();
      }
    };

    const onDropEnded = () => {
      cleanupOutroDrop();
    };

    const onDropError = () => {
      console.warn("[RadioContext] Outro drop error, swelling music immediately");
      cleanupOutroDrop();
    };

    try {
      const dropSrc = drop.playback_url || drop.audio_url;
      if (dropSrc && dropAudio.src !== dropSrc) {
        dropAudio.src = dropSrc;
      }
      dropAudio.volume = masterVol;
      dropAudio.addEventListener("ended", onDropEnded);
      dropAudio.addEventListener("error", onDropError);
      dropAudio.play().catch((err: any) => {
        console.warn("[RadioContext] Outro drop play rejected:", err);
        if (err?.name === "NotAllowedError") {
          setIsDropUnlocked(false);
        }
        cleanupOutroDrop();
      });
      console.log(`[RadioContext] 🎙️ Outro crossover drop started at 15s mark: "${drop.title}"`);
    } catch {
      cleanupOutroDrop();
    }
  }, [swellMusicToFullVolume, upNextQueue]);

  useEffect(() => {
    triggerOutroDropCrossoverRef.current = triggerOutroDropCrossover;
  }, [triggerOutroDropCrossover]);

  // 12B. Station Voice Drop Playout Pipeline (Talkover Bed between songs)
  const playDropAndAdvance = useCallback(async () => {
    if (engineStateRef.current === "paused" || !radioEnabledRef.current) {
      return;
    }
    isTransitioningRef.current = true;

    const dropAudio = dropAudioRef.current;
    // Strictly dynamic drops: only air freshly generated AI voice drops, never stale hardcoded sweepers
    const drops = availableDropsRef.current.filter((d) => d.id.startsWith("dyn-") || d.audio_url);
    const audio = audioRef.current;

    // Determine upcoming track: prioritize explicitly queued upNextQueue track first!
    const rawEndedId = currentTrackIdRef.current || "";
    const cleanEndedId = rawEndedId.replace(/^(set-|vault-|pl-\d+-)/, "");
    const sets = backupSetsRef.current;
    let currentIdx = -1;
    if (sets.length > 0) {
      currentIdx = sets.findIndex(
        (s) =>
          String(s.id) === cleanEndedId ||
          (s.external_id && (s.external_id === rawEndedId || s.external_id === cleanEndedId))
      );
      if (currentIdx === -1) currentIdx = 0;
    }

    let nextTrack: any = null;
    let nextIdx = 0;
    if (upNextQueue && upNextQueue.length > 0 && (upNextQueue[0].playback_url || upNextQueue[0].audio_url)) {
      nextTrack = upNextQueue[0];
      const foundIdx = sets.findIndex((s) => String(s.id) === String(nextTrack.id));
      nextIdx = foundIdx !== -1 ? foundIdx : 0;
      setUpNextQueue((prev) => prev.slice(1));
    } else {
      nextIdx = sets.length > 0 ? (currentIdx + 1) % sets.length : 0;
      nextTrack = sets.length > 0 ? sets[nextIdx] : null;
    }

    if (!nextTrack || !(nextTrack.playback_url || nextTrack.audio_url) || !audio) {
      isTransitioningRef.current = false;
      if (activePlaylistRef.current) return;
      attachAndPlayLiveStream();
      return;
    }

    if (activePlaylistRef.current) {
      const pl = activePlaylistRef.current;
      setActivePlaylist({ ...pl, trackIndex: nextIdx });
    }

    const masterVol = isMutedRef.current ? 0 : volumeRef.current;
    const duckedVol = masterVol > 0 ? Math.max(0.24, Math.min(0.36, masterVol * 0.30)) : 0;

    const trackVideoId = activePlaylistRef.current
      ? `pl-${activePlaylistRef.current.id}-${nextTrack.id}`
      : `set-${nextTrack.id}`;

    // Advance metadata immediately to next track so listener sees the next song starting!
    setNowPlayingTrack({
      title: formatTrackTitle(nextTrack.title),
      artist: nextTrack.dj_name,
      thumbnail: nextTrack.cover_url,
      elapsed: 0,
      duration: nextTrack.duration_sec || 180,
      audio_url: nextTrack.audio_url,
      video_id: trackVideoId,
    });
    currentTrackIdRef.current = trackVideoId;
    setInterpolatedElapsed(0);
    lastPollElapsedRef.current = 0;
    lastPollTimestampRef.current = Date.now();
    hasFiredOutroDropRef.current = false;

    // Immediately update Up Next Queue so UI displays the truth
    const upcomingQueue = [
      sets[(nextIdx + 1) % sets.length],
      sets[(nextIdx + 2) % sets.length],
      sets[(nextIdx + 3) % sets.length],
    ].filter(Boolean).map((t) => ({
      id: t.id,
      video_id: activePlaylistRef.current ? `pl-${activePlaylistRef.current.id}-${t.id}` : `set-${t.id}`,
      title: formatTrackTitle(t.title),
      artist: t.dj_name,
      duration: t.duration_sec || 180,
      thumbnail: t.cover_url,
    }));
    setUpNextQueue(upcomingQueue);

    // Seamless Crossover: If drop is ALREADY speaking across boundary from the 15s outro mark:
    if (isDropPlayingRef.current) {
      console.log(`[RadioContext] 🔀 Seamless crossover: advancing music under active drop -> "${nextTrack.title}"`);
      const nextSrc = nextTrack.playback_url || nextTrack.audio_url;
      if (nextSrc && audio.src !== nextSrc) {
        audio.src = nextSrc;
      }
      audio.currentTime = 0;
      audio.volume = duckedVol; // Keep new track ducked while drop finishes!
      try {
        await audio.play();
        isTransitioningRef.current = false;
        setIsPlaying(true);
        setEngineState("live");
      } catch (err) {
        isTransitioningRef.current = false;
        console.warn("[RadioContext] Crossover track play error:", err);
      }
      return;
    }

    // Direct clean transition when AI drops are disabled or pool is empty (no drop talkover bed)
    if (!aiDropsEnabledRef.current || availableDropsRef.current.length === 0) {
      const incomingSrc = nextTrack.playback_url || nextTrack.audio_url;
      if (incomingSrc && audio.src !== incomingSrc) {
        audio.src = incomingSrc;
      }
      audio.currentTime = 0;
      audio.volume = masterVol;
      try {
        await audio.play();
        isTransitioningRef.current = false;
        setIsPlaying(true);
        setEngineState("live");
      } catch {
        isTransitioningRef.current = false;
        attachAndPlayLiveStream();
      }
      return;
    }

    // 2. Dual-cadence evaluation: every 2 tracks + every 15 minutes
    tracksSinceLastDropRef.current += 1;
    const isTrackCadenceDue = tracksSinceLastDropRef.current >= 2;
    const isClockDue = (Date.now() - lastClockDropTimestampRef.current) >= 15 * 60 * 1000;

    // Replenish drop pool if low
    if (availableDropsRef.current.length <= 1) {
      void fetchRadioState();
    }
    const currentDrops = availableDropsRef.current.filter((d) => d.id.startsWith("dyn-") || d.id.startsWith("db-drop-") || d.audio_url);

    let drop: RadioDrop | undefined;
    dropAudioQueueRef.current = [];

    const targetId = String(nextTrack.id);
    const targetTitle = (nextTrack.title || "").toLowerCase().trim();

    // Helper to find track-specific intro tease or energetic DJ drop
    const findIntroDrop = (pool: RadioDrop[]) => {
      let found = pool.find((d) =>
        (d.target_track_id && String(d.target_track_id) === targetId) ||
        (d.target_track_title && targetTitle.includes(d.target_track_title.toLowerCase().trim()))
      );
      if (!found) {
        found = pool.find((d) => !d.target_track_title && !d.target_track_id && d.audio_url && d.persona !== "Bwana Mkubwa");
      }
      return found;
    };

    // Helper to find authentic Station ID / Clock Bulletin (Bwana Mkubwa or Station Sweeper)
    const findStationIdDrop = (pool: RadioDrop[]) => {
      let found = pool.find((d) => d.persona === "Bwana Mkubwa" && d.audio_url);
      if (!found) {
        found = pool.find((d) => d.id.includes("vibes") || d.persona === "GOODLIFE 254" && d.audio_url);
      }
      if (!found) {
        found = pool.find((d) => !d.target_track_title && !d.target_track_id && d.audio_url);
      }
      return found;
    };

    if (isTrackCadenceDue && isClockDue) {
      // Authentic Multi-Drop Stacking ("Double-Drop"): Station ID -> Song Intro Tease
      const stationDrop = findStationIdDrop(currentDrops);
      const remainingPool = currentDrops.filter((d) => d.id !== stationDrop?.id);
      const introDrop = findIntroDrop(remainingPool);

      if (stationDrop && introDrop) {
        drop = stationDrop;
        dropAudioQueueRef.current = [introDrop];
        availableDropsRef.current = availableDropsRef.current.filter((d) => d.id !== stationDrop.id && d.id !== introDrop.id);
        tracksSinceLastDropRef.current = 0;
        lastClockDropTimestampRef.current = Date.now();
        lastDropPlayedTimestampRef.current = Date.now();
        console.log(`[RadioContext] 🎙️ Double-Drop Stacked: "${stationDrop.title}" -> "${introDrop.title}"`);
      } else if (stationDrop || introDrop) {
        drop = stationDrop || introDrop;
        availableDropsRef.current = availableDropsRef.current.filter((d) => d.id !== drop?.id);
        if (drop === stationDrop) lastClockDropTimestampRef.current = Date.now();
        if (drop === introDrop) tracksSinceLastDropRef.current = 0;
        lastDropPlayedTimestampRef.current = Date.now();
      }
    } else if (isTrackCadenceDue) {
      // Single Song Intro Tease every 2 tracks
      drop = findIntroDrop(currentDrops);
      if (drop) {
        availableDropsRef.current = availableDropsRef.current.filter((d) => d.id !== drop?.id);
        tracksSinceLastDropRef.current = 0;
        lastDropPlayedTimestampRef.current = Date.now();
        console.log(`[RadioContext] 🎙️ Song Intro Tease (Track Cadence): "${drop.title}"`);
      }
    } else if (isClockDue) {
      // Single Station ID / Clock Bulletin every 15 minutes
      drop = findStationIdDrop(currentDrops);
      if (drop) {
        availableDropsRef.current = availableDropsRef.current.filter((d) => d.id !== drop?.id);
        lastClockDropTimestampRef.current = Date.now();
        lastDropPlayedTimestampRef.current = Date.now();
        console.log(`[RadioContext] 🎙️ Station ID (15-min Clock Cadence): "${drop.title}"`);
      }
    }

    // Prepare incoming music track
    const incomingSrc = nextTrack.playback_url || nextTrack.audio_url;
    if (incomingSrc && audio.src !== incomingSrc) {
      audio.src = incomingSrc;
    }
    audio.currentTime = 0;

    const hasDrop = Boolean(dropAudio && (drop?.playback_url || drop?.audio_url));

    const cleanupDropPlayout = () => {
      if (dropAudio) {
        dropAudio.removeEventListener("ended", onDropEnded);
        dropAudio.removeEventListener("error", onDropError);
      }
      dropAudioQueueRef.current = [];
      swellMusicToFullVolume();
      isDropPlayingRef.current = false;
      setIsDropPlaying(false);
      setActiveDropTitle(null);
      setActivePersona(null);
      setActiveMood(null);
    };

    const onDropEnded = () => {
      if (dropAudioQueueRef.current.length > 0 && dropAudio) {
        const nextInQueue = dropAudioQueueRef.current.shift()!;
        console.log(`[RadioContext] 🎙️ Chaining stacked drop in talkover bed: "${nextInQueue.title}"`);
        setActiveDropTitle(nextInQueue.title);
        setActivePersona(nextInQueue.persona || "GOODLIFE DJ");
        setActiveMood(nextInQueue.mood || "HYPE");
        const nextDropSrc = nextInQueue.playback_url || nextInQueue.audio_url;
        if (nextDropSrc && dropAudio.src !== nextDropSrc) {
          dropAudio.src = nextDropSrc;
        }
        dropAudio.play().catch((err) => {
          console.warn("[RadioContext] Chained drop error, finishing queue:", err);
          cleanupDropPlayout();
        });
      } else {
        cleanupDropPlayout();
      }
    };

    const onDropError = () => {
      console.warn("[RadioContext] Drop audio error, swelling music immediately");
      cleanupDropPlayout();
    };

    if (hasDrop && drop && dropAudio) {
      // Broadcast talkover bed: incoming song starts ducked underneath the voice
      audio.volume = duckedVol;
      isDropPlayingRef.current = true;
      setIsDropPlaying(true);
      setActiveDropTitle(drop.title);
      setActivePersona(drop.persona || "GOODLIFE DJ");
      setActiveMood(drop.mood || "HYPE");

      // Start music bed immediately (zero dead air!)
      try {
        await audio.play();
        isTransitioningRef.current = false;
        setIsPlaying(true);
        setEngineState("live");
      } catch (err: any) {
        isTransitioningRef.current = false;
        if (err?.name === "AbortError") {
          audio.addEventListener("canplay", () => audio.play().catch(() => {}), { once: true });
        } else {
          console.warn("[RadioContext] Music play rejected:", err);
        }
      }

      // Start voice drop simultaneously over the ducked music bed
      try {
        const dropSrc = drop.playback_url || drop.audio_url;
        if (dropSrc && dropAudio.src !== dropSrc) {
          dropAudio.src = dropSrc;
        }
        dropAudio.volume = masterVol;
        dropAudio.addEventListener("ended", onDropEnded);
        dropAudio.addEventListener("error", onDropError);
        await dropAudio.play();
      } catch (err: any) {
        console.warn("[RadioContext] Drop play rejected, swelling music:", err);
        if (err?.name === "NotAllowedError") {
          setIsDropUnlocked(false);
        }
        cleanupDropPlayout();
      }
    } else {
      // Direct track advance with no drop
      audio.volume = masterVol;
      try {
        await audio.play();
        isTransitioningRef.current = false;
        setIsPlaying(true);
        setEngineState("live");
      } catch {
        isTransitioningRef.current = false;
        attachAndPlayLiveStream();
      }
    }
  }, [attachAndPlayLiveStream]);

  // User gesture drop audio unlocking for mobile Safari/Chrome autoplay policy
  const primeAudioPipeline = useCallback(() => {
    // 1. Prime drop audio element
    if (dropAudioRef.current && !dropUnlockedRef.current) {
      try {
        dropAudioRef.current.src = SILENT_WAV_DATA_URI;
        dropAudioRef.current.volume = 0.001;
        const playPromise = dropAudioRef.current.play();
        if (playPromise !== undefined) {
          playPromise
            .then(() => {
              if (dropAudioRef.current && dropAudioRef.current.src.startsWith("data:")) {
                dropAudioRef.current.pause();
                dropAudioRef.current.currentTime = 0;
              }
              dropUnlockedRef.current = true;
              setIsDropUnlocked(true);
            })
            .catch(() => {});
        }
      } catch {}
    }

    // 2. Guarantee the standby deck is PAUSED so two decks never play simultaneously
    const standbyAudio = activeDeckRef.current === "A" ? preloadAudioRef.current : audioRef.current;
    if (standbyAudio && !isCrossfadingRef.current) {
      try {
        standbyAudio.pause();
      } catch {}
    }
  }, []);

  const unlockStationVoice = useCallback(async () => {
    if (dropAudioRef.current) {
      try {
        dropAudioRef.current.src = SILENT_WAV_DATA_URI;
        dropAudioRef.current.volume = 0.001;
        await dropAudioRef.current.play();
        dropAudioRef.current.pause();
        dropAudioRef.current.currentTime = 0;
        dropUnlockedRef.current = true;
        setIsDropUnlocked(true);
      } catch (err) {
        console.warn("[RadioContext] Manual unlockStationVoice failed:", err);
      }
    }
  }, []);

  // 13. Public Control Actions
  const togglePlay = useCallback(() => {
    if (isPlaying) {
      teardownPlayback();
      setIsPlaying(false);
      setEngineState("paused");
      return;
    }
    setIsMinimized(false);
    setIsPlaying(true);
    setEngineState("connecting");

    // Strictly pause standby deck so two tracks never overlap
    if (preloadAudioRef.current && activeDeckRef.current === "A") {
      try { preloadAudioRef.current.pause(); } catch {}
    }
    if (audioRef.current && activeDeckRef.current === "B") {
      try { audioRef.current.pause(); } catch {}
    }

    // Prime the audio elements synchronously inside the user click gesture
    primeAudioPipeline();

    if (isModeFresh()) {
      attachAndPlayLiveStream();
    } else {
      resolveBroadcastMode(2500).finally(() => {
        if (isPlayingRef.current) attachAndPlayLiveStream();
      });
    }

    Promise.all([fetchRadioState(), fetchRadioLive()]).catch(() => {});
  }, [isPlaying, attachAndPlayLiveStream, teardownPlayback, fetchRadioState, fetchRadioLive, primeAudioPipeline, isModeFresh, resolveBroadcastMode]);

  const retry = useCallback(() => {
    resolveBroadcastMode().finally(() => attachAndPlayLiveStream({ force: true }));
  }, [attachAndPlayLiveStream, resolveBroadcastMode]);

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev;
      const targetVol = next ? 0 : volume;
      const targetDucked = next ? 0 : Math.max(0.24, Math.min(0.36, volume * 0.30));
      const newVol = isDropPlayingRef.current ? targetDucked : targetVol;
      if (audioRef.current) {
        audioRef.current.volume = newVol;
      }
      if (preloadAudioRef.current && activeDeckRef.current === "B") {
        preloadAudioRef.current.volume = newVol;
      }
      if (dropAudioRef.current) {
        dropAudioRef.current.volume = next ? 0 : volume;
      }
      return next;
    });
  }, [volume]);

  const setVolume = useCallback((v: number) => {
    const clamped = Math.max(0, Math.min(1, v));
    setVolumeState(clamped);
    setIsMuted(false);
    const newVol = isDropPlayingRef.current ? Math.max(0.24, Math.min(0.36, clamped * 0.30)) : clamped;
    if (audioRef.current) {
      audioRef.current.volume = newVol;
    }
    if (preloadAudioRef.current && activeDeckRef.current === "B") {
      preloadAudioRef.current.volume = newVol;
    }
    if (dropAudioRef.current) {
      dropAudioRef.current.volume = clamped;
    }
  }, []);

  const toggleMinimized = useCallback(() => {
    setIsMinimized((prev) => !prev);
  }, []);

  const switchQuality = useCallback((q: AudioQuality) => {
    setQuality(q);
    qualityRef.current = q;
    try {
      localStorage.setItem(QUALITY_KEY, q);
    } catch {}

    // If currently playing live stream, seamlessly switch audio stream URL
    if (isPlayingRef.current && liveActiveRef.current) {
      attachAndPlayLiveStream({ force: true });
      return;
    }

    if (audioRef.current && isPlayingRef.current && isLiveRef.current) {
      const rawUrl = liveStreamUrlRef.current;
      const targetUrl = resolveLiveStreamUrl(rawUrl, q);
      if (targetUrl && audioRef.current.src !== targetUrl) {
        audioRef.current.src = targetUrl;
        audioRef.current.play().catch((err) => {
          console.warn("[RadioContext] Error switching live stream bitrate:", err);
        });
      }
    }
  }, [attachAndPlayLiveStream]);

  const switchToLive = useCallback(() => {
    setActivePlaylist(null);
    activePlaylistRef.current = null;
    setIsLive(true);
    attachAndPlayLiveStream();
  }, [attachAndPlayLiveStream]);

  const switchToCurated = useCallback(() => {
    setIsLive(false);
    startBackupMix();
  }, [startBackupMix]);

  // Vault set on-demand playback
  const playSet = useCallback(
    (set: RadioSet) => {
      primeAudioPipeline();
      teardownPlayback();
      setActivePlaylist(null);
      activePlaylistRef.current = null;
      setIsLive(false);
      setEngineState("live");
      setIsPlaying(true);
      notifyOtherTabsPlay();

      const playUrl = (set as any).playback_url || set.audio_url;
      setNowPlayingTrack({
        title: formatTrackTitle(set.title),
        artist: set.dj_name,
        thumbnail: set.cover_url || "/flyer.png",
        elapsed: 0,
        duration: set.duration_sec || 0,
        audio_url: playUrl,
        playback_url: (set as any).playback_url,
        video_id: `vault-${set.id}`,
      });
      setInterpolatedElapsed(0);
      lastPollElapsedRef.current = 0;
      lastPollTimestampRef.current = Date.now();

      if (audioRef.current && playUrl) {
        if (audioRef.current.src !== playUrl) {
          audioRef.current.src = playUrl;
        }
        audioRef.current.play().catch(() => setEngineState("error"));
      }
    },
    [teardownPlayback, primeAudioPipeline]
  );

  // Curated Playlist on-demand playback
  const playPlaylist = useCallback(
    async (playlistId: number, startTrackIndex = 0) => {
      primeAudioPipeline();
      try {
        teardownPlayback();
        const res = await fetch(`/api/radio/playlists/${playlistId}`);
        if (!res.ok) throw new Error("Failed to load playlist");
        const data = await res.json();
        if (!data.success || !Array.isArray(data.tracks) || data.tracks.length === 0) {
          throw new Error("Empty playlist or playlist not found");
        }

        const playlistTracks: RadioSet[] = data.tracks.map((t: any) => ({
          id: t.id,
          event_id: t.event_id || 0,
          title: t.title,
          dj_name: t.dj_name || data.playlist.name,
          audio_url: t.audio_url,
          audio_high_url: t.audio_high_url || null,
          cover_url: t.cover_url || data.playlist.cover_url || "/flyer.png",
          duration: t.duration || "0:00",
          duration_sec: t.duration_sec || 180,
          genre: t.genre || data.playlist.genre || "Amapiano",
          bitrate: t.bitrate || 192,
          is_active: true,
        }));

        const safeIndex = Math.max(0, Math.min(startTrackIndex, playlistTracks.length - 1));
        const selectedTrack = playlistTracks[safeIndex];

        const plInfo: ActivePlaylist = {
          id: data.playlist.id,
          name: data.playlist.name,
          slug: data.playlist.slug,
          description: data.playlist.description,
          cover_url: data.playlist.cover_url,
          genre: data.playlist.genre,
          trackIndex: safeIndex,
          tracks: playlistTracks,
        };

        setActivePlaylist(plInfo);
        activePlaylistRef.current = plInfo;
        setBackupSets(playlistTracks);
        setCurrentBackupIndex(safeIndex);

        setIsLive(false);
        setEngineState("live");
        setIsPlaying(true);
        notifyOtherTabsPlay();

        const trackVideoId = `pl-${data.playlist.id}-${selectedTrack.id}`;
        const selectedSrc = selectedTrack.playback_url || selectedTrack.audio_url;
        setNowPlayingTrack({
          title: formatTrackTitle(selectedTrack.title),
          artist: selectedTrack.dj_name,
          thumbnail: selectedTrack.cover_url,
          elapsed: 0,
          duration: selectedTrack.duration_sec || 180,
          audio_url: selectedSrc,
          playback_url: selectedTrack.playback_url,
          video_id: trackVideoId,
        });
        currentTrackIdRef.current = trackVideoId;
        setInterpolatedElapsed(0);
        lastPollElapsedRef.current = 0;
        lastPollTimestampRef.current = Date.now();

        // Queue next tracks from playlist
        const upcomingQueue = [
          playlistTracks[(safeIndex + 1) % playlistTracks.length],
          playlistTracks[(safeIndex + 2) % playlistTracks.length],
          playlistTracks[(safeIndex + 3) % playlistTracks.length],
        ]
          .filter(Boolean)
          .map((t) => ({
            id: t.id,
            video_id: `pl-${data.playlist.id}-${t.id}`,
            title: formatTrackTitle(t.title),
            artist: t.dj_name,
            duration: t.duration_sec || 180,
            thumbnail: t.cover_url,
          }));
        setUpNextQueue(upcomingQueue);

        if (audioRef.current && selectedSrc) {
          if (audioRef.current.src !== selectedSrc) {
            audioRef.current.src = selectedSrc;
          }
          audioRef.current.currentTime = 0;
          audioRef.current.volume = isMutedRef.current ? 0 : volumeRef.current;
          await audioRef.current.play();
        }
      } catch (err) {
        console.error("[RadioContext] playPlaylist error:", err);
        setEngineState("error");
      }
    },
    [teardownPlayback, primeAudioPipeline]
  );

  const snapToBroadcast = useCallback(() => {
    switchToLive();
  }, [switchToLive]);

  // Vault Next Track Preloader (strictly inert in live mode, mobile data conservation)
  useEffect(() => {
    if (!isPlaying || isLiveRef.current || backupSets.length <= 1) return;
    const currentDur = backupSets[currentBackupIndex]?.duration_sec || 180;
    const timeLeft = currentDur - interpolatedElapsed;
    if (timeLeft > 20 || timeLeft <= 0) return;
    const nextIdx = (currentBackupIndex + 1) % backupSets.length;
    const nextTrack = backupSets[nextIdx];
    if (!nextTrack) return;
    if (!preloadAudioRef.current) preloadAudioRef.current = new Audio();
    preloadAudioRef.current.preload = "auto";
    const nextTrackSrc = resolveAudioSource(nextTrack);
    if (nextTrackSrc && preloadAudioRef.current.src !== nextTrackSrc) {
      preloadAudioRef.current.src = nextTrackSrc;
      preloadAudioRef.current.load();
    }
  }, [isPlaying, interpolatedElapsed, currentBackupIndex, backupSets]);

  // Advance broadcast track cleanly (handles manual skip button or automated jump)
  const advanceBroadcastTrack = useCallback((isManualSkip = false) => {
    if (broadcastModeRef.current === "live" || liveActiveRef.current) {
      console.warn("[Radio:Live] Suppressed advanceBroadcastTrack: Station is in Live DJ mode");
      return;
    }
    if (backupSets.length === 0) return;
    if (!isSyncedRef.current) return;

    const audio = audioRef.current;
    const dropAudio = dropAudioRef.current;

    // If DJ decides to manually skip track, choke any drop immediately so no drop airs
    if (isManualSkip) {
      console.log("[RadioContext] ⏭️ Manual track skip: chocking active drops and bypassing talkover drop");
      if (dropAudio) {
        dropAudio.pause();
        dropAudio.currentTime = 0;
      }
      dropAudioQueueRef.current = [];
      isDropPlayingRef.current = false;
      setIsDropPlaying(false);
      setActiveDropTitle(null);
      setActivePersona(null);
      setActiveMood(null);
      hasFiredOutroDropRef.current = false;
    }

    const nextIdx = (currentBackupIndex + 1) % backupSets.length;
    setCurrentBackupIndex(nextIdx);
    if (activePlaylistRef.current) {
      setActivePlaylist({ ...activePlaylistRef.current, trackIndex: nextIdx });
    }
    const track = backupSets[nextIdx];
    if (audio && track) {
      // Discard any prefetched drops that were targeted for the old skipped track
      availableDropsRef.current = availableDropsRef.current.filter(
        (d) => !d.target_track_id || String(d.target_track_id) === String(track.id)
      );

      const trackVideoId = activePlaylistRef.current
        ? `pl-${activePlaylistRef.current.id}-${track.id}`
        : `set-${track.id}`;

      const trackSrc = track.playback_url || track.audio_url;
      setNowPlayingTrack({
        title: formatTrackTitle(track.title),
        artist: track.dj_name,
        thumbnail: track.cover_url,
        elapsed: 0,
        duration: track.duration_sec || 180,
        audio_url: trackSrc,
        playback_url: track.playback_url,
        video_id: trackVideoId,
      });
      currentTrackIdRef.current = trackVideoId;
      setInterpolatedElapsed(0);
      lastPollElapsedRef.current = 0;
      lastPollTimestampRef.current = Date.now();

      // Immediately update Up Next Queue so UI displays the truth
      const upcomingQueue = [
        backupSets[(nextIdx + 1) % backupSets.length],
        backupSets[(nextIdx + 2) % backupSets.length],
        backupSets[(nextIdx + 3) % backupSets.length],
      ].filter(Boolean).map((t) => ({
        id: t.id,
        video_id: activePlaylistRef.current ? `pl-${activePlaylistRef.current.id}-${t.id}` : `set-${t.id}`,
        title: formatTrackTitle(t.title),
        artist: t.dj_name,
        duration: t.duration_sec || 180,
        thumbnail: t.cover_url,
      }));
      setUpNextQueue(upcomingQueue);

      if (trackSrc && audio.src !== trackSrc) {
        audio.src = trackSrc;
      }
      audio.currentTime = 0;
      audio.volume = isMutedRef.current ? 0 : volumeRef.current;
      audio.play().catch(() => {});
    }
  }, [backupSets, currentBackupIndex]);

  const nextTrack = useCallback(() => {
    advanceBroadcastTrack(true); // manual skip -> NO drop!
  }, [advanceBroadcastTrack]);

  const prevTrack = useCallback(() => {
    if (backupSets.length === 0) return;
    const prevIdx = (currentBackupIndex - 1 + backupSets.length) % backupSets.length;
    setCurrentBackupIndex(prevIdx);
    if (activePlaylistRef.current) {
      setActivePlaylist({ ...activePlaylistRef.current, trackIndex: prevIdx });
    }
    const track = backupSets[prevIdx];
    if (audioRef.current && track) {
      const trackVideoId = activePlaylistRef.current
        ? `pl-${activePlaylistRef.current.id}-${track.id}`
        : `set-${track.id}`;

      const prevTrackSrc = track.playback_url || track.audio_url;
      setNowPlayingTrack({
        title: formatTrackTitle(track.title),
        artist: track.dj_name,
        thumbnail: track.cover_url,
        elapsed: 0,
        duration: track.duration_sec || 180,
        audio_url: prevTrackSrc,
        playback_url: track.playback_url,
        video_id: trackVideoId,
      });
      currentTrackIdRef.current = trackVideoId;
      setInterpolatedElapsed(0);
      lastPollElapsedRef.current = 0;
      lastPollTimestampRef.current = Date.now();

      if (prevTrackSrc && audioRef.current.src !== prevTrackSrc) {
        audioRef.current.src = prevTrackSrc;
      }
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(() => {});
    }
  }, [backupSets, currentBackupIndex]);

  const seek = useCallback((percent: number) => {
    const activeAudio = activeDeckRef.current === "A" ? audioRef.current : preloadAudioRef.current;
    if (!activeAudio || isLiveRef.current) return;
    const dur = activeAudio.duration;
    if (dur && !isNaN(dur) && dur > 0) {
      const targetTime = (Math.max(0, Math.min(100, percent)) / 100) * dur;
      activeAudio.currentTime = targetTime;
      setInterpolatedElapsed(targetTime);
    }
  }, []);

  useEffect(() => {
    seekDispatcherRef.current = (percent: number) => {
      seek(percent);
    };
  }, [seek]);

  // Format honest status text
  const statusText = useMemo(() => {
    switch (engineState) {
      case "live":
        return isStale ? "LIVE (STALE)" : "LIVE";
      case "connecting":
        return "CONNECTING...";
      case "buffering":
        return "BUFFERING...";
      case "reconnecting":
        return "RECONNECTING...";
      case "backup-mix":
        return "BACKUP MIX";
      case "paused":
        return "PAUSED";
      case "offline":
        return "OFFLINE";
      case "error":
        return "STREAM ERROR";
      default:
        return "IDLE";
    }
  }, [engineState, isStale]);

  // Derived display values: while a station drop airs, display the drop metadata
  const displayTitle = isDropPlaying && activeDropTitle
    ? activeDropTitle
    : broadcastMode === "live"
    ? (nowPlayingTrack?.title || (nowPlayingTrack as any)?.live_title || "GOODLIFE RADIO LIVE - ON AIR TAKEOVER")
    : formatTrackTitle(nowPlayingTrack?.title || backupSets[0]?.title);
  const displayArtist = isDropPlaying && activePersona
    ? activePersona
    : broadcastMode === "live"
    ? (nowPlayingTrack?.artist || "ADMIN MASTER HARBOR / LIVE DJ")
    : (nowPlayingTrack?.artist || backupSets[0]?.dj_name || null);
  const displayCover = resolveCoverArt(
    broadcastMode === "live"
      ? (nowPlayingTrack?.thumbnail || onAirSlot?.presenter?.avatar_url || "/flyer.png")
      : (nowPlayingTrack?.thumbnail || backupSets[0]?.cover_url)
  );
  const displayThought = nowPlayingTrack?.thought && nowPlayingTrack.thought.trim() !== "" ? nowPlayingTrack.thought.trim() : null;
  const displayDaypart = nowPlayingTrack?.daypart && nowPlayingTrack.daypart.trim() !== "" ? nowPlayingTrack.daypart.trim() : null;
  const totalDuration = nowPlayingTrack?.duration && nowPlayingTrack.duration > 0 ? nowPlayingTrack.duration : 0;
  const hasValidProgress = totalDuration > 0 && interpolatedElapsed >= 0;
  const progressPercent = hasValidProgress ? Math.min(100, (interpolatedElapsed / totalDuration) * 100) : 0;
  const searchLinks = useMemo(() => buildSongSearchUrls(displayTitle, displayArtist), [displayTitle, displayArtist]);
  const currentSet = backupSets[currentBackupIndex] || null;

  const handleEnded = useCallback(
    (deck: "A" | "B") => {
      // Ignore ended events from the inactive/faded-out deck or during crossfade
      if (deck !== activeDeckRef.current) return;
      if (isCrossfadingRef.current) return;

      if (liveActiveRef.current || broadcastModeRef.current === "live") {
        console.warn("[Radio:Live] Audio element ended during live mode, triggering stream reconnect");
        if (recoverLiveRef.current) recoverLiveRef.current("ended");
        return;
      }

      sendPlayBeaconOnce(true);
      hasFiredOutroDropRef.current = false;
      hasFiredAutoDjCrossfadeRef.current = false;

      if (isLiveRef.current) {
        // Gapless live auto-advance: start next track immediately even under an active outro drop (audible ducked bed!)
        let nextTrackCandidate: any = (upNextQueue && upNextQueue.length > 0) ? upNextQueue[0] : null;
        if (!(nextTrackCandidate?.playback_url || nextTrackCandidate?.audio_url) && backupSetsRef.current.length > 0) {
          const rawEndedId = currentTrackIdRef.current || "";
          const cleanEndedId = rawEndedId.replace(/^(set-|vault-|pl-\d+-)/, "");
          const sets = backupSetsRef.current;
          const curIdx = sets.findIndex(
            (s) => String(s.id) === cleanEndedId
          );
          const nIdx = curIdx !== -1 ? (curIdx + 1) % sets.length : 0;
          if (sets[nIdx]?.playback_url || sets[nIdx]?.audio_url) {
            nextTrackCandidate = sets[nIdx];
          }
        }

        if (nextTrackCandidate && (nextTrackCandidate.playback_url || nextTrackCandidate.audio_url) && executeCrossfadeRef.current) {
          executeCrossfadeRef.current(nextTrackCandidate, { fast: false });
          setNowPlayingTrack({
            ...nextTrackCandidate,
            title: formatTrackTitle(nextTrackCandidate.title),
            elapsed: 0,
            duration: nextTrackCandidate.duration_sec || nextTrackCandidate.duration || 180,
          });
          currentTrackIdRef.current = nextTrackCandidate.video_id || `set-${nextTrackCandidate.id}`;
          setInterpolatedElapsed(0);
          lastPollElapsedRef.current = 0;
          lastPollTimestampRef.current = Date.now();
          setUpNextQueue((prev) => (prev.length > 0 && prev[0].id === nextTrackCandidate.id ? prev.slice(1) : prev));
        }
        fetchRadioLive();
      } else {
        playDropAndAdvance();
      }
    },
    [upNextQueue, fetchRadioLive, playDropAndAdvance]
  );

  // 14. 3-Track Browser Cache Preloader
  // Automatically warms audio buffers for the next 3 upcoming tracks in the queue so transitions are 0ms instant
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (broadcastMode === "live") return;
    const urlsToPreload: string[] = [];

    // 1. Collect from Up Next queue
    if (Array.isArray(upNextQueue) && upNextQueue.length > 0) {
      for (let i = 0; i < Math.min(3, upNextQueue.length); i++) {
        const item = upNextQueue[i] as any;
        const src = item?.playback_url || item?.audio_url;
        if (src && !urlsToPreload.includes(src)) {
          urlsToPreload.push(src);
        }
      }
    }

    // 2. Collect from catalog / backup sets if queue is short
    if (urlsToPreload.length < 3 && backupSets.length > 0) {
      const rawId = currentTrackIdRef.current || "";
      const cleanId = rawId.replace(/^(set-|vault-|pl-\d+-)/, "");
      let curIdx = backupSets.findIndex((s) => String(s.id) === cleanId);
      if (curIdx === -1) curIdx = 0;
      for (let i = 1; i <= 3 && urlsToPreload.length < 3; i++) {
        const track = backupSets[(curIdx + i) % backupSets.length];
        const src = track?.playback_url || track?.audio_url;
        if (src && !urlsToPreload.includes(src)) {
          urlsToPreload.push(src);
        }
      }
    }

    // Warm standby audio deck with immediate upcoming track when playing deck is healthy or near track end
    if (urlsToPreload[0]) {
      const activeAudio = activeDeckRef.current === "A" ? audioRef.current : preloadAudioRef.current;
      const standby = activeDeckRef.current === "A" ? preloadAudioRef.current : audioRef.current;

      // Check if current deck is buffered ahead sufficiently (> 15s) or near transition (< 25s remaining)
      let shouldWarmStandby = !isPlaying; // if paused, warming is fine
      if (activeAudio && isPlaying) {
        const cur = activeAudio.currentTime || 0;
        const dur = activeAudio.duration || (nowPlayingTrack?.duration_sec || 180);
        const remaining = dur - cur;

        let forwardBuffered = 0;
        try {
          for (let i = 0; i < activeAudio.buffered.length; i++) {
            if (activeAudio.buffered.start(i) <= cur && cur <= activeAudio.buffered.end(i)) {
              forwardBuffered = activeAudio.buffered.end(i) - cur;
              break;
            }
          }
        } catch {}

        // Allow standby preload if active deck has >= 10s buffered, or remaining track time is <= 45s
        // (45s gives ample runway to buffer the upcoming track before the 3.5s crossfade point)
        if (forwardBuffered >= 10 || remaining <= 45) {
          shouldWarmStandby = true;
        }
      }

      if (shouldWarmStandby && standby && standby.paused && !isCrossfadingRef.current && standby.src !== urlsToPreload[0]) {
        standby.preload = "auto";
        standby.src = urlsToPreload[0];
        standby.load();
      }
    }

    // Warm tracks 2 & 3 via <link rel="prefetch"> in document head (only on unconstrained connections)
    const conn = typeof navigator !== "undefined" ? (navigator as any).connection : null;
    const isSaveData = conn?.saveData || conn?.effectiveType === "2g" || conn?.effectiveType === "slow-2g";
    if (!isSaveData) {
      for (let i = 1; i < urlsToPreload.length; i++) {
        const url = urlsToPreload[i];
        if (!url) continue;
        const existing = document.querySelector(`link[data-gl-preload="${url}"]`);
        if (!existing) {
          const link = document.createElement("link");
          link.rel = "prefetch";
          link.href = url;
          link.dataset.glPreload = url;
          document.head.appendChild(link);
        }
      }
    }
  }, [upNextQueue, backupSets, nowPlayingTrack?.video_id, broadcastMode, isPlaying, interpolatedElapsed]);

  return (
    <RadioContext.Provider
      value={{
        engineState,
        isPlaying,
        isLive,
        broadcastMode,
        statusText,
        title: displayTitle,
        artist: displayArtist,
        coverUrl: displayCover,
        thought: displayThought,
        daypart: displayDaypart,
        elapsed: Math.round(interpolatedElapsed),
        duration: totalDuration,
        currentTime: Math.round(interpolatedElapsed),
        progress: progressPercent,
        progressPercent,
        hasValidProgress,
        searchLinks,
        queue: backupSets,
        upNext: upNextQueue,
        history: historyList,
        streamTargetDurationSec: targetDurationSec,
        isStale,
        volume,
        isMuted,
        isMinimized,
        quality,
        radioEnabled,
        backupSets,
        currentSet,
        onAirSlot,
        isSyncedToBroadcast: engineState === "live" || engineState === "buffering",
        liveTitle: displayTitle,
        liveDropFallback: engineState === "backup-mix",
        hasLoaded,
        activeDropTitle,
        activePersona,
        activeMood,
        isDropPlaying,
        isDropUnlocked,
        unlockStationVoice,
        activePlaylist,
        togglePlay,
        retry,
        toggleMute,
        setVolume,
        toggleMinimized,
        switchQuality,
        switchToLive,
        switchToCurated,
        playSet,
        playPlaylist,
        snapToBroadcast,
        nextTrack,
        prevTrack,
        seek,
        airLiveDrop,
        setManualDucking,
        fetchRadioState,
        fetchRadioLive,
        playImmediateBroadcastTrack,
      }}
    >
      {children}

      {/* Global Deck A Audio Element */}
      <audio
        ref={audioRef}
        onTimeUpdate={() => handleTimeUpdate("A")}
        onPlay={() => {
          if (liveActiveRef.current || broadcastModeRef.current === "live") {
            // Live stream plays on Deck A; ensure Deck B is paused
            try { preloadAudioRef.current?.pause(); } catch {}
          } else if (!isCrossfadingRef.current && activeDeckRef.current === "B") {
            // If Deck A starts playing outside of crossfade while Deck B is active, Deck B should not compete
            try { preloadAudioRef.current?.pause(); } catch {}
          } else if (!isCrossfadingRef.current && activeDeckRef.current === "A") {
            // Guarantee Deck B is paused
            try { preloadAudioRef.current?.pause(); } catch {}
          }
          console.debug("[Radio:Playback]", { timestamp: new Date().toISOString(), deck: "A", src: audioRef.current?.src, mode: broadcastModeRef.current, isLive: liveActiveRef.current });
          if (activeDeckRef.current === "A") {
            setIsPlaying(true);
          }
          if (audioRef.current) audioRef.current.preload = "auto";
        }}
        onPlaying={() => {
          hasStartedPlayingRef.current.A = true;
          if (trackLoadTimingRef.current && trackLoadTimingRef.current.deck === "A") {
            trackLoadTimingRef.current.playingAt = performance.now();
            const totalMs = Math.round(trackLoadTimingRef.current.playingAt - trackLoadTimingRef.current.srcSetAt);
            console.info("[Radio:Timing] Deck A time-to-first-sound:", {
              src: trackLoadTimingRef.current.src,
              targetSeek: trackLoadTimingRef.current.targetSeek,
              actualCurrentTime: audioRef.current?.currentTime,
              totalTimeToSoundMs: totalMs,
              metadataLagMs: trackLoadTimingRef.current.loadedMetadataAt ? Math.round(trackLoadTimingRef.current.loadedMetadataAt - trackLoadTimingRef.current.srcSetAt) : null,
              canPlayLagMs: trackLoadTimingRef.current.canPlayAt ? Math.round(trackLoadTimingRef.current.canPlayAt - trackLoadTimingRef.current.srcSetAt) : null,
              nudgesEncountered: trackLoadTimingRef.current.nudges,
            });
          }
          console.debug("[Radio:Playing]", { timestamp: new Date().toISOString(), deck: "A", src: audioRef.current?.src, currentTime: audioRef.current?.currentTime });
          if (activeDeckRef.current === "A") {
            stallNudgeCountRef.current = 0;
            if (waitingDebounceTimerRef.current) {
              clearTimeout(waitingDebounceTimerRef.current);
              waitingDebounceTimerRef.current = null;
            }
            if (stallWatchdogRef.current) {
              clearTimeout(stallWatchdogRef.current);
              stallWatchdogRef.current = null;
            }
            setEngineState("live");
          }
        }}
        onWaiting={() => {
          console.debug("[Radio:Waiting]", { timestamp: new Date().toISOString(), deck: "A", src: audioRef.current?.src, isLive: liveActiveRef.current || broadcastModeRef.current === "live" });
          if (activeDeckRef.current !== "A" || !isPlayingRef.current || isCrossfadingRef.current) return;
          if (liveActiveRef.current || broadcastModeRef.current === "live") {
            if (waitingDebounceTimerRef.current) clearTimeout(waitingDebounceTimerRef.current);
            waitingDebounceTimerRef.current = setTimeout(() => {
              if (isPlayingRef.current && (liveActiveRef.current || broadcastModeRef.current === "live")) {
                setEngineState("buffering");
              }
            }, 600);
            return;
          }

          if (waitingDebounceTimerRef.current) clearTimeout(waitingDebounceTimerRef.current);
          waitingDebounceTimerRef.current = setTimeout(() => {
            if (isPlayingRef.current && !isCrossfadingRef.current) {
              setEngineState("buffering");
            }
          }, 800);

          // Grace period: Use 12s on initial connect/seek before first sound, 3.5s for mid-track stalls
          const isInitialBuffering = !hasStartedPlayingRef.current.A;
          const watchdogTimeoutMs = isInitialBuffering ? 12000 : 3500;

          if (stallWatchdogRef.current) clearTimeout(stallWatchdogRef.current);
          stallWatchdogRef.current = setTimeout(() => {
            if (audioRef.current && isPlayingRef.current && (audioRef.current.paused || audioRef.current.readyState < 3)) {
              // If the browser has already buffered ahead, give it time instead of disrupting the stream
              const cur = audioRef.current.currentTime || 0;
              let forwardBuffered = 0;
              try {
                for (let i = 0; i < audioRef.current.buffered.length; i++) {
                  if (audioRef.current.buffered.start(i) <= cur && cur <= audioRef.current.buffered.end(i)) {
                    forwardBuffered = audioRef.current.buffered.end(i) - cur;
                    break;
                  }
                }
              } catch {}

              // If actively downloading or buffered > 1s, don't interrupt with seek
              if (forwardBuffered > 1.0) {
                audioRef.current.play().then(() => setEngineState("live")).catch(() => {});
                return;
              }

              // Guard against endless stall nudging (max 2 nudges before failing forward)
              if (stallNudgeCountRef.current >= 2) {
                console.warn("[Radio:Stall] Deck A exceeded maximum stall nudges, advancing track");
                stallNudgeCountRef.current = 0;
                advanceBroadcastTrack(false);
                return;
              }

              stallNudgeCountRef.current += 1;
              if (trackLoadTimingRef.current && trackLoadTimingRef.current.deck === "A") {
                trackLoadTimingRef.current.nudges += 1;
              }
              console.log("[Radio:Stall]", { timestamp: new Date().toISOString(), detail: `Deck A stall detected: attempting playback nudge (${stallNudgeCountRef.current}/2)`, isInitialBuffering });
              audioRef.current.currentTime = Math.max(0, audioRef.current.currentTime + 0.2);
              audioRef.current.play().then(() => {
                setEngineState("live");
              }).catch(() => {
                console.error("[Radio:Error]", { timestamp: new Date().toISOString(), error: "Deck A unrecoverable stall" });
                if (broadcastModeRef.current === "live" || liveActiveRef.current) {
                  if (recoverLiveRef.current) recoverLiveRef.current("waiting-stall");
                } else {
                  advanceBroadcastTrack(false);
                }
              });
            }
          }, watchdogTimeoutMs);
        }}
        onStalled={() => {
          if (liveActiveRef.current || broadcastModeRef.current === "live") return;
          if (activeDeckRef.current !== "A") return; // ignore background standby deck stalls
          console.debug("[Radio:Stalled]", { timestamp: new Date().toISOString(), deck: "A", src: audioRef.current?.src, mode: broadcastModeRef.current });
          if (activeDeckRef.current === "A" && isPlayingRef.current && !isCrossfadingRef.current) {
            if (!stallWatchdogRef.current) {
              stallWatchdogRef.current = setTimeout(() => {
                if (audioRef.current && isPlayingRef.current && (audioRef.current.paused || audioRef.current.readyState < 3)) {
                  console.debug("[Radio:Stall]", { timestamp: new Date().toISOString(), detail: "Deck A network stall, failing forward to next set" });
                  advanceBroadcastTrack(false);
                }
              }, 10000);
            }
          }
        }}
        onPause={() => {
          if (isReattachingRef.current) return;
          if (activeDeckRef.current === "A") {
            if (audioRef.current?.ended || isDropPlayingRef.current || isTransitioningRef.current || isCrossfadingRef.current) return;
            setIsPlaying(false);
          }
        }}
        onError={() => {
          const currentSrc = audioRef.current?.src || "";
          if (currentSrc.includes("youtube.com") || currentSrc.includes("youtu.be")) {
            return; // Suppress expected unsupported media error for YouTube video URLs on audio element
          }
          const mediaErr = audioRef.current?.error;
          console.error("[Radio:Error]", {
            timestamp: new Date().toISOString(),
            deck: "A",
            src: audioRef.current?.src,
            code: mediaErr?.code,
            message: mediaErr?.message,
            mode: broadcastModeRef.current,
            isLive: liveActiveRef.current,
          });
          if (!audioRef.current?.src || audioRef.current.src === "" || audioRef.current.src.startsWith("data:") || (typeof window !== "undefined" && audioRef.current.src === window.location.href)) {
            return;
          }
          if (liveActiveRef.current || broadcastModeRef.current === "live") {
            if (recoverLiveRef.current) recoverLiveRef.current("element-error");
            return;
          }
          if (activeDeckRef.current === "A" && !isCrossfadingRef.current) {
            console.debug("[RadioContext] 🛡️ Deck A error, attempting proxy recovery");
            if (currentTrackIdRef.current) {
              const cleanId = currentTrackIdRef.current.replace(/^(set-|vault-|pl-\d+-)/, "");
              const candidate = backupSetsRef.current.find((s) => String(s.id) === cleanId);
              if (candidate && audioRef.current) {
                const retrySrc = `/api/radio/audio/track/${encodeURIComponent(cleanId)}`;
                if (!areSameAudioSrc(audioRef.current.src, retrySrc)) {
                  audioRef.current.src = retrySrc;
                  audioRef.current.play().catch(() => {
                    console.debug("[RadioContext] 🛡️ Proxy failed, advancing to next set");
                    advanceBroadcastTrack(false);
                  });
                  return;
                }
              }
            }
            advanceBroadcastTrack(false);
          }
        }}
        onEnded={() => handleEnded("A")}
        preload="none"
        playsInline
      />

      {/* Global Deck B Audio Element (Seamless Dual-Deck Crossfade & Standby) */}
      <audio
        ref={preloadAudioRef}
        onTimeUpdate={() => handleTimeUpdate("B")}
        onPlay={() => {
          if (liveActiveRef.current || broadcastModeRef.current === "live") {
            console.debug("[Radio:Live] Deck B attempted to play during live mode: suppressing");
            try { preloadAudioRef.current?.pause(); } catch {}
            return;
          }
          if (!isCrossfadingRef.current && activeDeckRef.current === "A") {
            // Deck B started unexpectedly while Deck A is active and not crossfading; suppress Deck B
            console.debug("[Radio:Playout] Suppressing unexpected Deck B play while Deck A is active");
            try { preloadAudioRef.current?.pause(); } catch {}
            return;
          }
          if (!isCrossfadingRef.current && activeDeckRef.current === "B") {
            // Guarantee Deck A is paused so two decks never play simultaneously
            try { audioRef.current?.pause(); } catch {}
          }
          console.debug("[Radio:Playback]", { timestamp: new Date().toISOString(), deck: "B", src: preloadAudioRef.current?.src });
          if (activeDeckRef.current === "B") {
            setIsPlaying(true);
          }
          if (preloadAudioRef.current) preloadAudioRef.current.preload = "auto";
        }}
        onPlaying={() => {
          hasStartedPlayingRef.current.B = true;
          if (liveActiveRef.current || broadcastModeRef.current === "live") {
            try { preloadAudioRef.current?.pause(); } catch {}
            return;
          }
          console.debug("[Radio:Playing]", { timestamp: new Date().toISOString(), deck: "B", src: preloadAudioRef.current?.src });
          if (activeDeckRef.current === "B") {
            stallNudgeCountRef.current = 0;
            if (waitingDebounceTimerRef.current) {
              clearTimeout(waitingDebounceTimerRef.current);
              waitingDebounceTimerRef.current = null;
            }
            if (stallWatchdogRef.current) {
              clearTimeout(stallWatchdogRef.current);
              stallWatchdogRef.current = null;
            }
            setEngineState("live");
          }
        }}
        onWaiting={() => {
          if (liveActiveRef.current || broadcastModeRef.current === "live") {
            try { preloadAudioRef.current?.pause(); } catch {}
            return;
          }
          if (activeDeckRef.current !== "B") return; // ignore background standby waiting
          console.debug("[Radio:Waiting]", { timestamp: new Date().toISOString(), deck: "B", src: preloadAudioRef.current?.src });
          if (activeDeckRef.current === "B" && isPlayingRef.current && !isCrossfadingRef.current) {
            if (waitingDebounceTimerRef.current) clearTimeout(waitingDebounceTimerRef.current);
            waitingDebounceTimerRef.current = setTimeout(() => {
              if (isPlayingRef.current && !isCrossfadingRef.current) {
                setEngineState("buffering");
              }
            }, 1200);

            const isInitialBufferingB = !hasStartedPlayingRef.current.B;
            const watchdogTimeoutMsB = isInitialBufferingB ? 12000 : 3500;

            if (stallWatchdogRef.current) clearTimeout(stallWatchdogRef.current);
            stallWatchdogRef.current = setTimeout(() => {
              if (preloadAudioRef.current && isPlayingRef.current && (preloadAudioRef.current.paused || preloadAudioRef.current.readyState < 3)) {
                const cur = preloadAudioRef.current.currentTime || 0;
                let forwardBuffered = 0;
                try {
                  for (let i = 0; i < preloadAudioRef.current.buffered.length; i++) {
                    if (preloadAudioRef.current.buffered.start(i) <= cur && cur <= preloadAudioRef.current.buffered.end(i)) {
                      forwardBuffered = preloadAudioRef.current.buffered.end(i) - cur;
                      break;
                    }
                  }
                } catch {}

                if (forwardBuffered > 1.0) {
                  preloadAudioRef.current.play().then(() => setEngineState("live")).catch(() => {});
                  return;
                }

                if (stallNudgeCountRef.current >= 2) {
                  console.warn("[Radio:Stall] Deck B exceeded maximum stall nudges, advancing track");
                  stallNudgeCountRef.current = 0;
                  advanceBroadcastTrack(false);
                  return;
                }

                stallNudgeCountRef.current += 1;
                console.debug("[Radio:Stall]", { timestamp: new Date().toISOString(), detail: `Deck B stall detected: attempting playback nudge (${stallNudgeCountRef.current}/2)`, isInitialBuffering: isInitialBufferingB });
                preloadAudioRef.current.currentTime = Math.max(0, preloadAudioRef.current.currentTime + 0.2);
                preloadAudioRef.current.play().then(() => {
                  setEngineState("live");
                }).catch(() => {
                  console.error("[Radio:Error]", { timestamp: new Date().toISOString(), error: "Deck B unrecoverable stall, advancing to next set" });
                  advanceBroadcastTrack(false);
                });
              }
            }, watchdogTimeoutMsB);
          }
        }}
        onStalled={() => {
          if (liveActiveRef.current || broadcastModeRef.current === "live") return;
          if (activeDeckRef.current !== "B") return; // ignore background standby deck stalls
          console.debug("[Radio:Stalled]", { timestamp: new Date().toISOString(), deck: "B", src: preloadAudioRef.current?.src });
          if (activeDeckRef.current === "B" && isPlayingRef.current && !isCrossfadingRef.current) {
            if (!stallWatchdogRef.current) {
              stallWatchdogRef.current = setTimeout(() => {
                if (preloadAudioRef.current && isPlayingRef.current && (preloadAudioRef.current.paused || preloadAudioRef.current.readyState < 3)) {
                  console.debug("[Radio:Stall]", { timestamp: new Date().toISOString(), detail: "Deck B network stall, failing forward to next set" });
                  advanceBroadcastTrack(false);
                }
              }, 10000);
            }
          }
        }}
        onPause={() => {
          if (isReattachingRef.current) return;
          if (activeDeckRef.current === "B") {
            if (preloadAudioRef.current?.ended || isDropPlayingRef.current || isTransitioningRef.current || isCrossfadingRef.current) return;
            setIsPlaying(false);
          }
        }}
        onError={() => {
          if (liveActiveRef.current || broadcastModeRef.current === "live") return;
          const currentSrc = preloadAudioRef.current?.src || "";
          if (currentSrc.includes("youtube.com") || currentSrc.includes("youtu.be")) {
            return; // Suppress expected unsupported media error for YouTube video URLs on audio element
          }
          const mediaErr = preloadAudioRef.current?.error;
          console.error("[Radio:Error]", {
            timestamp: new Date().toISOString(),
            deck: "B",
            src: preloadAudioRef.current?.src,
            code: mediaErr?.code,
            message: mediaErr?.message,
          });
          if (!preloadAudioRef.current?.src || preloadAudioRef.current.src === "" || preloadAudioRef.current.src.startsWith("data:") || (typeof window !== "undefined" && preloadAudioRef.current.src === window.location.href)) {
            return;
          }
          if (activeDeckRef.current === "B" && !isCrossfadingRef.current) {
            console.debug("[RadioContext] 🛡️ Deck B error, attempting proxy recovery");
            if (currentTrackIdRef.current) {
              const cleanId = currentTrackIdRef.current.replace(/^(set-|vault-|pl-\d+-)/, "");
              const candidate = backupSetsRef.current.find((s) => String(s.id) === cleanId);
              if (candidate && preloadAudioRef.current) {
                const retrySrc = `/api/radio/audio/track/${encodeURIComponent(cleanId)}`;
                if (!areSameAudioSrc(preloadAudioRef.current.src, retrySrc)) {
                  preloadAudioRef.current.src = retrySrc;
                  preloadAudioRef.current.play().catch(() => {
                    console.debug("[RadioContext] 🛡️ Proxy failed, advancing to next set");
                    advanceBroadcastTrack(false);
                  });
                  return;
                }
              }
            }
            advanceBroadcastTrack(false);
          }
        }}
        onEnded={() => {
          if (liveActiveRef.current || broadcastModeRef.current === "live") return;
          handleEnded("B");
        }}
        preload="auto"
        playsInline
      />

      {/* Kept inert for drop/soundboard pipeline compatibility */}
      <audio ref={dropAudioRef} preload="auto" playsInline />
    </RadioContext.Provider>
  );
}

/**
 * useRadio hook: returns live radio state.
 * Returns safe inert state instead of throwing if outside provider or disabled.
 */
export function useRadio(): RadioContextType {
  const ctx = useContext(RadioContext);
  return ctx || INERT_RADIO_STATE;
}
