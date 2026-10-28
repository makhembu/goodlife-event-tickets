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

export interface RadioContextType {
  // Playback engine state machine
  engineState: RadioEngineState;
  isPlaying: boolean;
  isLive: boolean;
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

  // User Actions
  togglePlay: () => void;
  retry: () => void;
  toggleMute: () => void;
  setVolume: (v: number) => void;
  toggleMinimized: () => void;
  switchQuality: (q: AudioQuality) => void;
  switchToLive: () => void;
  switchToCurated: () => void;
  playSet: (set: RadioSet) => void;
  snapToBroadcast: () => void;
  nextTrack: () => void;
  prevTrack: () => void;
  seek: (percent: number) => void;
  fetchRadioState: () => Promise<void>;
  fetchRadioLive: () => Promise<void>;
}

// Safe inert default state returned when radio is disabled, unconfigured, or outside provider.
// Guarantees useRadio() NEVER throws, preventing any other page on the site from crashing.
export const INERT_RADIO_STATE: RadioContextType = {
  engineState: "offline",
  isPlaying: false,
  isLive: true,
  statusText: "Offline",
  title: "Updating...",
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
  liveTitle: "Updating...",
  liveDropFallback: false,
  hasLoaded: true,
  activeDropTitle: null,
  activePersona: null,
  activeMood: null,
  isDropPlaying: false,
  togglePlay: () => {},
  retry: () => {},
  toggleMute: () => {},
  setVolume: () => {},
  toggleMinimized: () => {},
  switchQuality: () => {},
  switchToLive: () => {},
  switchToCurated: () => {},
  playSet: () => {},
  snapToBroadcast: () => {},
  nextTrack: () => {},
  prevTrack: () => {},
  seek: () => {},
  fetchRadioState: async () => {},
  fetchRadioLive: async () => {},
};

const RadioContext = createContext<RadioContextType | null>(null);

const STORAGE_KEY = "gl_radio_state";
const QUALITY_KEY = "gl_audio_quality";
const CACHED_SETS_KEY = "gl_radio_cached_sets";

/**
 * Inert deterministic timeline math preserved strictly for historical vault set calculations.
 * Never called on the live stream path.
 */
export function computeLiveTimeline(setsList: RadioSet[]): { index: number; offsetSec: number } {
  if (!setsList || setsList.length === 0) return { index: 0, offsetSec: 0 };
  let totalDurationSec = 0;
  for (const s of setsList) {
    totalDurationSec += s.duration_sec && s.duration_sec > 0 ? s.duration_sec : 180;
  }
  if (totalDurationSec === 0) return { index: 0, offsetSec: 0 };
  const nowSec = Math.floor(Date.now() / 1000);
  const cycleSec = nowSec % totalDurationSec;
  let cumulative = 0;
  for (let i = 0; i < setsList.length; i++) {
    const dur = setsList[i].duration_sec && setsList[i].duration_sec > 0 ? setsList[i].duration_sec : 180;
    if (cumulative + dur > cycleSec) {
      return { index: i, offsetSec: cycleSec - cumulative };
    }
    cumulative += dur;
  }
  return { index: 0, offsetSec: 0 };
}

