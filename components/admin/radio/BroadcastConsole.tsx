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
  Activity,
  Mic,
  Disc3,
  Wifi,
  Sparkles,
  Sliders,
  CheckCircle2,
  AlertCircle
} from "lucide-react";

interface BroadcastConsoleProps {
  streamUrl?: string;
  onMicToggle?: (active: boolean) => void;
  isMicActive?: boolean;
}

export default function BroadcastConsole({
  streamUrl = "https://dj.darajadigital.com/listen/goodlife/live.mp3",
  onMicToggle,
  isMicActive = false,
}: BroadcastConsoleProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [audioEl, setAudioEl] = useState<HTMLAudioElement | null>(null);
  const [nowPlaying, setNowPlaying] = useState<any>(null);
  const [isSkipping, setIsSkipping] = useState(false);
  const [volume, setVolume] = useState(0.85);
  const [statusState, setStatusState] = useState<"connecting" | "live" | "offline">("connecting");
  const [lastUpdated, setLastUpdated] = useState<string>("");
  const fallbackAudioUrlRef = useRef<string>("");
  const currentOffsetRef = useRef<number>(0);
  const currentTrackIdRef = useRef<number | null>(null);
  const isPlayingRef = useRef<boolean>(false);
  isPlayingRef.current = isPlaying;

  // Simulated VU Meter levels synced to playback / audio state
  const [meterLeft, setMeterLeft] = useState(14);
  const [meterRight, setMeterRight] = useState(12);

  useEffect(() => {
    const audio = new Audio(streamUrl);
    audio.volume = volume;
    audio.onended = () => {
      fetchTelemetry();
    };
    setAudioEl(audio);

    return () => {
      audio.pause();
      audio.src = "";
    };
  }, [streamUrl]);

  // Telemetry Poller: Checks AzuraCast first, with seamless fallback to internal 24/7 timeline
  const fetchTelemetry = async () => {
    try {
      const res = await fetch("/api/admin/radio/azuracast/nowplaying");
      if (res.ok) {
        const data = await res.json();
        if (data && (data.now_playing?.song?.title || data.station)) {
          setNowPlaying(data);
          setStatusState("live");
          setLastUpdated(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
          return;
        }
      }
    } catch {}

    // Fallback to internal 24/7 Virtual Broadcast Timeline engine
    try {
      const stateRes = await fetch("/api/radio/state");
      if (stateRes.ok) {
        const stateData = await stateRes.json();
        const activeSet = stateData.sets?.find((s: any) => s.id === stateData.broadcast?.active_set_id) || stateData.sets?.[0];
        if (activeSet) {
          fallbackAudioUrlRef.current = activeSet.audio_url || stateData.live?.fallback_set?.audio_url || "";
          currentOffsetRef.current = stateData.broadcast?.offset_sec || 0;

          // CRITICAL: Synchronize audio element whenever the active track changes!
          if (audioEl && isPlayingRef.current) {
            if (activeSet.id !== currentTrackIdRef.current) {
              currentTrackIdRef.current = activeSet.id;
              audioEl.src = activeSet.audio_url;
              audioEl.currentTime = stateData.broadcast?.offset_sec || 0;
              audioEl.play().catch((e) => console.warn("Playout track switch error:", e));
            }
          }

          setNowPlaying({
            station: { name: "GOODLIFE Radio 254", mounts: [{ bitrate: 192 }] },
            listeners: { total: stateData.listeners_count ?? 0 },
            live: { is_live: false },
            mode: stateData.mode || "autodj",
            now_playing: {
              song: {
                title: activeSet.title,
                artist: activeSet.dj_name,
                art: activeSet.cover_url,
              },
              elapsed: stateData.broadcast?.offset_sec || 0,
              duration: activeSet.duration_sec || 240,
            },
          });
          setStatusState("live");
          setLastUpdated(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
          return;
        }
      }
    } catch {}

    setStatusState("offline");
  };

  useEffect(() => {
    fetchTelemetry();
    const interval = setInterval(fetchTelemetry, 3500);
    return () => clearInterval(interval);
  }, []);

  // Dynamic Audio VU Meter Animation when live
  useEffect(() => {
    if (statusState !== "live") {
      setMeterLeft(0);
      setMeterRight(0);
      return;
    }

    const interval = setInterval(() => {
      // Fluctuate between -24dB and -3dB realistically
      const base = isPlaying ? 75 : 60;
      const l = Math.min(98, Math.max(15, Math.floor(base + (Math.random() * 26 - 13))));
      const r = Math.min(98, Math.max(15, Math.floor(base + (Math.random() * 24 - 12))));
      setMeterLeft(l);
      setMeterRight(r);
    }, 120);

    return () => clearInterval(interval);
  }, [statusState, isPlaying]);

  const togglePlay = () => {
    if (!audioEl) return;
    if (isPlaying) {
      audioEl.pause();
      setIsPlaying(false);
    } else {
      audioEl.play().catch((err) => {
        console.warn("Primary stream monitor unreachable, falling back to 24/7 timeline track:", err);
        if (fallbackAudioUrlRef.current && audioEl.src !== fallbackAudioUrlRef.current) {
          audioEl.src = fallbackAudioUrlRef.current;
          audioEl.play().catch((e) => console.error("Fallback track playback error:", e));
        }
      });
      setIsPlaying(true);
    }
  };

  const toggleMute = () => {
    if (!audioEl) return;
    audioEl.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    if (audioEl) audioEl.volume = val;
    if (val === 0) setIsMuted(true);
    else setIsMuted(false);
  };

  const handleSkip = async () => {
    if (isSkipping) return;
    if (!confirm("CONFIRM SKIP: Advance live broadcast to the next scheduled rotation track?")) return;
    setIsSkipping(true);
    try {
      const res = await fetch("/api/admin/radio/azuracast/skip", { method: "POST" });
      if (res.ok) {
        setTimeout(fetchTelemetry, 800);
      } else {
        alert("Skip failed on playout daemon.");
      }
    } catch {
      alert("Network timeout issuing skip command.");
    } finally {
      setIsSkipping(false);
    }
  };

  const currentSong = nowPlaying?.now_playing?.song || {};
  const currentElapsed = nowPlaying?.now_playing?.elapsed || 0;
  const currentDuration = nowPlaying?.now_playing?.duration || 0;
  const listenersCount = nowPlaying?.listeners?.total ?? 0;
  const isLiveDj = nowPlaying?.live?.is_live ?? false;
  const bitrate = nowPlaying?.station?.mounts?.[0]?.bitrate || 192;

  const formatSecs = (sec: number) => {
    if (!sec || isNaN(sec)) return "00:00";
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m < 10 ? "0" : ""}${m}:${s < 10 ? "0" : ""}${s}`;
  };

  const progressPct = currentDuration > 0 ? Math.min(100, (currentElapsed / currentDuration) * 100) : 0;
  const timeRemaining = Math.max(0, currentDuration - currentElapsed);

  return (
    <section className="bg-zinc-950 text-white border border-zinc-800 rounded-xl shadow-2xl p-5 mb-6 overflow-hidden">
      {/* Top Console Rail: Station ID, Hardware Telemetry & Connection */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800/80 pb-4 mb-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-red-600 flex items-center justify-center shadow-lg shadow-red-600/30">
            <Radio className="w-5 h-5 text-white animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm tracking-widest font-black uppercase text-white">
                GOODLIFE RADIO 254
              </span>
              <span className="px-1.5 py-0.5 rounded bg-zinc-800 border border-zinc-700 text-[10px] font-mono text-zinc-300 font-bold">
                GL-254
              </span>
            </div>
            <p className="text-[11px] font-mono text-zinc-400 flex items-center gap-2 mt-0.5">
              <span>NAIROBI BROADCAST FEED</span>
              <span>•</span>
              <span className="text-zinc-500">LIQUIDSOAP 2.1 HARBOR</span>
            </p>
          </div>
        </div>

        {/* Status Indicators & Live Badges */}
        <div className="flex items-center gap-2 font-mono text-xs">
          {/* Main Air Status */}
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border font-bold uppercase tracking-wider ${
            statusState === "live"
              ? isLiveDj
                ? "bg-amber-500/10 border-amber-500/40 text-amber-400"
                : "bg-emerald-500/10 border-emerald-500/40 text-emerald-400"
              : "bg-red-500/10 border-red-500/30 text-red-400"
          }`}>
            <span className={`w-2 h-2 rounded-full ${
              statusState === "live" ? "bg-emerald-400 animate-pulse" : "bg-red-500"
            }`} />
            <span>{statusState === "live" ? ((nowPlaying as any)?.mode === "mania" ? "ON AIR · MANIA (DJ)" : (isLiveDj ? "LIVE DJ GUEST" : "ON AIR · AUTODJ")) : "STATION OFFLINE"}</span>
          </div>

          {/* Listener Count */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-300">
            <Users className="w-3.5 h-3.5 text-cyan-400" />
            <span className="font-bold text-white">{listenersCount > 0 ? listenersCount : "--"}</span>
            <span className="text-[10px] text-zinc-400">LISTENERS</span>
          </div>

          {/* Stream Quality */}
          <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 text-[11px]">
            <Activity className="w-3.5 h-3.5 text-zinc-500" />
            <span>{bitrate} kbps MP3</span>
          </div>
        </div>
      </div>

      {/* Main Console Center: Now Playing Deck & Hardware VU Meters */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
        {/* Track Artwork / Vinyl Turntable Icon */}
        <div className="lg:col-span-2 flex items-center justify-center">
          <div className="relative w-28 h-28 rounded-xl bg-gradient-to-br from-zinc-900 to-zinc-950 border-2 border-zinc-800 flex items-center justify-center shadow-inner group">
            {currentSong.art ? (
              <img
                src={currentSong.art}
                alt="Track Art"
                className="w-full h-full object-cover rounded-xl"
              />
            ) : (
              <Disc3 className={`w-14 h-14 text-zinc-600 transition-transform duration-1000 ${
                statusState === "live" ? "animate-spin [animation-duration:6s]" : ""
              }`} />
            )}
            <div className="absolute inset-0 rounded-xl ring-1 ring-inset ring-white/10" />
          </div>
        </div>

        {/* Track Title, Artist, & Dynamic Progress */}
        <div className="lg:col-span-6 space-y-3">
          <div>
            <div className="flex items-center gap-2 text-xs font-mono text-zinc-400 mb-1">
              <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 text-[10px] font-bold uppercase">
                {isLiveDj ? "EXTERNAL HARBOR" : "ROTATION PLAYLIST"}
              </span>
              <span>•</span>
              <span className="truncate">{currentSong.artist || "GOODLIFE RESIDENTS"}</span>
            </div>
            <h2 className="text-xl md:text-2xl font-black text-white tracking-wide truncate">
              {currentSong.title || (statusState === "live" ? "Live Stream Playout Active" : "Playout Idle / Standby")}
            </h2>
          </div>

          {/* High-Precision Progress Timeline */}
          <div className="space-y-1.5">
            <div className="w-full bg-zinc-900 rounded-full h-2.5 overflow-hidden border border-zinc-800 p-0.5">
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-500 via-teal-400 to-cyan-400 transition-all duration-1000 ease-linear"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-xs font-mono text-zinc-400">
              <span className="text-zinc-300 font-bold">{formatSecs(currentElapsed)}</span>
              <span className="text-zinc-500">REMAINING -{formatSecs(timeRemaining)}</span>
              <span className="text-zinc-400">{formatSecs(currentDuration)}</span>
            </div>
          </div>
        </div>

        {/* Hardware Broadcast VU Audio Level Meters */}
        <div className="lg:col-span-4 bg-zinc-900/90 rounded-xl border border-zinc-800 p-4 space-y-3">
          <div className="flex items-center justify-between text-[11px] font-mono text-zinc-400 border-b border-zinc-800 pb-2">
            <span className="flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5 text-zinc-500" />
              <span>PEAK VU LEVEL</span>
            </span>
            <span className={statusState === "live" ? "text-emerald-400 font-bold" : "text-zinc-600"}>
              {statusState === "live" ? "-14.2 LUFS (EBU R128)" : "0.0 LUFS"}
            </span>
          </div>

          {/* Left Meter */}
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] font-bold text-zinc-400 w-3">L</span>
            <div className="flex-1 bg-zinc-950 rounded-sm h-3.5 p-0.5 border border-zinc-800 overflow-hidden flex gap-0.5">
              {Array.from({ length: 24 }).map((_, i) => {
                const filled = (i / 24) * 100 <= meterLeft;
                const isRed = i >= 21;
                const isAmber = i >= 16 && i < 21;
                return (
                  <div
                    key={i}
                    className={`flex-1 rounded-[1px] transition-all duration-75 ${
                      filled
                        ? isRed
                          ? "bg-red-500 shadow-sm shadow-red-500"
                          : isAmber
                          ? "bg-amber-400 shadow-sm shadow-amber-400"
                          : "bg-emerald-500 shadow-sm shadow-emerald-500"
                        : "bg-zinc-800/40"
                    }`}
                  />
                );
              })}
            </div>
          </div>

          {/* Right Meter */}
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] font-bold text-zinc-400 w-3">R</span>
            <div className="flex-1 bg-zinc-950 rounded-sm h-3.5 p-0.5 border border-zinc-800 overflow-hidden flex gap-0.5">
              {Array.from({ length: 24 }).map((_, i) => {
                const filled = (i / 24) * 100 <= meterRight;
                const isRed = i >= 21;
                const isAmber = i >= 16 && i < 21;
                return (
                  <div
                    key={i}
                    className={`flex-1 rounded-[1px] transition-all duration-75 ${
                      filled
                        ? isRed
                          ? "bg-red-500 shadow-sm shadow-red-500"
                          : isAmber
                          ? "bg-amber-400 shadow-sm shadow-amber-400"
                          : "bg-emerald-500 shadow-sm shadow-emerald-500"
                        : "bg-zinc-800/40"
                    }`}
                  />
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Console Master Control Rail: Monitoring, Volume, Mic & Skip */}
      <div className="flex flex-wrap items-center justify-between gap-4 mt-6 pt-4 border-t border-zinc-800/80">
        {/* Left: Cue Monitor & Volume Fader */}
        <div className="flex items-center gap-4">
          <button
            onClick={togglePlay}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-mono font-bold tracking-wider transition-all cursor-pointer ${
              isPlaying
                ? "bg-emerald-500 text-black shadow-lg shadow-emerald-500/20"
                : "bg-zinc-900 text-zinc-200 border border-zinc-700 hover:bg-zinc-800"
            }`}
          >
            {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current" />}
            <span>{isPlaying ? "CUE MONITOR ACTIVE" : "CUE HEADPHONE MONITOR"}</span>
          </button>

          {/* Monitor Volume Slider */}
          <div className="flex items-center gap-2 bg-zinc-900 px-3 py-2 rounded-lg border border-zinc-800">
            <button
              onClick={toggleMute}
              className="text-zinc-400 hover:text-white transition-colors cursor-pointer"
            >
              {isMuted || volume === 0 ? (
                <VolumeX className="w-4 h-4 text-red-400" />
              ) : (
                <Volume2 className="w-4 h-4 text-emerald-400" />
              )}
            </button>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={isMuted ? 0 : volume}
              onChange={handleVolumeChange}
              className="w-20 sm:w-24 h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
            />
            <span className="font-mono text-[10px] text-zinc-400 w-7 text-right">
              {Math.round((isMuted ? 0 : volume) * 100)}%
            </span>
          </div>
        </div>

        {/* Right: Station Actions & Emergency Skip */}
        <div className="flex items-center gap-3">
          {/* Live Mic On-Air Toggle */}
          {onMicToggle && (
            <button
              onClick={() => onMicToggle(!isMicActive)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-mono font-bold tracking-wider transition-all cursor-pointer border ${
                isMicActive
                  ? "bg-red-600 text-white border-red-500 shadow-lg shadow-red-600/30 animate-pulse"
                  : "bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-white"
              }`}
            >
              <Mic className="w-4 h-4" />
              <span>{isMicActive ? "MIC LIVE ON-AIR" : "MIC OFF-AIR"}</span>
            </button>
          )}

          {/* Skip Track */}
          <button
            onClick={handleSkip}
            disabled={isSkipping}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-mono font-bold uppercase tracking-wider bg-zinc-900 border border-zinc-700 hover:bg-zinc-800 text-zinc-200 hover:text-white transition-colors disabled:opacity-50 cursor-pointer"
          >
            <SkipForward className="w-4 h-4 text-amber-400" />
            <span>{isSkipping ? "CROSSFADING..." : "SKIP TRACK"}</span>
          </button>
        </div>
      </div>
    </section>
  );
}
