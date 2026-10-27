"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import {
  Flame,
  ArrowLeft,
  Play,
  Pause,
  SkipForward,
  SkipBack,
  Volume2,
  VolumeX,
  Radio,
  RadioTower,
  Music2,
  Check,
  Disc3,
  Search,
  Sparkles,
  Zap,
  SlidersHorizontal,
  RotateCw,
} from "lucide-react";
import { useRadio } from "@/context/RadioContext";
import FestivalSetVault from "@/components/radio/FestivalSetVault";
import { cleanTrackInfo, formatTime } from "@/lib/radio/utils";

export default function RadioPage() {
  const {
    currentSet,
    isPlaying,
    isLive,
    isSyncedToBroadcast,
    liveTitle,
    quality,
    currentTime,
    duration,
    progress,
    isMuted,
    volume = 1,
    queue,
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
    switchQuality,
  } = useRadio();

  const [imgError, setImgError] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedGenre, setSelectedGenre] = useState<string>("ALL");
  const [activeTab, setActiveTab] = useState<"playlist" | "vault">("playlist");

  useEffect(() => {
    setImgError(false);
  }, [currentSet?.id]);

  // Clean current track information
  const cleanedCurrent = useMemo(() => {
    return cleanTrackInfo(isLive ? liveTitle : currentSet?.title, currentSet?.dj_name);
  }, [isLive, liveTitle, currentSet?.title, currentSet?.dj_name]);

  // Extract unique genres for filter chips
  const genres = useMemo(() => {
    const setOfGenres = new Set<string>();
    queue.forEach((t) => {
      if (t.genre && t.genre.trim()) setOfGenres.add(t.genre.trim().toUpperCase());
    });
    return ["ALL", ...Array.from(setOfGenres).slice(0, 6)];
  }, [queue]);

  // Filtered queue based on search & genre
  const filteredQueue = useMemo(() => {
    return queue.filter((t) => {
      const q = searchQuery.toLowerCase().trim();
      const matchSearch =
        !q ||
        t.title?.toLowerCase().includes(q) ||
        t.dj_name?.toLowerCase().includes(q) ||
        t.genre?.toLowerCase().includes(q);

      const matchGenre =
        selectedGenre === "ALL" || (t.genre && t.genre.trim().toUpperCase() === selectedGenre);

      return matchSearch && matchGenre;
    });
  }, [queue, searchQuery, selectedGenre]);

  // Calculate current track index
  const currentIndex = useMemo(() => {
    if (!currentSet) return 0;
    return queue.findIndex((t) => t.id === currentSet.id);
  }, [queue, currentSet?.id]);

  // Real or simulated track times for display
  const effectiveCurrentTime = currentTime > 0 ? currentTime : 0;
  const effectiveDuration = duration > 0 ? duration : (currentSet?.duration_sec || 180);

  return (
    <div className="min-h-screen bg-brand-bg py-6 px-4 md:px-10 text-brand-navy font-sans relative selection:bg-brand-accent selection:text-brand-navy">
      {/* Background Subtle Atmosphere Texture */}
      <div
        className="absolute inset-0 z-0 pointer-events-none opacity-25"
        style={{
          backgroundImage:
            "radial-gradient(rgba(22,24,29,0.18) 1px, transparent 1px), radial-gradient(rgba(223,187,125,0.15) 1px, transparent 1px)",
          backgroundSize: "28px 28px, 56px 56px",
          backgroundPosition: "0 0, 14px 14px",
        }}
      />

      <div className="relative z-10 max-w-5xl mx-auto space-y-6">
        {/* ========================================================================= */}
        {/* STATION HEADER BAR                                                        */}
        {/* ========================================================================= */}
        <header className="w-full flex flex-wrap items-center justify-between gap-4 border-b-4 border-brand-navy pb-4">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="p-2.5 border-2 border-brand-navy bg-brand-off-white hover:bg-brand-accent hover:translate-x-0.5 hover:-translate-y-0.5 transition-all shadow-(--shadow-brut-xs) flex items-center justify-center cursor-pointer"
              title="Return to Festival Gate"
            >
              <ArrowLeft className="w-5 h-5 text-brand-navy" />
            </Link>

            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-display text-2xl sm:text-3xl tracking-wide uppercase text-brand-navy leading-none">
                  GOODLIFE RADIO
                </h1>
                <span className="font-mono text-[10px] font-bold text-brand-navy/60 hidden sm:inline uppercase tracking-widest">
                  98.4 FM · STEREO
                </span>
              </div>
              <p className="font-mono text-[11px] font-semibold text-brand-navy/70 tracking-wider uppercase mt-0.5">
                NAIROBI LIVE FESTIVAL AIRWAVE
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {/* Live Broadcast / Mode Pill */}
            {isLive ? (
              <span className="bg-red-600 text-white font-mono text-[11px] font-black px-3 py-1 uppercase flex items-center gap-1.5 border-2 border-brand-navy shadow-(--shadow-brut-xs) animate-pulse">
                <RadioTower className="w-3.5 h-3.5" />
                <span>LIVE STAGE BROADCAST</span>
              </span>
            ) : isSyncedToBroadcast ? (
              <span className="bg-emerald-600 text-white font-mono text-[11px] font-black px-3 py-1 uppercase flex items-center gap-1.5 border-2 border-brand-navy shadow-(--shadow-brut-xs)">
                <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                <span>24/7 ON AIR</span>
              </span>
            ) : (
              <button
                type="button"
                onClick={snapToBroadcast}
                className="bg-brand-accent hover:bg-white text-brand-navy border-2 border-brand-navy font-mono text-[11px] font-black px-3 py-1 uppercase flex items-center gap-1.5 cursor-pointer transition-all shadow-(--shadow-brut-xs) hover:scale-105 active:scale-95"
                title="Snap back to 24/7 synchronized Nairobi broadcast"
              >
                <Zap className="w-3.5 h-3.5 text-brand-navy fill-brand-navy" />
                <span>SNAP TO LIVE</span>
              </button>
            )}

            {/* Audio Quality Switcher */}
            {!isLive && (
              <button
                onClick={() => switchQuality(quality === "high" ? "standard" : "high")}
                className="px-3 py-1 border-2 border-brand-navy bg-white hover:bg-brand-accent font-mono text-[11px] font-black uppercase shadow-(--shadow-brut-xs) transition-all cursor-pointer hover:translate-x-0.5 hover:-translate-y-0.5"
                title="Toggle stream bitrate"
              >
                {quality === "high" ? "🔊 320K HD" : "📱 192K ECO"}
              </button>
            )}
          </div>
        </header>

        {/* ========================================================================= */}
        {/* HERO DECK CONSOLE (THE CENTERPIECE)                                       */}
        {/* ========================================================================= */}
        {!currentSet && !isLive ? (
          !hasLoaded ? (
            <div className="border-4 border-brand-navy bg-brand-navy text-white shadow-(--shadow-brut-xl) rounded-2xl p-8 sm:p-12 text-center space-y-6 relative overflow-hidden">
              <div className="absolute -top-16 -left-16 w-80 h-80 bg-brand-accent/20 rounded-full blur-3xl pointer-events-none" />
              <div className="relative z-10 flex flex-col items-center justify-center space-y-4">
                <div className="relative">
                  <div className="w-16 h-16 rounded-full bg-brand-accent/20 flex items-center justify-center border-2 border-brand-accent animate-ping absolute inset-0" />
                  <div className="w-16 h-16 rounded-full bg-brand-accent flex items-center justify-center border-2 border-brand-navy relative z-10 shadow-(--shadow-brut-sm)">
                    <Radio className="w-8 h-8 text-brand-navy animate-pulse" />
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="inline-flex items-center gap-2 bg-brand-accent/20 border border-brand-accent px-3 py-1 rounded-full text-brand-accent font-mono text-xs font-bold tracking-widest">
                    <span className="w-2 h-2 rounded-full bg-brand-accent animate-ping" />
                    <span>TUNING 98.4 MHZ · NAIROBI FREQUENCY</span>
                  </div>
                  <h3 className="font-bebas text-3xl sm:text-4xl tracking-wider text-white">
                    CONNECTING LIVE BROADCAST FEED
                  </h3>
                  <p className="font-mono text-xs text-white/70 max-w-md mx-auto">
                    Synchronizing 24/7 Marara Camp stage timeline, dynamic Kenyan drops & audio streams...
                  </p>
                </div>
                {/* Simulated frequency tuner dial */}
                <div className="w-full max-w-sm h-3 bg-black/40 border border-white/20 rounded-full overflow-hidden p-0.5">
                  <div className="h-full bg-brand-accent rounded-full animate-pulse w-3/4" />
                </div>
              </div>
            </div>
          ) : (
            <div className="border-4 border-brand-navy bg-white shadow-(--shadow-brut-md) rounded-2xl p-8 text-center space-y-4 font-mono">
              <Radio className="w-12 h-12 text-brand-navy/40 mx-auto" />
              <div className="space-y-1">
                <h3 className="font-bebas text-2xl text-brand-navy tracking-wider">
                  STATION OFFLINE · NO BROADCAST SETS FOUND
                </h3>
                <p className="text-xs text-brand-navy/60 max-w-md mx-auto">
                  Unable to reach the live Nairobi broadcast playlist. Check your internet connection or reload the airwaves.
                </p>
              </div>
              <button
                type="button"
                onClick={() => fetchRadioState()}
                className="inline-flex items-center gap-2 px-4 py-2 bg-brand-accent hover:bg-brand-accent-hover text-brand-navy border-2 border-brand-navy font-bold text-xs uppercase shadow-(--shadow-brut-xs) cursor-pointer"
              >
                <RotateCw className="w-4 h-4" />
                <span>Retry Frequency Connection</span>
              </button>
            </div>
          )
        ) : (
          <div className="space-y-8">
            <div className="relative border-4 border-brand-navy bg-brand-navy text-brand-off-white shadow-(--shadow-brut-xl) rounded-2xl p-6 sm:p-8 overflow-hidden">
              {/* Warm Ambient Golden Stage Glow */}
              <div className="absolute -top-16 -left-16 w-80 h-80 bg-brand-accent/20 rounded-full blur-3xl pointer-events-none" />
              <div className="absolute -bottom-16 -right-16 w-80 h-80 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

              {/* Console Deck Top Dial Strip */}
              <div className="relative z-10 flex flex-wrap items-center justify-between gap-3 border-b-2 border-white/10 pb-4 mb-6">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-brand-accent animate-ping" />
                  <span className="font-mono text-[11px] font-bold text-brand-accent tracking-widest uppercase">
                    {isLive ? "VENUES ON AIR · MARARA CAMP LIVE" : "VIRTUAL DECK 254 · LIVE BROADCAST ENGINE"}
                  </span>
                </div>

                {/* Dynamic On-Air DJ Drop Banner */}
                {isDropPlaying && (
                  <div className="flex items-center gap-2 bg-brand-accent text-brand-navy border-2 border-brand-navy px-3 py-1 rounded-full font-mono text-xs font-black uppercase tracking-wider animate-bounce shadow-(--shadow-brut-xs)">
                    <span className="w-2 h-2 rounded-full bg-red-600 animate-ping" />
                    <span>🎙️ DJ DROP: {activeDropTitle || "KENYAN SHENG VIBES"}</span>
                  </div>
                )}

                {/* Animated Equalizer Bar Spectrum */}
                <div className="flex items-end gap-1 h-5 px-3 py-1 rounded bg-black/40 border border-white/10">
                  {[45, 80, 60, 95, 30, 70, 100, 50, 85, 40, 90, 65].map((h, i) => (
                    <span
                      key={i}
                      className={`w-1 rounded-t transition-all duration-300 ${
                        isPlaying && !isLive
                          ? "bg-brand-accent"
                          : "bg-white/20"
                      }`}
                      style={{
                        height: isPlaying && !isLive ? `${Math.max(20, (h * ((i % 3) + 1)) % 100)}%` : "20%",
                        animation: isPlaying && !isLive ? `pulse ${0.4 + (i % 5) * 0.15}s ease-in-out infinite alternate` : "none",
                      }}
                    />
                  ))}
                </div>
              </div>

              {/* Main Deck Interior (Vinyl Turntable + Controls) */}
              <div className="relative z-10 grid grid-cols-1 md:grid-cols-12 gap-5 md:gap-8 items-center">
                
                {/* 1. Left Side: Full Vinyl Turntable & Sleeve (Desktop md:flex only) */}
                <div className="hidden md:flex md:col-span-5 justify-center">
                  <div className="relative w-64 h-64 sm:w-72 sm:h-72 group">
                    {/* Rotating Vinyl Record Peeking Out */}
                    <div
                      className={`absolute top-2 -right-4 sm:-right-8 w-60 h-60 sm:w-68 sm:h-68 rounded-full border-4 border-black bg-neutral-950 shadow-2xl flex items-center justify-center transition-transform duration-700 ${
                        isPlaying && !isLive ? "translate-x-4 sm:translate-x-8" : "translate-x-0"
                      }`}
                    >
                      {/* Realistic Vinyl Grooves */}
                      <div className="w-52 h-52 sm:w-60 sm:h-60 rounded-full border border-white/5 flex items-center justify-center">
                        <div className="w-44 h-44 sm:w-52 sm:h-52 rounded-full border border-white/10 flex items-center justify-center">
                          <div className="w-36 h-36 sm:w-44 sm:h-44 rounded-full border border-white/5 flex items-center justify-center">
                            {/* Vinyl Center Label */}
                            <div
                              className={`w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-brand-accent border-4 border-brand-navy flex flex-col items-center justify-center text-brand-navy shadow-inner ${
                                isPlaying && !isLive ? "animate-[spin_6s_linear_infinite]" : ""
                              }`}
                            >
                              <Disc3 className="w-7 h-7 text-brand-navy" />
                              <span className="font-mono text-[8px] font-black tracking-tighter uppercase mt-0.5">
                                GOODLIFE
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Album Sleeve Cover Art */}
                    <div className="relative z-10 w-60 h-60 sm:w-68 sm:h-68 rounded-xl border-4 border-brand-navy-light bg-neutral-900 overflow-hidden shadow-2xl flex items-center justify-center group-hover:scale-[1.02] transition-transform">
                      {currentSet?.cover_url && !imgError ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={currentSet.cover_url}
                          alt="Cover"
                          onError={() => setImgError(true)}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-neutral-900 to-black p-4 text-center">
                          <div
                            className={`w-28 h-28 rounded-full border-4 border-brand-accent flex items-center justify-center ${
                              isPlaying && !isLive ? "animate-[spin_4s_linear_infinite]" : ""
                            }`}
                          >
                            <Disc3 className="w-14 h-14 text-brand-accent" />
                          </div>
                          <span className="font-mono text-[10px] font-bold text-white/60 tracking-widest uppercase mt-3">
                            GOODLIFE STEREO
                          </span>
                        </div>
                      )}

                      {/* Corner Badge */}
                      <div className="absolute top-3 left-3 bg-brand-accent text-brand-navy font-mono font-black text-[10px] px-2.5 py-1 uppercase tracking-widest border border-brand-navy shadow-md flex items-center gap-1.5">
                        {isLive ? (
                          <>
                            <span className="w-2 h-2 rounded-full bg-red-600 animate-ping" />
                            <span>STAGE LIVE</span>
                          </>
                        ) : (
                          <span>SET #{currentIndex + 1} OF {queue.length}</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* 2. Controls & Metadata Column (7 Cols on desktop, Full width on mobile) */}
                <div className="md:col-span-7 flex flex-col justify-between space-y-4 md:space-y-6">
                  {/* 2A. Mobile View: Compact Horizontal Deck (<340px Total Above-The-Fold) */}
                  <div className="flex md:hidden items-center gap-3.5">
                    <div className="relative w-20 h-20 sm:w-24 sm:h-24 shrink-0 rounded-xl border-3 border-brand-navy-light bg-neutral-900 overflow-hidden shadow-lg flex items-center justify-center">
                      {currentSet?.cover_url && !imgError ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={currentSet.cover_url}
                          alt="Cover"
                          onError={() => setImgError(true)}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center bg-black text-center p-2">
                          <Disc3 className={`w-8 h-8 text-brand-accent ${isPlaying && !isLive ? "animate-[spin_4s_linear_infinite]" : ""}`} />
                        </div>
                      )}
                      <div className="absolute top-1 left-1 bg-brand-accent text-brand-navy font-mono font-black text-[8px] px-1.5 py-0.5 uppercase tracking-wider border border-brand-navy shadow-xs">
                        {isLive ? "STAGE" : `#${currentIndex + 1}`}
                      </div>
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5 mb-1">
                        <span className="px-1.5 py-0.5 border border-brand-accent/40 bg-brand-accent/10 text-brand-accent font-mono text-[9px] font-bold uppercase tracking-wider rounded">
                          {isLive ? "LIVE VENUE" : (currentSet?.genre || "FESTIVAL EXCLUSIVE")}
                        </span>
                        <span className="px-1.5 py-0.5 border border-white/20 bg-white/5 text-white/70 font-mono text-[9px] uppercase rounded">
                          {quality === "high" ? "320K" : "192K"}
                        </span>
                      </div>
                      <h2 className="font-display text-2xl sm:text-3xl uppercase tracking-wide text-brand-off-white leading-tight line-clamp-2">
                        {cleanedCurrent.title}
                      </h2>
                      <p className="font-mono text-xs font-bold tracking-wider uppercase text-brand-accent mt-0.5 truncate">
                        BY {cleanedCurrent.artist}
                      </p>
                    </div>
                  </div>

                  {/* 2B. Desktop View: Full Cleaned Title & Artist Info */}
                  <div className="hidden md:block">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="px-2 py-0.5 border border-brand-accent/40 bg-brand-accent/10 text-brand-accent font-mono text-[10px] font-bold uppercase tracking-widest rounded">
                        {isLive ? "LIVE VENUE" : (currentSet?.genre || "FESTIVAL EXCLUSIVE")}
                      </span>
                      {!isLive && currentSet?.duration && (
                        <span className="px-2 py-0.5 border border-white/20 bg-white/5 text-white/70 font-mono text-[10px] uppercase tracking-wider rounded">
                          {currentSet.duration}
                        </span>
                      )}
                      <span className="px-2 py-0.5 border border-white/20 bg-white/5 text-white/70 font-mono text-[10px] uppercase tracking-wider rounded">
                        {quality === "high" ? "320 KBPS HI-FI" : "192 KBPS"}
                      </span>
                    </div>

                    <h2 className="font-display text-3xl sm:text-4xl lg:text-5xl uppercase tracking-wide text-brand-off-white leading-[1.05] line-clamp-2">
                      {cleanedCurrent.title}
                    </h2>

                    <p className="font-mono text-sm sm:text-base font-bold tracking-widest uppercase text-brand-accent mt-2 flex items-center gap-2">
                      <span>BY {cleanedCurrent.artist}</span>
                      {cleanedCurrent.remix && (
                        <span className="text-[10px] px-2 py-0.5 bg-brand-accent/20 border border-brand-accent text-brand-accent rounded font-mono">
                          {cleanedCurrent.remix}
                        </span>
                      )}
                    </p>
                  </div>

                  {/* Scrubber & Timeline Progress (Vault/Curated mode) vs Live Stream Banner (Live mode) */}
                  {!isLive ? (
                    <div className="space-y-2 pt-1">
                      <div className="flex items-center justify-between font-mono text-xs text-white/60">
                        <span className="text-brand-accent font-bold">
                          {formatTime(effectiveCurrentTime)}
                        </span>
                        <span>
                          {formatTime(effectiveDuration)}
                        </span>
                      </div>

                      <div className="relative flex items-center group">
                        <input
                          type="range"
                          min="0"
                          max="100"
                          step="0.1"
                          value={progress || 0}
                          onChange={(e) => seek(Number(e.target.value))}
                          className="w-full h-3 bg-white/15 rounded-full appearance-none cursor-pointer accent-brand-accent transition-all hover:bg-white/25 focus:outline-none"
                        />
                      </div>

                      {/* Broadcast Synchronization Indicator */}
                      <div className="flex items-center justify-between font-mono text-[10px] text-white/50 pt-0.5">
                        {isSyncedToBroadcast ? (
                          <span className="text-emerald-400 flex items-center gap-1 font-bold">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            SYNCED TO 24/7 GLOBAL NAIROBI TIMECODE
                          </span>
                        ) : (
                          <span className="text-amber-400 flex items-center gap-1">
                            <span>ON-DEMAND PREVIEW MODE</span>
                            <button
                              type="button"
                              onClick={snapToBroadcast}
                              className="text-brand-accent underline hover:text-white font-bold ml-1 cursor-pointer"
                            >
                              [SNAP BACK TO BROADCAST]
                            </button>
                          </span>
                        )}
                        <span>BROADCAST CLOCK</span>
                      </div>
                    </div>
                  ) : (
                    <div className="py-2.5 px-4 rounded-xl bg-black/50 border border-brand-accent/30 flex items-center justify-between font-mono text-xs">
                      <div className="flex items-center gap-2.5">
                        <span className="w-2.5 h-2.5 rounded-full bg-red-600 animate-ping" />
                        <span className="font-bold text-brand-off-white tracking-wider">
                          LIVE STAGE FEED · CONTINUOUS 24/7 HLS BROADCAST
                        </span>
                      </div>
                      <span className="text-brand-accent font-black text-[11px] uppercase tracking-widest bg-brand-accent/10 px-2 py-0.5 rounded border border-brand-accent/20">
                        CLOUD CDN
                      </span>
                    </div>
                  )}

                  {/* Master Transport Controls */}
                  <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
                    <div className="flex items-center gap-3">
                      {!isLive && (
                        <button
                          onClick={prevTrack}
                          className="w-12 h-12 rounded-xl border-2 border-white/20 bg-white/10 hover:bg-white/20 hover:text-brand-accent hover:border-brand-accent flex items-center justify-center transition-all cursor-pointer active:scale-95 shadow-md"
                          title="Previous Track"
                        >
                          <SkipBack className="w-5 h-5 fill-current" />
                        </button>
                      )}

                      {/* Primary Play / Pause Button */}
                      <button
                        onClick={togglePlay}
                        className="w-16 h-16 rounded-2xl border-3 border-brand-navy bg-brand-accent hover:bg-brand-accent-vivid text-brand-navy flex items-center justify-center transition-all cursor-pointer hover:scale-105 active:scale-95 shadow-[0_0_24px_rgba(223,187,125,0.4)]"
                        title={isPlaying ? "Pause" : "Play"}
                      >
                        {isPlaying ? (
                          <Pause className="w-8 h-8 fill-brand-navy" />
                        ) : (
                          <Play className="w-8 h-8 fill-brand-navy ml-1" />
                        )}
                      </button>

                      {!isLive && (
                        <button
                          onClick={nextTrack}
                          className="w-12 h-12 rounded-xl border-2 border-white/20 bg-white/10 hover:bg-white/20 hover:text-brand-accent hover:border-brand-accent flex items-center justify-center transition-all cursor-pointer active:scale-95 shadow-md"
                          title="Next Track"
                        >
                          <SkipForward className="w-5 h-5 fill-current" />
                        </button>
                      )}
                    </div>

                    {/* Tactile Volume Controls */}
                    <div className="flex items-center gap-2.5 bg-black/30 border border-white/10 px-3 py-2 rounded-xl">
                      <button
                        onClick={toggleMute}
                        className="text-white/70 hover:text-brand-accent transition-colors cursor-pointer"
                        title={isMuted ? "Unmute" : "Mute"}
                      >
                        {isMuted ? (
                          <VolumeX className="w-4 h-4 text-red-400" />
                        ) : (
                          <Volume2 className="w-4 h-4" />
                        )}
                      </button>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        value={isMuted ? 0 : volume}
                        onChange={(e) => setVolume(parseFloat(e.target.value))}
                        className="w-18 sm:w-24 h-1.5 bg-white/20 rounded-full appearance-none accent-brand-accent cursor-pointer"
                        title="Master Volume"
                      />
                      <span className="font-mono text-[10px] text-white/50 w-7 text-right">
                        {isMuted ? "0%" : `${Math.round(volume * 100)}%`}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* ========================================================================= */}
            {/* LIBRARY SECTION: TABS FOR ON-AIR TRACKLIST & ARCHIVED VAULT               */}
            {/* ========================================================================= */}
            <div className="space-y-4">
              {/* Tabs Switcher */}
              <div className="flex border-b-4 border-brand-navy gap-2">
                <button
                  type="button"
                  onClick={() => setActiveTab("playlist")}
                  className={`px-6 py-3 font-display text-lg tracking-wide uppercase transition-all cursor-pointer border-t-2 border-x-2 border-brand-navy rounded-t-lg flex items-center gap-2 ${
                    activeTab === "playlist"
                      ? "bg-brand-navy text-brand-off-white font-bold"
                      : "bg-white hover:bg-brand-off-white text-brand-navy"
                  }`}
                >
                  <Music2 className="w-4 h-4" />
                  <span>ON-AIR TRACKLIST ({queue.length})</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab("vault")}
                  className={`px-6 py-3 font-display text-lg tracking-wide uppercase transition-all cursor-pointer border-t-2 border-x-2 border-brand-navy rounded-t-lg flex items-center gap-2 ${
                    activeTab === "vault"
                      ? "bg-brand-navy text-brand-off-white font-bold"
                      : "bg-white hover:bg-brand-off-white text-brand-navy"
                  }`}
                >
                  <Disc3 className="w-4 h-4" />
                  <span>FESTIVAL SET VAULT</span>
                </button>
              </div>

              {/* TAB 1: ON-AIR TRACKLIST EXPLORER */}
              {activeTab === "playlist" && (
                <div className="p-6 border-4 border-brand-navy bg-white shadow-(--shadow-brut-md) rounded-xl space-y-5">
                  {/* Search & Genre Filter Bar */}
                  <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
                    {/* Search Input */}
                    <div className="relative flex-1">
                      <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-brand-navy/40" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search tracks, DJs, or genres..."
                        className="w-full pl-10 pr-4 py-2 bg-brand-off-white border-2 border-brand-navy font-mono text-base sm:text-xs placeholder:text-brand-navy/40 focus:outline-none focus:bg-white rounded"
                      />
                      {searchQuery && (
                        <button
                          onClick={() => setSearchQuery("")}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-mono text-brand-navy/50 hover:text-brand-navy"
                        >
                          CLEAR
                        </button>
                      )}
                    </div>

                    {/* Genre Quick Filter Chips */}
                    <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
                      {genres.map((g) => (
                        <button
                          key={g}
                          onClick={() => setSelectedGenre(g)}
                          className={`px-2.5 py-1 text-[10px] font-mono font-bold uppercase tracking-wider rounded border transition-all cursor-pointer shrink-0 ${
                            selectedGenre === g
                              ? "bg-brand-navy text-brand-off-white border-brand-navy"
                              : "bg-white text-brand-navy/70 border-brand-navy/30 hover:bg-brand-off-white hover:text-brand-navy"
                          }`}
                        >
                          {g}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Filtered Tracklist Table queue.map */}
                  <div className="divide-y-2 divide-brand-navy/10 max-h-[460px] overflow-y-auto pr-2 custom-scrollbar">
                    {filteredQueue.length === 0 ? (
                      <div className="py-12 text-center font-mono text-xs uppercase text-brand-navy/60">
                        No festival tracks match &quot;{searchQuery}&quot;
                      </div>
                    ) : (
                      filteredQueue.map((track, i) => {
                        const isSelected = currentSet?.id === track.id;
                        const cleaned = cleanTrackInfo(track.title, track.dj_name);

                        return (
                          <div
                            key={track.id}
                            onClick={() => playSet(track)}
                            className={`flex items-center justify-between p-3 rounded-lg transition-all cursor-pointer group ${
                              isSelected
                                ? "bg-brand-accent/25 border-2 border-brand-navy font-bold shadow-(--shadow-brut-xs)"
                                : "hover:bg-brand-off-white hover:translate-x-0.5 border-2 border-transparent"
                            }`}
                          >
                            <div className="flex items-center gap-3.5 min-w-0">
                              {/* Position or Playing Equalizer Animation */}
                              <div className="w-6 flex items-center justify-center shrink-0">
                                {isSelected && isPlaying ? (
                                  <div className="flex items-end gap-0.5 h-4">
                                    <span className="w-1 bg-brand-navy animate-[pulse_0.4s_ease-in-out_infinite_alternate] h-full rounded" />
                                    <span className="w-1 bg-brand-navy animate-[pulse_0.6s_ease-in-out_infinite_alternate] h-3/4 rounded" />
                                    <span className="w-1 bg-brand-navy animate-[pulse_0.5s_ease-in-out_infinite_alternate] h-1/2 rounded" />
                                  </div>
                                ) : isSelected ? (
                                  <Check className="w-4 h-4 text-brand-navy" />
                                ) : (
                                  <span className="text-xs font-mono text-brand-navy/50 font-semibold">
                                    {i + 1}
                                  </span>
                                )}
                              </div>

                              {/* Small Track Thumbnail */}
                              <div className="w-10 h-10 rounded border border-brand-navy/30 overflow-hidden bg-brand-navy shrink-0 relative flex items-center justify-center">
                                {track.cover_url ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    src={track.cover_url}
                                    alt=""
                                    className="w-full h-full object-cover"
                                  />
                                ) : (
                                  <Disc3 className="w-5 h-5 text-brand-accent" />
                                )}
                              </div>

                              {/* Track Title and Artist */}
                              <div className="truncate min-w-0">
                                <p className="text-sm font-bold uppercase truncate text-brand-navy leading-tight">
                                  {cleaned.title}
                                </p>
                                <p className="text-[11px] text-brand-navy/60 uppercase font-mono tracking-wide mt-0.5 truncate">
                                  {cleaned.artist}
                                </p>
                              </div>
                            </div>

                            {/* Genre Pill, Duration & Play Hover Action */}
                            <div className="flex items-center gap-3 shrink-0 ml-3">
                              {track.genre && (
                                <span className="hidden sm:inline px-2 py-0.5 border border-brand-navy/20 bg-brand-off-white text-[10px] font-mono uppercase font-bold text-brand-navy/70 rounded">
                                  {track.genre}
                                </span>
                              )}
                              <span className="font-mono text-xs text-brand-navy/60 font-semibold">
                                {track.duration || "3:30"}
                              </span>

                              <button
                                className={`w-8 h-8 rounded-full border border-brand-navy flex items-center justify-center transition-all ${
                                  isSelected
                                    ? "bg-brand-navy text-brand-off-white"
                                    : "bg-white text-brand-navy group-hover:bg-brand-accent"
                                }`}
                              >
                                {isSelected && isPlaying ? (
                                  <Pause className="w-3.5 h-3.5 fill-current" />
                                ) : (
                                  <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                                )}
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}

              {/* TAB 2: FESTIVAL SET VAULT (RECORDINGS & EXTENDED RECAPS) */}
              {activeTab === "vault" && (
                <FestivalSetVault />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
