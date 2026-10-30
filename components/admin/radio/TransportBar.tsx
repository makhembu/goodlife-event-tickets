"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Play,
  Pause,
  SkipForward,
  Volume2,
  VolumeX,
  Radio,
  Users,
  Sliders,
  RadioTower,
  Wifi,
  Sparkles,
} from "lucide-react";
import { formatTrackTitle } from "@/lib/radio/media-helpers";

export interface TransportBarProps {
  streamUrl?: string;
  isDucking?: boolean;
  bridgeOnline?: boolean | null;
  onSkip?: () => Promise<void>;
  onMasterFade?: (gain: number) => void;
}

export default function TransportBar({
  streamUrl = "",
  isDucking = false,
  bridgeOnline = null,
  onSkip,
  onMasterFade,
}: TransportBarProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(0.85);
  const [masterGain, setMasterGain] = useState(1.0);
  const [nowPlaying, setNowPlaying] = useState<any>(null);
  const [isSkipping, setIsSkipping] = useState(false);
  const [statusState, setStatusState] = useState<"connecting" | "live" | "offline">("connecting");
  const [eatTime, setEatTime] = useState<string>("");
  const [audioEl, setAudioEl] = useState<HTMLAudioElement | null>(null);

  const currentAudioUrlRef = useRef<string>("");
  const currentElapsedRef = useRef<number>(0);
  const currentTrackIdRef = useRef<number | null>(null);
  const isPlayingRef = useRef<boolean>(false);
  isPlayingRef.current = isPlaying;

  // Meter levels for stereo VU
  const [meterLeft, setMeterLeft] = useState(14);
  const [meterRight, setMeterRight] = useState(12);

  // Live Nairobi Clock
  useEffect(() => {
    const updateTime = () => {
      try {
        const timeStr = new Intl.DateTimeFormat("en-GB", {
          timeZone: "Africa/Nairobi",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
        }).format(new Date());
        setEatTime(timeStr);
      } catch {
        setEatTime(new Date().toTimeString().slice(0, 8));
      }
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Monitor Audio Element initialization
  useEffect(() => {
    const audio = new Audio(streamUrl && !streamUrl.includes("darajadigital") ? streamUrl : "");
    audio.volume = isMuted ? 0 : volume * masterGain;
    audio.onended = () => {
      fetchTelemetry();
    };
    setAudioEl(audio);

    return () => {
      audio.pause();
      audio.src = "";
    };
  }, [streamUrl]);

  // Adjust volume
  useEffect(() => {
    if (audioEl) {
      audioEl.volume = isMuted ? 0 : volume * masterGain;
    }
  }, [volume, masterGain, isMuted, audioEl]);

  // VU Meter animation
  useEffect(() => {
    let animId: number;
    let frame = 0;
    const updateMeters = () => {
      frame++;
      if (isPlaying || statusState === "live") {
        if (frame % 3 === 0) {
          const base = isDucking ? 6 : 14;
          const variance = isDucking ? 3 : 6;
          setMeterLeft(Math.min(20, Math.max(2, base + Math.floor((Math.random() - 0.4) * variance))));
          setMeterRight(Math.min(20, Math.max(2, (base - 1) + Math.floor((Math.random() - 0.4) * variance))));
        }
      } else {
        setMeterLeft(0);
        setMeterRight(0);
      }
      animId = requestAnimationFrame(updateMeters);
    };
    animId = requestAnimationFrame(updateMeters);
    return () => cancelAnimationFrame(animId);
  }, [isPlaying, statusState, isDucking]);

  // Telemetry Poller: Synchronized with /api/radio/live (identical source of truth as public listener player)
  const fetchTelemetry = async () => {
    // 1. AzuraCast bridge telemetry if present and active
    try {
      const res = await fetch("/api/admin/radio/azuracast/nowplaying");
      if (res.ok) {
        const data = await res.json();
        if (data && data.online !== false && (data.now_playing?.song?.title || data.station)) {
          setNowPlaying(data);
          setStatusState("live");
          return;
        }
      }
    } catch {}

    // 2. Real-time BFF live playout endpoint (primary 24/7 truth)
    try {
      const liveRes = await fetch("/api/radio/live");
      if (liveRes.ok) {
        const liveData = await liveRes.json();
        if (liveData && liveData.now_playing) {
          const track = liveData.now_playing;
          currentAudioUrlRef.current = track.audio_url || "";
          currentElapsedRef.current = track.elapsed || 0;

          // If local headphone monitor is active, sync audio src seamlessly if track changed
          if (audioEl && isPlayingRef.current && track.audio_url) {
            if (track.id !== currentTrackIdRef.current) {
              currentTrackIdRef.current = track.id;
              audioEl.src = track.audio_url;
              audioEl.currentTime = track.elapsed || 0;
              audioEl.play().catch(() => {});
            }
          } else if (track.id) {
            currentTrackIdRef.current = track.id;
          }

          setNowPlaying({
            now_playing: {
              id: track.id,
              song: {
                title: track.title || "GOODLIFE Broadcast Mix",
                artist: track.artist || "GOODLIFE Resident",
                art: track.thumbnail || "/flyer.png",
              },
              elapsed: track.elapsed || 0,
              duration: track.duration || 180,
              audio_url: track.audio_url,
              is_live: liveData.mode === "live",
            },
            listeners: { total: liveData.listeners_count ?? 0, unique: liveData.listeners_count ?? 0 },
            live: { is_live: liveData.mode === "live" },
          });
          setStatusState("live");
          return;
        }
      }
    } catch {}

    // 3. Fallback to /api/radio/state if live is unavailable
    try {
      const stateRes = await fetch("/api/radio/state");
      if (stateRes.ok) {
        const stateData = await stateRes.json();
        const activeSet = stateData.sets?.find((s: any) => s.id === stateData.broadcast?.active_set_id) || stateData.sets?.[0];
        if (activeSet) {
          setNowPlaying({
            now_playing: {
              id: activeSet.id,
              song: {
                title: activeSet.title || "GOODLIFE Broadcast Mix",
                artist: activeSet.dj_name || "Resident Selector",
                art: activeSet.cover_url || "/flyer.png",
              },
              elapsed: stateData.broadcast?.offset_sec || 0,
              duration: activeSet.duration_sec || 180,
              audio_url: activeSet.audio_url,
              is_live: false,
            },
            listeners: { total: 0, unique: 0 },
            live: { is_live: false },
          });
          setStatusState("live");
        }
      }
    } catch {}
  };

  useEffect(() => {
    fetchTelemetry();
    const interval = setInterval(fetchTelemetry, 3500);
    return () => {
      clearInterval(interval);
    };
  }, [audioEl]);

  const handleTogglePlay = () => {
    if (!audioEl) return;
    if (isPlaying) {
      audioEl.pause();
      setIsPlaying(false);
    } else {
      const targetSrc = (streamUrl && !streamUrl.includes("darajadigital"))
        ? streamUrl
        : currentAudioUrlRef.current;

      if (!targetSrc) {
        console.warn("[TransportBar] No audio stream available to monitor");
        return;
      }

      if (audioEl.src !== targetSrc) {
        audioEl.src = targetSrc;
        if (!streamUrl && currentElapsedRef.current > 0) {
          try {
            audioEl.currentTime = currentElapsedRef.current;
          } catch {}
        }
      }
      audioEl
        .play()
        .then(() => setIsPlaying(true))
        .catch((err) => {
          console.warn("[TransportBar] Monitor playback blocked or failed:", err);
        });
    }
  };

  const handleSkip = async () => {
    if (isSkipping) return;
    setIsSkipping(true);
    try {
      if (onSkip) {
        await onSkip();
      } else {
        const res = await fetch("/api/admin/radio/azuracast/skip", { method: "POST" });
        if (!res.ok) console.warn("Skip failed");
      }
      // Re-fetch telemetry immediately so the cockpit displays the new track in lockstep
      await fetchTelemetry();
    } catch (err) {
      console.warn("Skip error:", err);
    } finally {
      setTimeout(() => setIsSkipping(false), 1500);
    }
  };

  const handleFadeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setMasterGain(val);
    if (onMasterFade) onMasterFade(val);
  };

  const song = nowPlaying?.now_playing?.song;
  const isLiveDj = nowPlaying?.live?.is_live || false;
  const elapsed = nowPlaying?.now_playing?.elapsed || 0;
  const duration = nowPlaying?.now_playing?.duration || 0;
  const remaining = duration > elapsed ? duration - elapsed : 0;
  const progressPercent = duration > 0 ? Math.min(100, (elapsed / duration) * 100) : 0;

  const formatSec = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  const totalListeners = nowPlaying?.listeners?.total ?? 0;
  const uniqueListeners = nowPlaying?.listeners?.unique ?? totalListeners;

  return (
    <header className="fixed top-0 left-0 right-0 h-14 bg-[#16181D] border-b-2 border-[#DFBB7D] z-50 text-[#FBF9F6] flex items-center justify-between px-3 select-none">
      {/* 1. Left: Station Status & ON AIR Pill */}
      <div className="flex items-center space-x-3 min-w-[200px]">
        {isDucking ? (
          <div className="flex items-center space-x-1.5 px-2.5 py-1 bg-[#F5C842] text-[#16181D] font-mono text-xs font-bold border border-[#16181D] animate-pulse">
            <Sparkles className="w-3.5 h-3.5" />
            <span>DUCKING -12dB</span>
          </div>
        ) : isLiveDj ? (
          <div className="flex items-center space-x-1.5 px-2.5 py-1 bg-[#10B981] text-[#16181D] font-mono text-xs font-bold border border-[#16181D]">
            <RadioTower className="w-3.5 h-3.5 animate-pulse" />
            <span>LIVE DJ</span>
          </div>
        ) : (
          <div className="flex items-center space-x-1.5 px-2.5 py-1 bg-[#DFBB7D] text-[#16181D] font-mono text-xs font-bold border border-[#16181D]">
            <div className="w-2 h-2 rounded-full bg-[#E84855] animate-ping" />
            <span>ON AIR</span>
          </div>
        )}

        <div className="hidden sm:flex flex-col">
          <span className="text-[10px] text-[#DFBB7D] uppercase font-bold tracking-wider">GOODLIFE 254</span>
          <span className="text-xs font-mono font-semibold text-white/90">RADIO BROADCAST</span>
        </div>
      </div>

      {/* 2. Center: Track Metadata & Progress Scrubber */}
      <div className="flex-1 max-w-xl mx-4 flex flex-col justify-center">
        <div className="flex items-center justify-between text-xs mb-1">
          <div className="truncate pr-2">
            <span className="font-bold text-white tracking-wide">
              {formatTrackTitle(song?.title) || "Station Rotation Active"}
            </span>
            <span className="text-[#DFBB7D] ml-2">
              — {song?.artist || "GOODLIFE Resident"}
            </span>
          </div>
          <div className="font-mono text-[11px] text-white/60 shrink-0">
            {duration > 0 ? (
              <>
                <span>{formatSec(elapsed)}</span>
                <span className="mx-1">/</span>
                <span>{formatSec(duration)}</span>
                <span className="text-[#DFBB7D] ml-2 font-bold">(-{formatSec(remaining)})</span>
              </>
            ) : (
              <span>LIVE STREAM</span>
            )}
          </div>
        </div>

        {/* Scrubber track */}
        <div className="w-full bg-white/10 h-1.5 overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-[#DFBB7D] to-[#F5C842] transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* 3. Right: Skip, Fade, VU, Listeners, EAT Clock */}
      <div className="flex items-center space-x-3">
        {/* Skip Track */}
        <button
          onClick={handleSkip}
          disabled={isSkipping}
          title="Smooth Crossfade to Next Track"
          className="px-2.5 py-1 bg-white/10 hover:bg-[#DFBB7D] hover:text-[#16181D] transition-colors border border-white/20 font-mono text-xs flex items-center space-x-1"
        >
          <SkipForward className={`w-3.5 h-3.5 ${isSkipping ? "animate-spin" : ""}`} />
          <span className="hidden md:inline font-bold">SKIP</span>
        </button>

        {/* Master Fade Slider */}
        <div className="hidden lg:flex items-center space-x-1.5 px-2 py-0.5 bg-black/40 border border-white/10">
          <Sliders className="w-3 h-3 text-[#DFBB7D]" />
          <span className="text-[10px] font-mono text-white/70">FADE</span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={masterGain}
            onChange={handleFadeChange}
            title={`Master Stream Gain: ${(masterGain * 100).toFixed(0)}%`}
            className="w-16 h-1 accent-[#DFBB7D] bg-white/20 cursor-pointer"
          />
        </div>

        {/* Monitor Audio Toggle */}
        <button
          onClick={handleTogglePlay}
          title="Local Admin Audio Monitor"
          className={`p-1.5 border transition-colors ${
            isPlaying
              ? "bg-[#DFBB7D] text-[#16181D] border-[#DFBB7D]"
              : "bg-white/5 text-white/80 border-white/20 hover:border-white"
          }`}
        >
          {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
        </button>

        {/* Stereo VU Meter */}
        <div className="hidden sm:flex items-center space-x-1 bg-black/40 px-2 py-1 border border-white/10 h-7" title="Stream Stereo Output Level">
          <div className="flex flex-col justify-center space-y-0.5">
            <div className="flex space-x-0.5">
              {[...Array(12)].map((_, i) => (
                <div
                  key={`l-${i}`}
                  className={`w-1 h-2 ${
                    i < meterLeft
                      ? i > 9
                        ? "bg-[#E84855]"
                        : i > 6
                        ? "bg-[#F5C842]"
                        : "bg-[#10B981]"
                      : "bg-white/10"
                  }`}
                />
              ))}
            </div>
            <div className="flex space-x-0.5">
              {[...Array(12)].map((_, i) => (
                <div
                  key={`r-${i}`}
                  className={`w-1 h-2 ${
                    i < meterRight
                      ? i > 9
                        ? "bg-[#E84855]"
                        : i > 6
                        ? "bg-[#F5C842]"
                        : "bg-[#10B981]"
                      : "bg-white/10"
                  }`}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Listeners Count */}
        <div className="flex items-center space-x-1.5 px-2 py-1 bg-black/40 border border-white/10 font-mono text-xs" title={`${uniqueListeners} unique listeners`}>
          <Users className="w-3.5 h-3.5 text-[#DFBB7D]" />
          <span className="font-bold text-white">{totalListeners}</span>
          <span className="hidden xl:inline text-[10px] text-white/50">LIVE</span>
        </div>

        {/* Live EAT Clock */}
        <div className="hidden md:flex flex-col text-right font-mono border-l border-white/20 pl-3">
          <span className="text-[10px] text-[#DFBB7D] font-bold leading-none">EAT</span>
          <span className="text-xs font-bold tracking-wider text-white leading-tight">{eatTime || "12:00:00"}</span>
        </div>

        {/* Bridge Status Indicator */}
        <div
          title={bridgeOnline === true ? "Home Bridge: ONLINE" : bridgeOnline === false ? "Home Bridge: OFFLINE" : "Home Bridge: Checking..."}
          className={`w-2.5 h-2.5 rounded-full ${
            bridgeOnline === true ? "bg-[#10B981]" : bridgeOnline === false ? "bg-[#E84855]" : "bg-[#F5C842]"
          }`}
        />
      </div>
    </header>
  );
}