export function RadioProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // Runtime kill switch & configuration
  const [radioEnabled, setRadioEnabled] = useState(true);
  const [liveStreamUrl, setLiveStreamUrl] = useState<string>(
    process.env.RADIO_STREAM_URL || process.env.NEXT_PUBLIC_RADIO_STREAM_URL || ""
  );

  // Playback Engine State Machine
  const [engineState, setEngineState] = useState<RadioEngineState>("idle");
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLive, setIsLive] = useState(true);

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

  // Backup sets & vault
  const [backupSets, setBackupSets] = useState<RadioSet[]>([]);
  const [currentBackupIndex, setCurrentBackupIndex] = useState(0);
  const [hasLoaded, setHasLoaded] = useState(false);

  // Smooth local progress interpolation anchored at poll time
  const [interpolatedElapsed, setInterpolatedElapsed] = useState(0);
  const lastPollElapsedRef = useRef(0);
  const lastPollTimestampRef = useRef(0);

  // Refs for audio elements and HLS engine
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const preloadAudioRef = useRef<HTMLAudioElement | null>(null); // Kept inert for vault set preloading
  const dropAudioRef = useRef<HTMLAudioElement | null>(null);
  const hlsRef = useRef<any>(null);
  const broadcastChannelRef = useRef<BroadcastChannel | null>(null);

  // Stale-stream and stall detection refs
  const timingConfigRef = useRef(RADIO_TIMING);
  const stallTimerRef = useRef<NodeJS.Timeout | null>(null);
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
  const liveStreamUrlRef = useRef(liveStreamUrl);
  liveStreamUrlRef.current = liveStreamUrl;
  const radioEnabledRef = useRef(radioEnabled);
  radioEnabledRef.current = radioEnabled;
  const isLiveRef = useRef(isLive);
  isLiveRef.current = isLive;
  const isSyncedRef = useRef(true);

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

      if (data.live?.stream_url && typeof data.live.stream_url === "string") {
        setLiveStreamUrl(data.live.stream_url.trim());
      }

      if (Array.isArray(data.sets) && data.sets.length > 0) {
        setBackupSets(data.sets);
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

    isPollingRef.current = true;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3500);
      const res = await fetch("/api/radio/live", { signal: controller.signal });
      clearTimeout(timer);

      if (!res.ok) {
        throw new Error(`BFF responded with ${res.status}`);
      }

      const data: RadioLiveBffResponse = await res.json();

      if (data.offline) {
        setIsStale(Boolean(data.stale));
        if (engineStateRef.current === "live" || engineStateRef.current === "connecting") {
          handleStreamStall();
        }
        return;
      }

      setIsStale(Boolean(data.stale));
      if (data.target_duration_sec && data.target_duration_sec > 0) {
        setTargetDurationSec(data.target_duration_sec);
      }

      if (data.now_playing) {
        const track = data.now_playing;
        setNowPlayingTrack(track);

        // Track change detection: reset beacon and listened seconds
        const newTrackId = track.video_id || `${track.title}-${track.artist || ""}`;
        if (newTrackId && newTrackId !== currentTrackIdRef.current) {
          sendPlayBeaconOnce(false);
          currentTrackIdRef.current = newTrackId;
          secondsListenedRef.current = 0;
          hasSentBeaconRef.current = false;
        }

        // Anchor local progress interpolation
        if (typeof track.elapsed === "number" && typeof track.duration === "number" && track.duration > 0) {
          lastPollElapsedRef.current = track.elapsed;
          lastPollTimestampRef.current = Date.now();
          setInterpolatedElapsed(track.elapsed);
        }
      }

      if (Array.isArray(data.up_next)) {
        setUpNextQueue(data.up_next);
      }
      if (Array.isArray(data.history)) {
        setHistoryList(data.history);
      }

      // Reset poll backoff on successful response
      pollBackoffMsRef.current = timingConfigRef.current.metadataPollIntervalMs;
    } catch (err) {
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
      const shouldPoll =
        radioEnabled &&
        (isOnRadioPage || isPlaying) &&
        typeof document !== "undefined" &&
        document.visibilityState === "visible";

      if (!shouldPoll) {
        // Pause polling until resumed
        return;
      }

      pollTimerRef.current = setTimeout(async () => {
        await fetchRadioLive();
        scheduleNextPoll();
      }, pollBackoffMsRef.current);
    };

    const isOnRadioPage = pathname?.startsWith("/radio");
    const shouldActivate = radioEnabled && (isOnRadioPage || isPlaying);

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

  // 5. Smooth Local Progress Interpolation (Between 10s polls)
  useEffect(() => {
    if (!isPlaying || !nowPlayingTrack?.duration || nowPlayingTrack.duration <= 0) {
      return;
    }

    const interval = setInterval(() => {
      if (!lastPollTimestampRef.current) return;
      const secondsSincePoll = (Date.now() - lastPollTimestampRef.current) / 1000;
      const current = lastPollElapsedRef.current + secondsSincePoll;
      const clamped = Math.min(current, nowPlayingTrack.duration || current);
      setInterpolatedElapsed(clamped);

      // Track actual listening time
      secondsListenedRef.current += 1;
      if (secondsListenedRef.current >= 20 && !hasSentBeaconRef.current) {
        sendPlayBeaconOnce(false);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [isPlaying, nowPlayingTrack?.duration]);

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
      const activeBackup = backupSets.find((s) => String(s.id) === currentId);
      const setId = activeBackup ? activeBackup.id : 1; // Fallback to flagship station ID

      navigator.sendBeacon?.(
        "/api/radio/play-event",
        JSON.stringify({
          set_id: setId,
          seconds_listened: Math.round(secondsListenedRef.current),
          completed,
          quality,
        })
      );
      if (completed || secondsListenedRef.current >= 20) {
        hasSentBeaconRef.current = true;
      }
    } catch {}
  };

  // 8. Stream Teardown: Pause = Disconnect (Releases buffers, stops loading)
  const teardownPlayback = useCallback(() => {
    if (stallTimerRef.current) {
      clearTimeout(stallTimerRef.current);
      stallTimerRef.current = null;
    }
    if (backupProbeTimerRef.current) {
      clearTimeout(backupProbeTimerRef.current);
      backupProbeTimerRef.current = null;
    }

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
        audioRef.current.removeAttribute("src");
        audioRef.current.load();
      } catch {}
    }
  }, []);

  // 9. Stale Stream & Reconnect -> Backup Mix Failover Pipeline
  const handleStreamStall = useCallback(() => {
    if (engineStateRef.current === "reconnecting" || engineStateRef.current === "backup-mix") {
      return;
    }

    setEngineState("reconnecting");

    // Start timer derived from target duration to failover to backup mix
    if (stallTimerRef.current) clearTimeout(stallTimerRef.current);
    stallTimerRef.current = setTimeout(() => {
      if (engineStateRef.current === "reconnecting") {
        if (backupSets.length > 0) {
          startBackupMix();
        } else {
          // Reconnecting -> Error when stream is down and no backup library tracks exist
          setEngineState("error");
        }
      }
    }, timingConfigRef.current.backupMixThresholdMs);
  }, [backupSets.length]);

  const startBackupMix = useCallback(() => {
    setEngineState("backup-mix");
    if (backupSets.length === 0 || !audioRef.current) {
      setEngineState("error");
      return;
    }

    const backupTrack = backupSets[currentBackupIndex % backupSets.length];
    if (backupTrack) {
      audioRef.current.src = backupTrack.audio_url;
      audioRef.current
        .play()
        .then(() => setIsPlaying(true))
        .catch(() => setEngineState("error"));
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

  // 10. Live HLS Playback Engine (Native iOS + Dynamic hls.js)
  const attachAndPlayLiveStream = useCallback(async () => {
    const streamUrl = liveStreamUrlRef.current;

    if (!radioEnabledRef.current || !streamUrl || streamUrl.trim() === "") {
      setEngineState("offline");
      setIsPlaying(false);
      return;
    }

    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setEngineState("offline");
      setIsPlaying(false);
      return;
    }

    teardownPlayback();
    setEngineState("connecting");
    setIsLive(true);
    notifyOtherTabsPlay();

    const audio = audioRef.current;
    if (!audio) return;

    audio.volume = isMuted ? 0 : volume;

    // A. Native Safari / iOS HLS (canPlayType)
    if (audio.canPlayType("application/vnd.apple.mpegurl")) {
      audio.src = streamUrl;
      try {
        await audio.play();
        setEngineState("live");
        setIsPlaying(true);
      } catch (err: any) {
        console.warn("[RadioContext] iOS native play rejected:", err?.name);
        if (err?.name === "NotAllowedError") {
          // User gesture required or autoplay policy -> revert safely to idle
          setEngineState("idle");
          setIsPlaying(false);
        } else {
          handleStreamStall();
        }
      }
      return;
    }

    // B. Dynamic import of hls.js for Chrome / Firefox / Android
    try {
      const { default: Hls } = await import("hls.js");

      if (!Hls.isSupported()) {
        console.error("[RadioContext] HLS is not supported in this browser");
        setEngineState("error");
        return;
      }

      const hls = new Hls({
        lowLatencyMode: false, // Standard HLS (2.0s segments)
        enableWorker: true,
        backBufferLength: 8,
        liveSyncDurationCount: 3,
        liveMaxLatencyDurationCount: 6,
      });

      hls.loadSource(streamUrl);
      hls.attachMedia(audio);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        audio
          .play()
          .then(() => {
            setEngineState("live");
            setIsPlaying(true);
          })
          .catch((err: any) => {
            if (err?.name === "NotAllowedError") {
              setEngineState("idle");
              setIsPlaying(false);
            } else {
              handleStreamStall();
            }
          });
      });

      // Dynamically measure live edge latency on every HLS playlist refresh
      hls.on(Hls.Events.LEVEL_UPDATED, () => {
        if (typeof hls.latency === "number" && hls.latency > 0) {
          measuredLatencyRef.current = hls.latency;
        }
      });

      // Timed ID3 metadata extraction from HLS TS chunks
      hls.on(Hls.Events.FRAG_PARSING_METADATA, (_event: any, data: any) => {
        try {
          if (Array.isArray(data?.samples)) {
            for (const sample of data.samples) {
              // Parse ID3 text frames if present
              if (sample?.data) {
                const text = new TextDecoder("utf-8").decode(sample.data);
                const titleMatch = text.match(/TIT2[^\x00-\x1F]*([A-Za-z0-9\s·\-_,'()]+)/);
                const artistMatch = text.match(/TPE1[^\x00-\x1F]*([A-Za-z0-9\s·\-_,'()]+)/);
                if (titleMatch && titleMatch[1]) {
                  setNowPlayingTrack((prev) => ({
                    title: titleMatch[1].trim(),
                    artist: artistMatch && artistMatch[1] ? artistMatch[1].trim() : prev?.artist,
                    ...prev,
                  }));
                }
              }
            }
          }
        } catch {}
      });

      // Robust Error Recovery
      hls.on(Hls.Events.ERROR, (_event: any, data: any) => {
        if (!data?.fatal) return;

        switch (data.type) {
          case Hls.ErrorTypes.NETWORK_ERROR:
            console.warn("[RadioContext] HLS network error, attempting startLoad");
            hls.startLoad();
            handleStreamStall();
            break;
          case Hls.ErrorTypes.MEDIA_ERROR:
            const now = Date.now();
            if (now - mediaRecoverCooldownRef.current > 5000) {
              console.warn("[RadioContext] Recovering HLS media error");
              mediaRecoverCooldownRef.current = now;
              hls.recoverMediaError();
            } else {
              console.warn("[RadioContext] Fatal media error loop, failing over");
              handleStreamStall();
            }
            break;
          default:
            console.error("[RadioContext] Unrecoverable HLS fatal error");
            handleStreamStall();
            break;
        }
      });

      hlsRef.current = hls;
    } catch (err) {
      console.error("[RadioContext] Dynamic hls.js import failed:", err);
      setEngineState("error");
    }
  }, [handleStreamStall, teardownPlayback, volume, isMuted]);

  // 11. Stalled playback buffer watchdog (Only runs in 'live' state)
  const handleTimeUpdate = useCallback(() => {
    if (!audioRef.current) return;
    const cur = audioRef.current.currentTime;

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
  }, []);

  // 12. MediaSession API (Lockscreen & Bluetooth Controls)
  const togglePlayDispatcherRef = useRef<() => void>(() => {});
  useEffect(() => {
    togglePlayDispatcherRef.current = () => togglePlay();
  });

  useEffect(() => {
    if (typeof window === "undefined" || !("mediaSession" in navigator)) return;

    const displayTitle = formatTrackTitle(nowPlayingTrack?.title);
    const displayArtist = nowPlayingTrack?.artist || "GOODLIFE RADIO";
    const artworkUrl = resolveCoverArt(nowPlayingTrack?.thumbnail);

    navigator.mediaSession.metadata = new MediaMetadata({
      title: displayTitle,
      artist: displayArtist,
      album: "GOODLIFE Radio Live",
      artwork: [
        {
          src: artworkUrl,
          sizes: "320x180",
          type: "image/jpeg",
        },
      ],
    });

    // In live station mode, seek and skip controls are explicitly cleared
    navigator.mediaSession.setActionHandler("seekto", null);
    navigator.mediaSession.setActionHandler("seekforward", null);
    navigator.mediaSession.setActionHandler("seekbackward", null);
    navigator.mediaSession.setActionHandler("previoustrack", null);
    navigator.mediaSession.setActionHandler("nexttrack", null);

    navigator.mediaSession.setActionHandler("play", () => togglePlayDispatcherRef.current());
    navigator.mediaSession.setActionHandler("pause", () => togglePlayDispatcherRef.current());
  }, [nowPlayingTrack]);

  // 13. Public Control Actions
  const togglePlay = useCallback(() => {
    if (isPlaying) {
      teardownPlayback();
      setIsPlaying(false);
      setEngineState("paused");
    } else {
      setIsMinimized(false);
      fetchRadioState();
      fetchRadioLive();
      attachAndPlayLiveStream();
    }
  }, [isPlaying, attachAndPlayLiveStream, teardownPlayback]);

  const retry = useCallback(() => {
    attachAndPlayLiveStream();
  }, [attachAndPlayLiveStream]);

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev;
      if (audioRef.current) {
        audioRef.current.volume = next ? 0 : volume;
      }
      return next;
    });
  }, [volume]);

  const setVolume = useCallback((v: number) => {
    const clamped = Math.max(0, Math.min(1, v));
    setVolumeState(clamped);
    setIsMuted(false);
    if (audioRef.current) {
      audioRef.current.volume = clamped;
    }
  }, []);

  const toggleMinimized = useCallback(() => {
    setIsMinimized((prev) => !prev);
  }, []);

  const switchQuality = useCallback((q: AudioQuality) => {
    setQuality(q);
    try {
      localStorage.setItem(QUALITY_KEY, q);
    } catch {}
  }, []);

  const switchToLive = useCallback(() => {
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
      teardownPlayback();
      setIsLive(false);
      setEngineState("live");
      setIsPlaying(true);
      notifyOtherTabsPlay();

      if (audioRef.current) {
        audioRef.current.src = set.audio_url;
        audioRef.current.play().catch(() => setEngineState("error"));
      }
    },
    [teardownPlayback]
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
    if (preloadAudioRef.current.src !== nextTrack.audio_url) {
      preloadAudioRef.current.src = nextTrack.audio_url;
      preloadAudioRef.current.load();
    }
  }, [isPlaying, interpolatedElapsed, currentBackupIndex, backupSets]);

  // Kept for backward compatibility with vault player
  const advanceBroadcastTrack = useCallback(() => {
    if (backupSets.length === 0) return;
    if (!isSyncedRef.current) return;
    const nextIdx = (currentBackupIndex + 1) % backupSets.length;
    setCurrentBackupIndex(nextIdx);
    const track = backupSets[nextIdx];
    if (audioRef.current && track) {
      audioRef.current.src = track.audio_url;
      audioRef.current.play().catch(() => {});
    }
  }, [backupSets, currentBackupIndex]);

  const nextTrack = useCallback(() => {
    advanceBroadcastTrack();
  }, [advanceBroadcastTrack]);

  const prevTrack = useCallback(() => {
    if (backupSets.length === 0) return;
    const prevIdx = (currentBackupIndex - 1 + backupSets.length) % backupSets.length;
    setCurrentBackupIndex(prevIdx);
    const track = backupSets[prevIdx];
    if (audioRef.current && track) {
      audioRef.current.src = track.audio_url;
      audioRef.current.play().catch(() => {});
    }
  }, [backupSets, currentBackupIndex]);

  const seek = useCallback((_percent: number) => {
    // Non-interactive in live broadcast
  }, []);

  // Format honest status text
  const statusText = useMemo(() => {
    switch (engineState) {
      case "live":
        return isStale ? "LIVE (STALE)" : "LIVE";
      case "connecting":
        return "CONNECTING...";
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

  // Derived display values
  const displayTitle = formatTrackTitle(nowPlayingTrack?.title);
  const displayArtist = nowPlayingTrack?.artist || null;
  const displayCover = resolveCoverArt(nowPlayingTrack?.thumbnail);
  const displayThought = nowPlayingTrack?.thought && nowPlayingTrack.thought.trim() !== "" ? nowPlayingTrack.thought.trim() : null;
  const displayDaypart = nowPlayingTrack?.daypart && nowPlayingTrack.daypart.trim() !== "" ? nowPlayingTrack.daypart.trim() : null;
  const totalDuration = nowPlayingTrack?.duration && nowPlayingTrack.duration > 0 ? nowPlayingTrack.duration : 0;
  const hasValidProgress = totalDuration > 0 && interpolatedElapsed >= 0;
  const progressPercent = hasValidProgress ? Math.min(100, (interpolatedElapsed / totalDuration) * 100) : 0;
  const searchLinks = useMemo(() => buildSongSearchUrls(displayTitle, displayArtist), [displayTitle, displayArtist]);
  const currentSet = backupSets[currentBackupIndex] || null;

  return (
    <RadioContext.Provider
      value={{
        engineState,
        isPlaying,
        isLive,
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
        isSyncedToBroadcast: engineState === "live",
        liveTitle: displayTitle,
        liveDropFallback: engineState === "backup-mix",
        hasLoaded,
        activeDropTitle: null,
        activePersona: null,
        activeMood: null,
        isDropPlaying: false,
        togglePlay,
        retry,
        toggleMute,
        setVolume,
        toggleMinimized,
        switchQuality,
        switchToLive,
        switchToCurated,
        playSet,
        snapToBroadcast,
        nextTrack,
        prevTrack,
        seek,
        fetchRadioState,
        fetchRadioLive,
      }}
    >
      {children}

      {/* Global Hidden Audio Element */}
      <audio
        ref={audioRef}
        onTimeUpdate={handleTimeUpdate}
        onPlay={() => setIsPlaying(true)}
        onPause={() => {
          if (engineStateRef.current === "live") {
            setIsPlaying(false);
          }
        }}
        onError={() => {
          if (engineStateRef.current === "live") {
            handleStreamStall();
          }
        }}
        onEnded={() => {
          sendPlayBeaconOnce(true);
          if (engineStateRef.current === "backup-mix") {
            advanceBroadcastTrack();
          }
        }}
        preload="none"
        playsInline
      />

      {/* Kept inert for drop/soundboard pipeline compatibility */}
      <audio ref={dropAudioRef} preload="none" playsInline />
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
