"use client";

import React, { useMemo } from "react";
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
  ExternalLink,
  ChevronDown,
  Maximize2,
  RadioTower,
} from "lucide-react";
import { useRadio } from "@/context/RadioContext";

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

  if (!currentSet && !isLive) return null;
  if (isDedicatedRadioPage || isScannerPage) return null;

  // MINIMIZED FLOATING PILL
  if (isMinimized) {
    return (
      <aside
        aria-label="Floating Radio Player"
        className={`fixed left-4 z-40 transition-all ${
          isCheckoutPage ? "bottom-20 sm:bottom-4" : "bottom-4"
        }`}
      >
        <button
          onClick={toggleMinimized}
          className="group relative flex items-center gap-2 p-2.5 bg-brand-navy text-brand-off-white border-3 border-brand-accent shadow-(--shadow-brut-md) hover:bg-brand-accent hover:text-brand-navy transition-all cursor-pointer"
          title="Expand GOODLIFE Radio Player"
        >
          <div
            className={`w-7 h-7 rounded-full border-2 border-current flex items-center justify-center ${
              isPlaying ? "animate-spin" : ""
            }`}
          >
            <Radio className="w-3.5 h-3.5" />
          </div>

          <span className="font-mono text-xs font-black uppercase tracking-wider hidden sm:inline">
            {isLive ? "LIVE STAGE" : "RADIO"}
          </span>

          {isPlaying && (
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          )}
        </button>
      </aside>
    );
  }

  // EXPANDED STICKY BOTTOM BAR
  return (
    <aside
      aria-label="Persistent Radio Player"
      className={`fixed left-0 right-0 z-40 bg-brand-navy text-brand-off-white border-t-4 border-brand-accent shadow-(--shadow-brut-2xl) transition-all ${
        isCheckoutPage ? "bottom-16 sm:bottom-0" : "bottom-0"
      }`}
    >
      {/* Live fallback notification if venue network drops */}
      {liveDropFallback && (
        <div className="bg-amber-400 text-brand-navy font-mono text-[10px] font-black uppercase px-3 py-1 flex items-center justify-between">
          <span>⚠️ Venue stream reconnecting... playing curated festival warmup</span>
          <span className="underline">Auto-recovering</span>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-3 sm:px-4 py-2 sm:py-2.5 flex items-center justify-between gap-3 font-mono">
        
        {/* Left: Artwork & Metadata */}
        <div className="flex items-center gap-2.5 min-w-0 max-w-[40%] sm:max-w-[30%]">
          <div className="relative shrink-0">
            <div
              className={`w-10 h-10 sm:w-11 sm:h-11 border-2 border-brand-accent overflow-hidden bg-black flex items-center justify-center ${
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
            <p className="font-display font-black text-xs sm:text-sm uppercase tracking-wide truncate leading-tight">
              {isLive ? liveTitle : currentSet?.title}
            </p>
            <p className="text-[10px] sm:text-xs text-brand-accent uppercase font-bold truncate">
              {isLive ? "🔴 MAIN STAGE BROADCAST" : `BY ${currentSet?.dj_name}`}
            </p>
          </div>
        </div>

        {/* Center: Playback Controls & Scrubber */}
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
              className="w-8 h-8 sm:w-9 sm:h-9 bg-brand-accent text-brand-navy border-2 border-brand-navy flex items-center justify-center hover:bg-brand-off-white transition-colors shadow-(--shadow-brut-xs) cursor-pointer"
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

          {/* Scrubber bar (only on on-demand sets) */}
          {!isLive && (
            <div className="w-full flex items-center gap-2 text-[10px] text-brand-off-white/70">
              <span className="hidden sm:inline w-8 text-right font-mono">{formatTime(currentTime)}</span>
              <input
                type="range"
                min="0"
                max="100"
                value={progress || 0}
                onChange={(e) => seek(Number(e.target.value))}
                className="w-full h-1.5 bg-brand-navy/60 border border-brand-accent appearance-none cursor-pointer accent-brand-accent"
              />
              <span className="hidden sm:inline w-8 font-mono">{formatTime(duration)}</span>
            </div>
          )}
        </div>

        {/* Right: Audio Quality Toggle, Mute, Boombox Link & Minimize */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* Quality Switcher */}
          {!isLive && (
            <button
              onClick={() => switchQuality(quality === "high" ? "standard" : "high")}
              className="px-2 py-1 border border-brand-accent text-[9px] sm:text-[10px] font-black uppercase hover:bg-brand-accent hover:text-brand-navy transition-colors cursor-pointer hidden md:flex items-center gap-1"
              title="Toggle audio quality tier"
            >
              <span>{quality === "high" ? "🔊 HI-FI 320K" : "📱 DATA SAVER"}</span>
            </button>
          )}

          {/* Mute */}
          <button
            onClick={toggleMute}
            aria-label={isMuted ? "Unmute Radio" : "Mute Radio"}
            className="p-1.5 border border-brand-accent hover:bg-brand-accent hover:text-brand-navy transition-colors cursor-pointer"
          >
            {isMuted ? <VolumeX className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> : <Volume2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
          </button>

          {/* Expand to full boombox view */}
          <Link
            href="/radio"
            aria-label="Open Full Boombox"
            className="p-1.5 border border-brand-accent bg-brand-accent text-brand-navy hover:bg-brand-off-white transition-colors hidden sm:block cursor-pointer"
            title="Open Full Stage Player"
          >
            <Maximize2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </Link>

          {/* Minimize to pill */}
          <button
            onClick={toggleMinimized}
            aria-label="Minimize Player"
            className="p-1.5 hover:text-brand-accent transition-colors cursor-pointer"
            title="Minimize to Floating Button"
          >
            <ChevronDown className="w-4 h-4" />
          </button>
        </div>

      </div>
    </aside>
  );
}
