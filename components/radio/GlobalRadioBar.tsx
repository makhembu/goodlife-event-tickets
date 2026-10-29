"use client";

import React, { useMemo, useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Play,
  Pause,
  SkipForward,
  SkipBack,
  Volume2,
  VolumeX,
  Radio,
  Maximize2,
  ChevronDown,
  X,
} from "lucide-react";
import { useRadio } from "@/context/RadioContext";
import { cleanTrackInfo } from "@/lib/radio/utils";

export default function GlobalRadioBar() {
  const pathname = usePathname();
  const {
    currentSet,
    isPlaying,
    isLive,
    liveTitle,
    quality,
    currentTime,
    duration,
    progress,
    isMuted,
    isMinimized,
    liveDropFallback,
    isDropPlaying,
    activeDropTitle,
    activePersona,
    togglePlay,
    nextTrack,
    prevTrack,
    seek,
    toggleMute,
    toggleMinimized,
    switchQuality,
  } = useRadio();

  // If on the dedicated /radio page or scanner, don't show the sticky bar
  const isDedicatedRadioPage = pathname === "/radio";
  const isScannerPage = pathname?.startsWith("/scanner");

  // Format mm:ss
  const formatTime = (secs: number) => {
    if (isNaN(secs) || secs < 0) return "0:00";
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const isCheckoutPage = useMemo(() => {
    return pathname === "/" || pathname?.startsWith("/events/");
  }, [pathname]);

  const [imgError, setImgError] = useState(false);
  useEffect(() => {
    setImgError(false);
  }, [currentSet?.id]);

  const cleanedTrack = useMemo(() => {
    if (isDropPlaying) {
      return {
        title: activeDropTitle || "STATION DROP",
        artist: activePersona || "GOODLIFE RADIO",
      };
    }
    return cleanTrackInfo(isLive ? liveTitle : currentSet?.title, currentSet?.dj_name);
  }, [isDropPlaying, activeDropTitle, activePersona, isLive, liveTitle, currentSet?.title, currentSet?.dj_name]);

  if (!currentSet && !isLive) return null;
  if (isDedicatedRadioPage || isScannerPage) return null;

  // 1. MINIMIZED STATE: Right-side compact box FAB (Non-distracting from M-Pesa goal)
  if (isMinimized) {
    return (
      <aside
        aria-label="Floating Radio Player"
        className={`fixed right-4 z-40 transition-all ${
          isCheckoutPage ? "bottom-20 sm:bottom-6 sm:right-6" : "bottom-6 right-4 sm:right-6"
        }`}
      >
        <button
          onClick={toggleMinimized}
          className="w-12 h-12 bg-brand-accent text-brand-navy border-3 border-brand-navy shadow-(--shadow-brut-md) hover:shadow-(--shadow-brut-lg) hover:bg-brand-off-white active:translate-x-0.5 active:translate-y-0.5 transition-all flex flex-col items-center justify-center relative cursor-pointer group"
          aria-label={isPlaying ? "Radio Playing - Tap to expand controls" : "Open Goodlife Radio"}
          title={isPlaying ? `Playing: ${currentSet?.title || "Radio"}` : "Goodlife Radio"}
        >
          {isPlaying ? (
            /* Equalizer bars animation when audio is playing */
            <div className="flex items-end justify-center gap-0.5 h-5 w-5">
              <span className="w-1 bg-brand-navy animate-[pulse_0.6s_ease-in-out_infinite] h-3.5" />
              <span className="w-1 bg-brand-navy animate-[pulse_0.4s_ease-in-out_infinite] h-5" />
              <span className="w-1 bg-brand-navy animate-[pulse_0.8s_ease-in-out_infinite] h-2.5" />
            </div>
          ) : (
            <Radio className="w-6 h-6 stroke-[2.2] group-hover:scale-110 transition-transform" />
          )}

          {/* Live broadcast pulse dot */}
          {isLive && (
            <span className="absolute -top-1 -right-1 flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-red-600 border border-brand-navy" />
            </span>
          )}

          <span className="sr-only">{isPlaying ? "Pause or expand radio" : "Play radio"}</span>
        </button>
      </aside>
    );
  }

  // 2. EXPANDED STATE
  return (
    <>
      {/* 2A. MOBILE VIEW: Elevated Floating Card docked neatly above M-Pesa Checkout Bar */}
      <aside
        aria-label="Mobile Floating Radio Card"
        className={`fixed left-3 right-3 z-40 sm:hidden bg-brand-navy text-brand-off-white border-3 border-brand-accent shadow-(--shadow-brut-xl) p-2.5 font-mono transition-all ${
          isCheckoutPage ? "bottom-[74px]" : "bottom-4"
        }`}
      >
        {liveDropFallback && (
          <div className="bg-amber-400 text-brand-navy text-[9px] font-black uppercase px-2 py-0.5 mb-2 flex items-center justify-between">
            <span>⚠️ Stage reconnecting...</span>
            <span>Warmup</span>
          </div>
        )}

        {/* Top line: Art + Meta + Controls + Collapse */}
        <div className="flex items-center justify-between gap-2">
          {/* Track metadata */}
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <div
              className={`w-9 h-9 border-2 border-brand-accent shrink-0 overflow-hidden bg-black flex items-center justify-center ${
                isPlaying && !isLive ? "animate-spin" : ""
              }`}
              style={{ animationDuration: "8s" }}
            >
              {currentSet?.cover_url && !imgError ? (
                <img
                  src={currentSet.cover_url}
                  alt=""
                  onError={() => setImgError(true)}
                  className="w-full h-full object-cover"
                />
              ) : (
                <Radio className="w-4 h-4 text-brand-accent" />
              )}
            </div>
            <div className="min-w-0 flex-1 truncate">
              <p className="font-display font-black text-xs uppercase tracking-wide truncate text-white leading-tight">
                {isLive ? liveTitle : cleanedTrack.title}
              </p>
              <p className="text-[9px] text-brand-accent uppercase font-bold truncate">
                {isDropPlaying
                  ? `🎙️ STATION DROP · ${activePersona || "GOODLIFE"}`
                  : isLive
                  ? "🔴 LIVE BROADCAST"
                  : cleanedTrack.artist}
              </p>
            </div>
          </div>

          {/* Quick Controls */}
          <div className="flex items-center gap-1.5 shrink-0">
            {!isLive && (
              <button
                onClick={prevTrack}
                aria-label="Previous Track"
                className="w-10 h-10 flex items-center justify-center hover:text-brand-accent transition-colors cursor-pointer active:scale-95"
              >
                <SkipBack className="w-4 h-4 fill-current" />
              </button>
            )}

            <button
              onClick={togglePlay}
              aria-label={isPlaying ? "Pause Radio" : "Play Radio"}
              className="w-10 h-10 bg-brand-accent text-brand-navy border-2 border-brand-navy flex items-center justify-center hover:bg-brand-off-white active:scale-95 transition-all cursor-pointer shadow-(--shadow-brut-xs)"
            >
              {isPlaying ? (
                <Pause className="w-4 h-4 fill-current" />
              ) : (
                <Play className="w-4 h-4 fill-current ml-0.5" />
              )}
            </button>

            {!isLive && (
              <button
                onClick={nextTrack}
                aria-label="Next Track"
                className="w-10 h-10 flex items-center justify-center hover:text-brand-accent transition-colors cursor-pointer active:scale-95"
              >
                <SkipForward className="w-4 h-4 fill-current" />
              </button>
            )}

            {/* Collapse button back to Box FAB */}
            <button
              onClick={toggleMinimized}
              aria-label="Minimize Player"
              className="w-10 h-10 flex items-center justify-center text-brand-off-white/80 hover:text-brand-accent transition-colors cursor-pointer"
              title="Minimize to Box"
            >
              <ChevronDown className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Bottom line: Scrubber */}
        {!isLive && (
          <div className="mt-1.5 flex items-center gap-2 text-[9px] text-brand-off-white/70">
            <span className="font-mono w-6 text-right">{formatTime(currentTime)}</span>
            <input
              type="range"
              min="0"
              max="100"
              value={progress || 0}
              onChange={(e) => seek(Number(e.target.value))}
              className="w-full h-1 bg-brand-navy/60 border border-brand-accent appearance-none cursor-pointer accent-brand-accent"
            />
            <span className="font-mono w-6">{formatTime(duration)}</span>
          </div>
        )}
      </aside>

      {/* 2B. DESKTOP VIEW: Full Bottom Bar docked at bottom-0 */}
      <aside
        aria-label="Persistent Radio Player"
        className="hidden sm:block fixed left-0 right-0 bottom-0 z-40 bg-brand-navy text-brand-off-white border-t-4 border-brand-accent shadow-(--shadow-brut-2xl) transition-all"
      >
        {liveDropFallback && (
          <div className="bg-amber-400 text-brand-navy font-mono text-[10px] font-black uppercase px-3 py-1 flex items-center justify-between">
            <span>⚠️ Venue stream reconnecting... playing curated festival warmup</span>
            <span className="underline">Auto-recovering</span>
          </div>
        )}

        <div className="max-w-7xl mx-auto px-4 py-2 flex items-center justify-between gap-3 font-mono">
          {/* Left: Artwork & Metadata */}
          <div className="flex items-center gap-2.5 min-w-0 max-w-[30%]">
            <div className="relative shrink-0">
              <div
                className={`w-11 h-11 border-2 border-brand-accent overflow-hidden bg-black flex items-center justify-center ${
                  isPlaying && !isLive ? "animate-spin" : ""
                }`}
                style={{ animationDuration: "8s" }}
              >
                {currentSet?.cover_url ? (
                  <img src={currentSet.cover_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <Radio className="w-5 h-5 text-brand-accent" />
                )}
              </div>
              {isLive && (
                <span className="absolute -top-1 -right-1 bg-red-600 text-white text-[8px] font-black px-1 rounded-xs animate-pulse">
                  LIVE
                </span>
              )}
            </div>

            <div className="truncate min-w-0">
              <p className="font-display font-black text-sm uppercase tracking-wide truncate leading-tight text-white">
                {isLive ? liveTitle : cleanedTrack.title}
              </p>
              <p className="text-xs text-brand-accent uppercase font-bold truncate">
                {isDropPlaying
                  ? `🎙️ STATION DROP · ${activePersona || "GOODLIFE"}`
                  : isLive
                  ? "🔴 MAIN STAGE BROADCAST"
                  : `BY ${cleanedTrack.artist}`}
              </p>
            </div>
          </div>

          {/* Center: Controls & Scrubber */}
          <div className="flex flex-col items-center gap-1 flex-1 max-w-md">
            <div className="flex items-center gap-3">
              {!isLive && (
                <button
                  onClick={prevTrack}
                  aria-label="Previous Track"
                  className="p-1 hover:text-brand-accent transition-colors cursor-pointer"
                >
                  <SkipBack className="w-4 h-4 fill-current" />
                </button>
              )}

              <button
                onClick={togglePlay}
                aria-label={isPlaying ? "Pause Radio" : "Play Radio"}
                className="w-9 h-9 bg-brand-accent text-brand-navy border-2 border-brand-navy flex items-center justify-center hover:bg-brand-off-white transition-colors shadow-(--shadow-brut-xs) cursor-pointer"
              >
                {isPlaying ? (
                  <Pause className="w-4 h-4 sm:w-5 sm:h-5 fill-current" />
                ) : (
                  <Play className="w-4 h-4 sm:w-5 sm:h-5 fill-current ml-0.5" />
                )}
              </button>

              {!isLive && (
                <button
                  onClick={nextTrack}
                  aria-label="Next Track"
                  className="p-1 hover:text-brand-accent transition-colors cursor-pointer"
                >
                  <SkipForward className="w-4 h-4 fill-current" />
                </button>
              )}
            </div>

            {!isLive && (
              <div className="w-full flex items-center gap-2 text-[10px] text-brand-off-white/70">
                <span className="w-8 text-right font-mono">{formatTime(currentTime)}</span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={progress || 0}
                  onChange={(e) => seek(Number(e.target.value))}
                  className="w-full h-1.5 bg-brand-navy/60 border border-brand-accent appearance-none cursor-pointer accent-brand-accent"
                />
                <span className="w-8 font-mono">{formatTime(duration)}</span>
              </div>
            )}
          </div>

          {/* Right: Audio Quality Toggle, Mute, Boombox Link & Minimize */}
          <div className="flex items-center gap-2 shrink-0">
            {!isLive && (
              <button
                onClick={() => switchQuality(quality === "high" ? "standard" : "high")}
                className="px-2 py-1 border border-brand-accent text-[10px] font-black uppercase hover:bg-brand-accent hover:text-brand-navy transition-colors cursor-pointer flex items-center gap-1"
                title="Toggle audio quality tier"
              >
                <span>{quality === "high" ? "🔊 HI-FI 320K" : "📱 DATA SAVER"}</span>
              </button>
            )}

            <button
              onClick={toggleMute}
              aria-label={isMuted ? "Unmute Radio" : "Mute Radio"}
              className="p-1.5 border border-brand-accent hover:bg-brand-accent hover:text-brand-navy transition-colors cursor-pointer"
            >
              {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>

            <Link
              href="/radio"
              aria-label="Open Full Boombox"
              className="p-1.5 border border-brand-accent bg-brand-accent text-brand-navy hover:bg-brand-off-white transition-colors cursor-pointer"
              title="Open Full Stage Player"
            >
              <Maximize2 className="w-4 h-4" />
            </Link>

            <button
              onClick={toggleMinimized}
              aria-label="Minimize Player"
              className="p-1.5 hover:text-brand-accent transition-colors cursor-pointer"
              title="Minimize to Box FAB"
            >
              <ChevronDown className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
