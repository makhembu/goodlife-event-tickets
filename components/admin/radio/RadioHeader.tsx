"use client";

import React, { useState, useEffect, useRef } from "react";
import { Play, Pause, SkipForward, Volume2, VolumeX, Radio, Users, Activity, AlertTriangle } from "lucide-react";

interface RadioHeaderProps {
  streamUrl?: string;
  onRefresh?: () => void;
}

export default function RadioHeader({ streamUrl = "", onRefresh }: RadioHeaderProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [audioEl, setAudioEl] = useState<HTMLAudioElement | null>(null);
  const [nowPlaying, setNowPlaying] = useState<any>(null);
  const [isSkipping, setIsSkipping] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    const audio = new Audio(streamUrl && !streamUrl.includes("darajadigital") ? streamUrl : "");
    setAudioEl(audio);

    return () => {
      audio.pause();
      audio.src = "";
    };
  }, [streamUrl]);

  const backoffRef = useRef(4000);

  const fetchNowPlaying = async () => {
    try {
      const res = await fetch("/api/admin/radio/azuracast/nowplaying");
      if (res.ok) {
        const data = await res.json();
        if (data.online === false) {
          setErrorMsg("AzuraCast Daemon Offline (Internal 24/7 Timeline Active)");
          backoffRef.current = Math.min(30000, backoffRef.current * 1.5);
          return;
        }
        setNowPlaying(data);
        setErrorMsg(null);
        backoffRef.current = 4000;
      } else {
        setErrorMsg("Station Telemetry Offline");
        backoffRef.current = Math.min(30000, backoffRef.current * 1.5);
      }
    } catch {
      setErrorMsg("Connection Timeout");
      backoffRef.current = Math.min(30000, backoffRef.current * 1.5);
    }
  };

  useEffect(() => {
    let cancelled = false;
    let timer: NodeJS.Timeout;

    const runPoll = async () => {
      await fetchNowPlaying();
      if (!cancelled) {
        timer = setTimeout(runPoll, backoffRef.current);
      }
    };

    runPoll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  const togglePlay = () => {
    if (!audioEl) return;
    if (isPlaying) {
      audioEl.pause();
      setIsPlaying(false);
    } else {
      audioEl.play().catch((err) => console.error("Audio playback error:", err));
      setIsPlaying(true);
    }
  };

  const toggleMute = () => {
    if (!audioEl) return;
    audioEl.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  const handleSkip = async () => {
    if (isSkipping) return;
    if (!confirm("Are you sure you want to skip the current track live on-air?")) return;
    setIsSkipping(true);
    try {
      const res = await fetch("/api/admin/radio/azuracast/skip", { method: "POST" });
      if (res.ok) {
        setTimeout(fetchNowPlaying, 1000);
      } else {
        alert("Failed to skip track");
      }
    } catch {
      alert("Network error skipping track");
    } finally {
      setIsSkipping(false);
    }
  };

  const currentSong = nowPlaying?.now_playing?.song || {};
  const currentElapsed = nowPlaying?.now_playing?.elapsed || 0;
  const currentDuration = nowPlaying?.now_playing?.duration || 0;
  const listenersCount = nowPlaying?.listeners?.total ?? 0;
  const isLive = nowPlaying?.live?.is_live ?? false;

  const formatSecs = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  const progressPct = currentDuration > 0 ? Math.min(100, (currentElapsed / currentDuration) * 100) : 0;

  return (
    <div className="bg-black text-white border-4 border-black p-4 mb-6 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] rounded-none">
      <div className="flex flex-col lg:flex-row items-center justify-between gap-4">
        {/* Left: Station Identity & Live Badge */}
        <div className="flex items-center gap-3 w-full lg:w-auto">
          <div className="w-12 h-12 bg-red-600 flex items-center justify-center font-black text-xl text-white border-2 border-white shadow-[2px_2px_0px_0px_#fff]">
            <Radio className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-black text-lg tracking-wider uppercase">GOODLIFE 254 ON-AIR</span>
              <span className={`px-2 py-0.5 text-xs font-mono font-bold uppercase rounded-none border border-white ${isLive ? "bg-amber-500 text-black animate-pulse" : "bg-red-600 text-white"}`}>
                {isLive ? "LIVE DJ" : "AUTODJ ON"}
              </span>
            </div>
            <div className="flex items-center gap-3 text-xs font-mono text-zinc-400 mt-0.5">
              <span className="flex items-center gap-1 text-emerald-400">
                <Users className="w-3.5 h-3.5" />
                <strong className="text-white">{listenersCount > 0 ? listenersCount : "--"}</strong> listeners
              </span>
              <span>•</span>
              <span className="flex items-center gap-1">
                <Activity className="w-3.5 h-3.5 text-cyan-400" />
                <span>192kbps MP3</span>
              </span>
            </div>
          </div>
        </div>

        {/* Center: Realtime Playout Monitor */}
        <div className="flex-1 w-full max-w-2xl bg-zinc-900 border-2 border-zinc-700 p-3">
          <div className="flex items-center justify-between text-xs font-mono mb-1">
            <span className="text-zinc-400 uppercase tracking-wider truncate max-w-[280px]">
              {currentSong.artist || "GOODLIFE RESIDENTS"}
            </span>
            <span className="text-red-400 font-bold">
              {formatSecs(currentElapsed)} / {formatSecs(currentDuration)}
            </span>
          </div>

          <div className="font-bold text-sm text-white truncate mb-2">
            {currentSong.title || "Loading stream telemetry..."}
          </div>

          {/* Progress Bar */}
          <div className="w-full bg-zinc-800 h-2 border border-zinc-700 overflow-hidden">
            <div
              className="bg-red-600 h-full transition-all duration-1000 ease-linear"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>

        {/* Right: Master Transport Controls */}
        <div className="flex items-center gap-3 w-full lg:w-auto justify-end">
          {/* Cue Headphone Audio Monitor */}
          <button
            onClick={togglePlay}
            className={`flex items-center gap-2 px-3 py-2 text-xs font-mono font-bold uppercase border-2 transition-all ${
              isPlaying
                ? "bg-emerald-500 text-black border-emerald-400 shadow-[3px_3px_0px_0px_#fff]"
                : "bg-zinc-800 text-white border-zinc-600 hover:bg-zinc-700"
            }`}
          >
            {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            <span>{isPlaying ? "MONITORING" : "CUE MONITOR"}</span>
          </button>

          {/* Mute Preview Toggle */}
          {isPlaying && (
            <button
              onClick={toggleMute}
              className="p-2 border-2 border-zinc-700 bg-zinc-800 text-zinc-300 hover:text-white"
            >
              {isMuted ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4 text-emerald-400" />}
            </button>
          )}

          {/* Skip Track Button */}
          <button
            onClick={handleSkip}
            disabled={isSkipping}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-mono font-bold uppercase bg-red-600 hover:bg-red-500 text-white border-2 border-white shadow-[3px_3px_0px_0px_#fff] disabled:opacity-50 active:translate-x-[2px] active:translate-y-[2px]"
          >
            <SkipForward className="w-4 h-4" />
            <span>{isSkipping ? "SKIPPING..." : "SKIP TRACK"}</span>
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="mt-2 text-xs font-mono text-amber-400 flex items-center gap-1.5 bg-amber-950/40 p-1 px-2 border border-amber-800">
          <AlertTriangle className="w-3.5 h-3.5" />
          <span>{errorMsg}</span>
        </div>
      )}
    </div>
  );
}
