"use client";

import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from "react";
import { RadioSet, RadioPublicState, AudioQuality, BroadcastMode, RadioDrop } from "@/lib/radio/types";

interface RadioContextType {
  currentSet: RadioSet | null;
  isPlaying: boolean;
  isLive: boolean;
  isSyncedToBroadcast: boolean;
  liveTitle: string;
  quality: AudioQuality;
  currentTime: number;
  duration: number;
  progress: number;
  isMuted: boolean;
  volume: number;
  isMinimized: boolean;
  queue: RadioSet[];
  liveDropFallback: boolean;
  hasLoaded: boolean;
  isDropPlaying: boolean;
  activeDropTitle: string | null;
  fetchRadioState: () => Promise<void>;
  togglePlay: () => void;
  playSet: (set: RadioSet) => void;
  snapToBroadcast: () => void;
  nextTrack: () => void;
  prevTrack: () => void;
  seek: (percent: number) => void;
  toggleMute: () => void;
  setVolume: (v: number) => void;
  toggleMinimized: () => void;
  switchQuality: (q: AudioQuality) => void;
  switchToLive: () => void;
  switchToCurated: () => void;
}

const RadioContext = createContext<RadioContextType | null>(null);

const STORAGE_KEY = "gl_radio_state";
const QUALITY_KEY = "gl_audio_quality";
const DEFAULT_LIVE_STREAM_URL =
  process.env.NEXT_PUBLIC_RADIO_STREAM_URL ||
  "https://pub-a4616bfcc17e435a86f092c95d4e603b.r2.dev/hls/stream.m3u8";
const DEFAULT_METADATA_URL =
  process.env.NEXT_PUBLIC_RADIO_METADATA_URL ||
  "https://pub-a4616bfcc17e435a86f092c95d4e603b.r2.dev/hls/now-playing.json";

