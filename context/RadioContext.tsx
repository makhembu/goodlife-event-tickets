"use client";

import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from "react";
import { RadioSet, RadioPublicState, AudioQuality, BroadcastMode } from "@/lib/radio/types";

interface RadioContextType {
  currentSet: RadioSet | null;
  isPlaying: boolean;
  isLive: boolean;
  liveTitle: string;
  quality: AudioQuality;
  currentTime: number;
  duration: number;
  progress: number;
  isMuted: boolean;
  isMinimized: boolean;
  queue: RadioSet[];
  liveDropFallback: boolean;
  togglePlay: () => void;
  playSet: (set: RadioSet) => void;
  nextTrack: () => void;
  prevTrack: () => void;
  seek: (percent: number) => void;
  toggleMute: () => void;
  toggleMinimized: () => void;
  switchQuality: (q: AudioQuality) => void;
  switchToLive: () => void;
  switchToCurated: () => void;
}

const RadioContext = createContext<RadioContextType | null>(null);

const STORAGE_KEY = "gl_radio_state";
const QUALITY_KEY = "gl_audio_quality";

export function RadioProvider({ children }: { children: React.ReactNode }) {
  const [sets, setSets] = useState<RadioSet[]>([]);
  const [currentSetIndex, setCurrentSetIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [progress, setProgress] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isMinimized, setIsMinimized] = useState(true);
  const [quality, setQuality] = useState<AudioQuality>("standard");
  const [mode, setMode] = useState<BroadcastMode>("curated");
  const [liveStreamUrl, setLiveStreamUrl] = useState("");
  const [liveTitle, setLiveTitle] = useState("GOODLIFE MAIN STAGE LIVE");
  const [liveDropFallback, setLiveDropFallback] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const preloadAudioRef = useRef<HTMLAudioElement | null>(null);
  const hlsRef = useRef<any>(null);
  const lastStateSaveRef = useRef<number>(0);
  const secondsListenedRef = useRef<number>(0);
  const lastTimeUpdateRef = useRef<number>(0);

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
        if (typeof parsed.position === "number") setCurrentTime(parsed.position);
      }
    } catch {}
  }, []);

  // 2. Fetch Radio Public State with Dynamic Playlist Streaming
  const fetchRadioState = useCallback(async () => {
    try {
      const res = await fetch("/api/radio/state");
      if (!res.ok) return;
      const data: RadioPublicState = await res.json();
      const newSets = data.sets || [];
      
      // Update sets smoothly without interrupting current track if new tracks stream in
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
      setLiveStreamUrl(data.live?.stream_url || "");
      setLiveTitle(data.live?.title || "GOODLIFE MAIN STAGE LIVE");
    } catch {}
  }, [currentSetIndex]);

  useEffect(() => {
    fetchRadioState();
    // Poll state every 15s to detect live stage switches and newly ingested tracks
    const pollInterval = setInterval(fetchRadioState, 15000);
    return () => clearInterval(pollInterval);
  }, [fetchRadioState]);

  const currentSet = sets[currentSetIndex] || null;

  // Next Track Preloader for 0ms Instant Playback Transitions
  useEffect(() => {
    if (typeof window === "undefined" || sets.length <= 1) return;
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
  }, [currentSetIndex, sets, quality]);

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

  // 6. Time Update Handler
  const handleTimeUpdate = () => {
    if (!audioRef.current) return;
    const cur = audioRef.current.currentTime;
    const dur = audioRef.current.duration || currentSet?.duration_sec || 0;
    setCurrentTime(cur);
    setDuration(dur);
    setProgress(dur > 0 ? (cur / dur) * 100 : 0);

    // Track actual elapsed playback delta (ignoring seeking jumps > 2s)
    const delta = cur - lastTimeUpdateRef.current;
    if (delta > 0 && delta < 2.0) {
      secondsListenedRef.current += delta;
    }
    lastTimeUpdateRef.current = cur;
    saveStateToStorage(cur);
  };

  // 7. Playback Controls
  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      if (mode === "live") {
        // Broadcast Contract: Pause = Disconnect (release data stream buffer)
        audioRef.current.pause();
        audioRef.current.src = "";
        audioRef.current.load();
      } else {
        audioRef.current.pause();
      }
      setIsPlaying(false);
    } else {
      setIsMinimized(false);
      notifyOtherTabsPlay();

      if (mode === "live") {
        // Broadcast Contract: Play = Snap to Live second (fresh playhead with cache buster)
        const snapUrl = liveStreamUrl.includes("?")
          ? `${liveStreamUrl}&t=${Date.now()}`
          : `${liveStreamUrl}?t=${Date.now()}`;
        audioRef.current.src = snapUrl;
        audioRef.current.load();
        audioRef.current
          .play()
          .then(() => setIsPlaying(true))
          .catch(() => {
            // If live stream is unreachable, fallback to curated set
            setLiveDropFallback(true);
            switchToCurated();
          });
      } else {
        audioRef.current
          .play()
          .then(() => setIsPlaying(true))
          .catch(() => setIsPlaying(false));
      }
    }
  };

  const playSet = (set: RadioSet) => {
    const idx = sets.findIndex((s) => s.id === set.id);
    if (idx !== -1) {
      setCurrentSetIndex(idx);
    }
    setIsMinimized(false);
    notifyOtherTabsPlay();
    setIsPlaying(true);
    setMode("curated");
    setLiveDropFallback(false);

    const streamSrc = quality === "high" && set.audio_high_url ? set.audio_high_url : set.audio_url;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = streamSrc;
      audioRef.current.load();
      audioRef.current
        .play()
        .then(() => setIsPlaying(true))
        .catch(() => setIsPlaying(false));
    }
  };

  const nextTrack = () => {
    if (sets.length === 0) return;
    const nextIdx = (currentSetIndex + 1) % sets.length;
    setCurrentSetIndex(nextIdx);
    const nextSet = sets[nextIdx];
    notifyOtherTabsPlay();
    setIsPlaying(true);
    const streamSrc = quality === "high" && nextSet.audio_high_url ? nextSet.audio_high_url : nextSet.audio_url;

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = streamSrc;
      audioRef.current.load();
      audioRef.current.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
    }
  };

  const prevTrack = () => {
    if (sets.length === 0) return;
    const prevIdx = (currentSetIndex - 1 + sets.length) % sets.length;
    setCurrentSetIndex(prevIdx);
    const prevSet = sets[prevIdx];
    notifyOtherTabsPlay();
    setIsPlaying(true);
    const streamSrc = quality === "high" && prevSet.audio_high_url ? prevSet.audio_high_url : prevSet.audio_url;

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = streamSrc;
      audioRef.current.load();
      audioRef.current.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
    }
  };

  const seek = (percent: number) => {
    if (!audioRef.current || !audioRef.current.duration) return;
    const target = (percent / 100) * audioRef.current.duration;
    audioRef.current.currentTime = target;
    setCurrentTime(target);
    setProgress(percent);
  };

  const toggleMute = () => {
    if (audioRef.current) {
      audioRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
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
                nextTrack();
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
        liveTitle,
        quality,
        currentTime,
        duration,
        progress,
        isMuted,
        isMinimized,
        queue: sets,
        liveDropFallback,
        togglePlay,
        playSet,
        nextTrack,
        prevTrack,
        seek,
        toggleMute,
        toggleMinimized,
        switchQuality,
        switchToLive,
        switchToCurated,
      }}
    >
      {children}

      {/* Global Hidden Audio Element */}
      <audio
        ref={audioRef}
        src={currentSet ? (quality === "high" && currentSet.audio_high_url ? currentSet.audio_high_url : currentSet.audio_url) : undefined}
        onTimeUpdate={handleTimeUpdate}
        onError={() => {
          // If a track encounters a network glitch, auto-recover to next track smoothly
          if (isPlaying && sets.length > 1) {
            setTimeout(() => nextTrack(), 1000);
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
          nextTrack();
        }}
        preload="auto"
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