// Calculates deterministic 24/7 global timeline position across all active tracks
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
  const [sets, setSets] = useState<RadioSet[]>([]);
  const [currentSetIndex, setCurrentSetIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [progress, setProgress] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolumeState] = useState(1);
  const [isMinimized, setIsMinimized] = useState(true);
  const [quality, setQuality] = useState<AudioQuality>("standard");
  const [mode, setMode] = useState<BroadcastMode>("curated");
  const [liveStreamUrl, setLiveStreamUrl] = useState(DEFAULT_LIVE_STREAM_URL);
  const [liveTitle, setLiveTitle] = useState("GOODLIFE MAIN STAGE LIVE");
  const [liveDropFallback, setLiveDropFallback] = useState(false);
  const [isSyncedToBroadcast, setIsSyncedToBroadcast] = useState(true);

  // Dynamic Radio Sheng Drops & Station Sweepers
  const [drops, setDrops] = useState<RadioDrop[]>([
    {
      id: "drop-marara-vibes",
      title: "Marara Camp Vibes 254",
      audio_url: "https://pub-a4616bfcc17e435a86f092c95d4e603b.r2.dev/radio/drops/ai_1793103865_e61bf9.mp3",
    },
    {
      id: "drop-nairobi-sound",
      title: "Nairobi Sound In The Building",
      audio_url: "https://pub-a4616bfcc17e435a86f092c95d4e603b.r2.dev/radio/drops/ai_1793102386_09ef74.mp3",
    },
  ]);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [isDropPlaying, setIsDropPlaying] = useState(false);
  const [activeDropTitle, setActiveDropTitle] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const preloadAudioRef = useRef<HTMLAudioElement | null>(null);
  const dropAudioRef = useRef<HTMLAudioElement | null>(null);
  const dropTriggeredTrackIdRef = useRef<number | null>(null);
  const hlsRef = useRef<any>(null);
  const lastStateSaveRef = useRef<number>(0);
  const secondsListenedRef = useRef<number>(0);
  const lastTimeUpdateRef = useRef<number>(0);
  const isSyncedRef = useRef(true);
  const initialBroadcastSyncRef = useRef(false);

  isSyncedRef.current = isSyncedToBroadcast;

  // 1. Load Initial State from LocalStorage
  useEffect(() => {
    try {
      const savedQuality = localStorage.getItem(QUALITY_KEY) as AudioQuality;
      if (savedQuality === "high" || savedQuality === "standard") {
        setQuality(savedQuality);
      }

      const savedState = localStorage.getItem(STORAGE_KEY);
      if (savedState) {
        const parsed = JSON.parse(savedState);
        if (parsed.isMinimized) setIsMinimized(true);
        // Only restore position if user specifically saved an on-demand session
        if (parsed.isSynced === false && typeof parsed.position === "number") {
          setIsSyncedToBroadcast(false);
          isSyncedRef.current = false;
          setCurrentTime(parsed.position);
        }
      }
    } catch {}
  }, []);

  // 2. Fetch Radio Public State with Dynamic Playlist Streaming & Live Sync
  const fetchRadioState = useCallback(async () => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);
      const res = await fetch("/api/radio/state", { signal: controller.signal });
      clearTimeout(timeoutId);
      if (!res.ok) {
        setHasLoaded(true);
        return;
      }
      const data: RadioPublicState = await res.json();
      const newSets = data.sets || [];
      if (data.drops && data.drops.length > 0) {
        setDrops(data.drops);
      }

      // Update sets smoothly without interrupting current track
      setSets((prevSets) => {
        if (prevSets.length > 0 && currentSetIndex < prevSets.length) {
          const currentId = prevSets[currentSetIndex]?.id;
          if (currentId) {
            const matchedIdx = newSets.findIndex((s) => s.id === currentId);
            if (matchedIdx !== -1 && matchedIdx !== currentSetIndex) {
              setCurrentSetIndex(matchedIdx);
            }
          }
        }
        return newSets;
      });

      setMode(data.mode || "curated");
      setLiveStreamUrl(data.live?.stream_url || DEFAULT_LIVE_STREAM_URL);
      setLiveTitle(data.live?.title || "GOODLIFE MAIN STAGE LIVE");

      // Synchronize initial broadcast playhead if in 24/7 live mode
      if (data.mode !== "live" && isSyncedRef.current && newSets.length > 0) {
        const live = computeLiveTimeline(newSets);
        if (!initialBroadcastSyncRef.current) {
          initialBroadcastSyncRef.current = true;
          setCurrentSetIndex(live.index);
          setCurrentTime(live.offsetSec);
          const dur = newSets[live.index]?.duration_sec || 0;
          setDuration(dur);
          setProgress(dur > 0 ? (live.offsetSec / dur) * 100 : 0);

          if (audioRef.current) {
            const track = newSets[live.index];
            const src = quality === "high" && track.audio_high_url ? track.audio_high_url : track.audio_url;
            if (audioRef.current.src !== src) {
              audioRef.current.src = src;
            }
            if (audioRef.current.readyState >= 1) {
              try {
                audioRef.current.currentTime = live.offsetSec;
              } catch {}
            } else {
              const onMeta = () => {
                if (audioRef.current) {
                  try {
                    audioRef.current.currentTime = live.offsetSec;
                  } catch {}
                }
              };
              audioRef.current.addEventListener("loadedmetadata", onMeta, { once: true });
            }
          }
        }
      }
    } catch (e) {
      console.warn("[RadioContext] fetchRadioState failed:", e);
    } finally {
      setHasLoaded(true);
    }
  }, [currentSetIndex, quality]);

  useEffect(() => {
    fetchRadioState();
    // Poll state every 15s to detect live stage switches and newly ingested tracks
    const pollInterval = setInterval(fetchRadioState, 15000);
    return () => clearInterval(pollInterval);
  }, [fetchRadioState]);

  const currentSet = sets[currentSetIndex] || null;

  // Edge Live Metadata Poller (sub-second R2 updates directly from CDN edge)
  useEffect(() => {
    if (mode !== "live" || !isPlaying) return;
    const fetchLiveMeta = async () => {
      try {
        const res = await fetch(`${DEFAULT_METADATA_URL}?_t=${Date.now()}`);
        if (res.ok) {
          const meta = await res.json();
          if (meta.title) {
            setLiveTitle(meta.artist ? `${meta.title} · ${meta.artist}` : meta.title);
          }
        }
      } catch {}
    };
    fetchLiveMeta();
    const interval = setInterval(fetchLiveMeta, 8000);
    return () => clearInterval(interval);
  }, [mode, isPlaying]);

  // Next Track Preloader for 0ms Instant Playback Transitions
  // Mobile data saver: ONLY preload when audio is actively playing AND <= 20s remaining in track
  useEffect(() => {
    if (typeof window === "undefined" || sets.length <= 1) return;

    if (!isPlaying || mode === "live") {
      if (preloadAudioRef.current) {
        preloadAudioRef.current.removeAttribute("src");
        preloadAudioRef.current.load();
      }
      return;
    }

    const timeLeft = duration - currentTime;
    if (timeLeft > 20 || timeLeft <= 0) return;

    const nextIdx = (currentSetIndex + 1) % sets.length;
    const nextSet = sets[nextIdx];
    if (!nextSet) return;

    const nextSrc = quality === "high" && nextSet.audio_high_url ? nextSet.audio_high_url : nextSet.audio_url;
    if (!preloadAudioRef.current) {
      preloadAudioRef.current = new Audio();
    }
    preloadAudioRef.current.preload = "auto";
    if (preloadAudioRef.current.src !== nextSrc) {
      preloadAudioRef.current.src = nextSrc;
      preloadAudioRef.current.load();
    }
  }, [isPlaying, currentTime, duration, currentSetIndex, sets, quality, mode]);

  // 3. Multi-Tab Conflict Resolution (BroadcastChannel)
  useEffect(() => {
    if (typeof window === "undefined" || !("BroadcastChannel" in window)) return;
    const channel = new BroadcastChannel("goodlife_radio");

    channel.onmessage = (event) => {
      if (event.data?.type === "PLAY" && isPlaying) {
        audioRef.current?.pause();
        setIsPlaying(false);
      }
    };

    return () => channel.close();
  }, [isPlaying]);

  const notifyOtherTabsPlay = () => {
    if (typeof window !== "undefined" && "BroadcastChannel" in window) {
      try {
        const channel = new BroadcastChannel("goodlife_radio");
        channel.postMessage({ type: "PLAY" });
        channel.close();
      } catch {}
    }
  };

  // 4. Media Session API (Lockscreen & Bluetooth Metadata)
  useEffect(() => {
    if (typeof window === "undefined" || !("mediaSession" in navigator)) return;

    if (mode === "live") {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: liveTitle,
        artist: "LIVE FROM MARARA CAMP",
        album: "GOODLIFE Radio",
        artwork: [{ src: "/icons/icon-512x512.png", sizes: "512x512", type: "image/png" }],
      });
      navigator.mediaSession.setActionHandler("seekto", null);
      navigator.mediaSession.setActionHandler("seekbackward", null);
      navigator.mediaSession.setActionHandler("seekforward", null);
    } else if (currentSet) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: currentSet.title,
        artist: currentSet.dj_name,
        album: "GOODLIFE Radio",
        artwork: [
          {
            src: currentSet.cover_url || "/icons/icon-512x512.png",
            sizes: "512x512",
            type: "image/jpeg",
          },
        ],
      });

      navigator.mediaSession.setActionHandler("play", () => togglePlay());
      navigator.mediaSession.setActionHandler("pause", () => togglePlay());
      navigator.mediaSession.setActionHandler("previoustrack", () => prevTrack());
      navigator.mediaSession.setActionHandler("nexttrack", () => nextTrack());
      navigator.mediaSession.setActionHandler("seekto", (details) => {
        if (details.seekTime && audioRef.current && audioRef.current.duration) {
          audioRef.current.currentTime = details.seekTime;
        }
      });
    }
  }, [currentSet, mode, liveTitle]);

  // 5. Throttled Position & State Persistence
  const saveStateToStorage = useCallback((pos: number) => {
    try {
      const now = Date.now();
      if (now - lastStateSaveRef.current > 4000) {
        lastStateSaveRef.current = now;
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({
            currentSetId: currentSet?.id,
            position: pos,
            isMinimized,
          })
        );
      }
    } catch {}
  }, [currentSet?.id, isMinimized]);

  // Pagehide listener for final position save & Beacon
  useEffect(() => {
    const handlePageHide = () => {
      try {
        if (audioRef.current) {
          localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify({
              currentSetId: currentSet?.id,
              position: audioRef.current.currentTime,
              isMinimized,
            })
          );
        }

        if (currentSet && secondsListenedRef.current >= 15) {
          navigator.sendBeacon?.(
            "/api/radio/play-event",
            JSON.stringify({
              set_id: currentSet.id,
              seconds_listened: Math.round(secondsListenedRef.current),
              completed: false,
              quality,
            })
          );
        }
      } catch {}
    };

    window.addEventListener("pagehide", handlePageHide);
    return () => window.removeEventListener("pagehide", handlePageHide);
  }, [currentSet, isMinimized, quality]);

  // 6. Dynamic Radio Drop Pre-fetch & Playout Engine
  const upcomingDropRef = useRef<{ drop_url: string; title: string; script: string } | null>(null);
  const isFetchingDropRef = useRef(false);

  const fetchUpcomingDrop = async (nextTrack: RadioSet) => {
    if (isFetchingDropRef.current) return;
    isFetchingDropRef.current = true;
    try {
      const res = await fetch("/api/radio/drops/dynamic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nextTrackTitle: nextTrack.title,
          nextTrackArtist: nextTrack.dj_name,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        upcomingDropRef.current = data;
      }
    } catch (e) {
      console.warn("[RadioContext] Dynamic drop prefetch failed:", e);
    } finally {
      isFetchingDropRef.current = false;
    }
  };

  const handleDropEnded = () => {
    setIsDropPlaying(false);
    setActiveDropTitle(null);
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume;
    }
  };

  // 7. Time Update Handler & Dynamic Drop Injection
  const handleTimeUpdate = () => {
    if (!audioRef.current) return;
    const cur = audioRef.current.currentTime;
    const dur = audioRef.current.duration || currentSet?.duration_sec || 0;
    setCurrentTime(cur);
    setDuration(dur);
    setProgress(dur > 0 ? (cur / dur) * 100 : 0);

    const timeLeft = dur - cur;

    // A. Prefetch dynamic Kenyan AI DJ drop early while current track is playing so it never misses
    if (
      isPlaying &&
      mode !== "live" &&
      !upcomingDropRef.current &&
      !isFetchingDropRef.current &&
      sets.length > 1
    ) {
      const nextIdx = (currentSetIndex + 1) % sets.length;
      const nextTrack = sets[nextIdx];
      if (nextTrack) {
        fetchUpcomingDrop(nextTrack);
      }
    }

    // B. Trigger dynamic drop injection during outro instrumental transition (~8-9s before track end)
    if (
      isPlaying &&
      mode !== "live" &&
      dur >= 15 &&
      timeLeft <= 9 &&
      timeLeft > 1 &&
      currentSet &&
      dropTriggeredTrackIdRef.current !== currentSet.id
    ) {
      dropTriggeredTrackIdRef.current = currentSet.id;
      const dropToPlay = upcomingDropRef.current || (drops.length > 0 ? drops[Math.floor(Math.random() * drops.length)] : null);
      const dropUrl = (dropToPlay as any)?.drop_url || (dropToPlay as any)?.audio_url;
      if (dropUrl && dropAudioRef.current) {
        setIsDropPlaying(true);
        setActiveDropTitle((dropToPlay as any)?.title || "KENYAN DJ DROP");

        // Sidechain Ducking: duck background instrumental beat to -12dB (0.25) so vocal cuts through cleanly
        if (audioRef.current) {
          audioRef.current.volume = isMuted ? 0 : volume * 0.25;
        }

        dropAudioRef.current.src = dropUrl;
        dropAudioRef.current.volume = isMuted ? 0 : volume;
        dropAudioRef.current.play().catch(() => {});
      }
    }

    // Track actual elapsed playback delta (ignoring seeking jumps > 2s)
    const delta = cur - lastTimeUpdateRef.current;
    if (delta > 0 && delta < 2.0) {
      secondsListenedRef.current += delta;
    }
    lastTimeUpdateRef.current = cur;
    saveStateToStorage(cur);
  };

  // 8. Playback Controls & Continuous Autoplay Pipeline
  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      if (mode === "live") {
        audioRef.current.pause();
        audioRef.current.src = "";
        audioRef.current.load();
      } else {
        audioRef.current.pause();
      }
      if (dropAudioRef.current) {
        dropAudioRef.current.pause();
      }
      setIsPlaying(false);
      setIsDropPlaying(false);
    } else {
      setIsMinimized(false);
      notifyOtherTabsPlay();

      if (mode === "live") {
        const snapUrl = liveStreamUrl.includes("?")
          ? `${liveStreamUrl}&t=${Date.now()}`
          : `${liveStreamUrl}?t=${Date.now()}`;
        audioRef.current.src = snapUrl;
        audioRef.current.load();
        audioRef.current
          .play()
          .then(() => setIsPlaying(true))
          .catch(() => {
            setLiveDropFallback(true);
            switchToCurated();
          });
      } else {
        if (isSyncedRef.current && sets.length > 0) {
          const live = computeLiveTimeline(sets);
          const targetTrack = sets[live.index];
          const streamSrc = quality === "high" && targetTrack?.audio_high_url ? targetTrack.audio_high_url : targetTrack?.audio_url;

          if (currentSetIndex !== live.index) {
            setCurrentSetIndex(live.index);
          }
          if (streamSrc && (!audioRef.current.src || !audioRef.current.src.includes(streamSrc))) {
            audioRef.current.src = streamSrc;
          }

          if (audioRef.current.readyState >= 1) {
            try {
              audioRef.current.currentTime = live.offsetSec;
            } catch {}
          } else {
            const onMeta = () => {
              if (audioRef.current) {
                try {
                  audioRef.current.currentTime = live.offsetSec;
                } catch {}
              }
            };
            audioRef.current.addEventListener("loadedmetadata", onMeta, { once: true });
          }
          setCurrentTime(live.offsetSec);
        }

        audioRef.current
          .play()
          .then(() => setIsPlaying(true))
          .catch(() => setIsPlaying(false));
      }
    }
  };

  const snapToBroadcast = useCallback(() => {
    setIsSyncedToBroadcast(true);
    isSyncedRef.current = true;
    dropTriggeredTrackIdRef.current = null;
    upcomingDropRef.current = null;
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume;
    }

    if (sets.length === 0) return;
    const live = computeLiveTimeline(sets);
    setCurrentSetIndex(live.index);
    setCurrentTime(live.offsetSec);
    const targetTrack = sets[live.index];
    const streamSrc = quality === "high" && targetTrack?.audio_high_url ? targetTrack.audio_high_url : targetTrack?.audio_url;

    if (audioRef.current && streamSrc) {
      audioRef.current.src = streamSrc;
      if (audioRef.current.readyState >= 1) {
        try {
          audioRef.current.currentTime = live.offsetSec;
        } catch {}
      } else {
        const onMeta = () => {
          if (audioRef.current) {
            try {
              audioRef.current.currentTime = live.offsetSec;
            } catch {}
          }
        };
        audioRef.current.addEventListener("loadedmetadata", onMeta, { once: true });
      }
      audioRef.current
        .play()
        .then(() => setIsPlaying(true))
        .catch(() => {});
    }
  }, [sets, quality, volume, isMuted]);

  // Advance to next broadcast track sequentially with seamless mobile autoplay
  const advanceBroadcastTrack = useCallback(() => {
    if (sets.length === 0) return;
    setIsSyncedToBroadcast(true);
    isSyncedRef.current = true;
    dropTriggeredTrackIdRef.current = null;
    upcomingDropRef.current = null;

    // Restore full audio volume
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume;
    }

    // Natural sequential progression through the airwave playlist
    const nextIdx = (currentSetIndex + 1) % sets.length;
    setCurrentSetIndex(nextIdx);
    setCurrentTime(0);
    setProgress(0);

    const nextTrack = sets[nextIdx];
    const streamSrc = quality === "high" && nextTrack?.audio_high_url ? nextTrack.audio_high_url : nextTrack?.audio_url;

    if (audioRef.current && streamSrc) {
      audioRef.current.src = streamSrc;
      audioRef.current.load();
      const p = audioRef.current.play();
      if (p !== undefined) {
        p.then(() => setIsPlaying(true)).catch(() => {
          const onCanPlay = () => {
            audioRef.current?.play().then(() => setIsPlaying(true)).catch(() => {});
          };
          audioRef.current?.addEventListener("canplay", onCanPlay, { once: true });
        });
      }
    }
  }, [sets, currentSetIndex, quality, volume, isMuted]);

  const playSet = (set: RadioSet) => {
    setIsSyncedToBroadcast(false);
    isSyncedRef.current = false;
    dropTriggeredTrackIdRef.current = null;
    upcomingDropRef.current = null;

    const idx = sets.findIndex((s) => s.id === set.id);
    if (idx !== -1) {
      setCurrentSetIndex(idx);
    }
    setIsMinimized(false);
    notifyOtherTabsPlay();
    setIsPlaying(true);
    setMode("curated");
    setLiveDropFallback(false);

    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume;
    }

    const streamSrc = quality === "high" && set.audio_high_url ? set.audio_high_url : set.audio_url;
    if (audioRef.current) {
      audioRef.current.src = streamSrc;
      audioRef.current.load();
      const p = audioRef.current.play();
      if (p !== undefined) {
        p.then(() => setIsPlaying(true)).catch(() => {
          const onCanPlay = () => {
            audioRef.current?.play().then(() => setIsPlaying(true)).catch(() => {});
          };
          audioRef.current?.addEventListener("canplay", onCanPlay, { once: true });
        });
      }
    }
  };

  const nextTrack = () => {
    if (sets.length === 0) return;
    setIsSyncedToBroadcast(false);
    isSyncedRef.current = false;
    dropTriggeredTrackIdRef.current = null;
    upcomingDropRef.current = null;

    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume;
    }

    const nextIdx = (currentSetIndex + 1) % sets.length;
    setCurrentSetIndex(nextIdx);
    setCurrentTime(0);
    setProgress(0);

    const nextSet = sets[nextIdx];
    notifyOtherTabsPlay();
    setIsPlaying(true);
    const streamSrc = quality === "high" && nextSet.audio_high_url ? nextSet.audio_high_url : nextSet.audio_url;

    if (audioRef.current && streamSrc) {
      audioRef.current.src = streamSrc;
      audioRef.current.load();
      const p = audioRef.current.play();
      if (p !== undefined) {
        p.then(() => setIsPlaying(true)).catch(() => {
          const onCanPlay = () => {
            audioRef.current?.play().then(() => setIsPlaying(true)).catch(() => {});
          };
          audioRef.current?.addEventListener("canplay", onCanPlay, { once: true });
        });
      }
    }
  };

  const prevTrack = () => {
    if (sets.length === 0) return;
    setIsSyncedToBroadcast(false);
    isSyncedRef.current = false;
    dropTriggeredTrackIdRef.current = null;
    upcomingDropRef.current = null;

    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume;
    }

    const prevIdx = (currentSetIndex - 1 + sets.length) % sets.length;
    setCurrentSetIndex(prevIdx);
    setCurrentTime(0);
    setProgress(0);

    const prevSet = sets[prevIdx];
    notifyOtherTabsPlay();
    setIsPlaying(true);
    const streamSrc = quality === "high" && prevSet.audio_high_url ? prevSet.audio_high_url : prevSet.audio_url;

    if (audioRef.current && streamSrc) {
      audioRef.current.src = streamSrc;
      audioRef.current.load();
      const p = audioRef.current.play();
      if (p !== undefined) {
        p.then(() => setIsPlaying(true)).catch(() => {
          const onCanPlay = () => {
            audioRef.current?.play().then(() => setIsPlaying(true)).catch(() => {});
          };
          audioRef.current?.addEventListener("canplay", onCanPlay, { once: true });
        });
      }
    }
  };

  const seek = (percent: number) => {
    setIsSyncedToBroadcast(false);
    isSyncedRef.current = false;
    if (!audioRef.current || !audioRef.current.duration) return;
    const target = (percent / 100) * audioRef.current.duration;
    audioRef.current.currentTime = target;
    setCurrentTime(target);
    setProgress(percent);
  };

  const toggleMute = () => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    if (audioRef.current) {
      audioRef.current.muted = nextMuted;
    }
    if (dropAudioRef.current) {
      dropAudioRef.current.muted = nextMuted;
    }
  };

  const setVolume = (val: number) => {
    const clamped = Math.max(0, Math.min(1, val));
    setVolumeState(clamped);
    if (audioRef.current) {
      audioRef.current.volume = clamped;
      if (clamped > 0 && isMuted) {
        audioRef.current.muted = false;
        setIsMuted(false);
      }
    }
    if (dropAudioRef.current) {
      dropAudioRef.current.volume = clamped;
      if (clamped > 0 && isMuted) {
        dropAudioRef.current.muted = false;
      }
    }
  };

  const toggleMinimized = () => {
    setIsMinimized((prev) => !prev);
  };

  // 8. Quality Switcher (Preserves exact current position)
  const switchQuality = (newQuality: AudioQuality) => {
    if (newQuality === quality) return;
    const curPos = audioRef.current?.currentTime || 0;
    const wasPlaying = isPlaying;

    setQuality(newQuality);
    try {
      localStorage.setItem(QUALITY_KEY, newQuality);
    } catch {}

    if (audioRef.current && currentSet) {
      const newSrc = newQuality === "high" && currentSet.audio_high_url
        ? currentSet.audio_high_url
        : currentSet.audio_url;

      audioRef.current.pause();
      audioRef.current.src = newSrc;

      // Wait for canplay before seeking to avoid dropped seeks
      audioRef.current.addEventListener(
        "canplay",
        () => {
          if (audioRef.current) {
            audioRef.current.currentTime = curPos;
            if (wasPlaying) {
              audioRef.current.play().catch(() => {});
            }
          }
        },
        { once: true }
      );
      audioRef.current.load();
    }
  };

  // 9. Live Stream Switchers
  const switchToLive = () => {
    setMode("live");
    setLiveDropFallback(false);
    if (!liveStreamUrl || !audioRef.current) return;

    notifyOtherTabsPlay();
    // Check if browser plays HLS natively (Safari)
    if (audioRef.current.canPlayType("application/vnd.apple.mpegurl")) {
      audioRef.current.src = liveStreamUrl;
      audioRef.current.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
    } else {
      // Dynamic import of hls.js for Chrome / Firefox
      import("hls.js").then(({ default: Hls }) => {
        if (Hls.isSupported()) {
          if (hlsRef.current) hlsRef.current.destroy();
          const hls = new Hls({ lowLatencyMode: true });
          hls.loadSource(liveStreamUrl);
          hls.attachMedia(audioRef.current!);
          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            audioRef.current?.play().then(() => setIsPlaying(true)).catch(() => {});
          });
          hls.on(Hls.Events.ERROR, (_event: any, data: any) => {
            // Live stream drop detected: auto-fallback on fatal error
            if (data?.fatal) {
              setLiveDropFallback(true);
              setMode("curated");
              if (sets.length > 0) {
                if (isSyncedRef.current) {
                  advanceBroadcastTrack();
                } else {
                  nextTrack();
                }
              } else {
                setIsPlaying(false);
              }
            }
          });
          hlsRef.current = hls;
        }
      });
    }
  };

  const switchToCurated = () => {
    setMode("curated");
    setLiveDropFallback(false);
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    if (currentSet) playSet(currentSet);
  };

  return (
    <RadioContext.Provider
      value={{
        currentSet,
        isPlaying,
        isLive: mode === "live",
        isSyncedToBroadcast,
        liveTitle,
        quality,
        currentTime,
        duration,
        progress,
        isMuted,
        volume,
        isMinimized,
        queue: sets,
        liveDropFallback,
        hasLoaded,
        isDropPlaying,
        activeDropTitle,
        fetchRadioState,
        togglePlay,
        playSet,
        snapToBroadcast,
        nextTrack,
        prevTrack,
        seek,
        toggleMute,
        setVolume,
        toggleMinimized,
        switchQuality,
        switchToLive,
        switchToCurated,
      }}
    >
      {children}

      {/* Global Hidden Audio Element - Managed imperatively to prevent React DOM reconciliation aborts on mobile */}
      <audio
        ref={audioRef}
        onTimeUpdate={handleTimeUpdate}
        onError={() => {
          // If a track encounters a network glitch, auto-recover smoothly without dropping sync
          if (isPlaying && sets.length > 1) {
            setTimeout(() => {
              if (isSyncedRef.current) {
                advanceBroadcastTrack();
              } else {
                nextTrack();
              }
            }, 1000);
          }
        }}
        onEnded={() => {
          if (currentSet) {
            navigator.sendBeacon?.(
              "/api/radio/play-event",
              JSON.stringify({
                set_id: currentSet.id,
                seconds_listened: Math.round(secondsListenedRef.current),
                completed: true,
                quality,
              })
            );
          }
          if (isSyncedRef.current) {
            advanceBroadcastTrack();
          } else {
            nextTrack();
          }
        }}
        preload="none"
        playsInline
      />

      {/* Dynamic Kenyan Sheng AI Radio Drop Audio Player */}
      <audio
        ref={dropAudioRef}
        onEnded={handleDropEnded}
        onError={handleDropEnded}
        preload="auto"
        playsInline
      />
    </RadioContext.Provider>
  );
}

export function useRadio() {
  const ctx = useContext(RadioContext);
  if (!ctx) {
    throw new Error("useRadio must be used within a RadioProvider");
  }
  return ctx;
}
