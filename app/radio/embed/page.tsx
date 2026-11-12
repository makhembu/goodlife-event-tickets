"use client";

import React, { useState, useEffect } from "react";
import { Play, Pause, Volume2, VolumeX, ExternalLink, Radio, Disc3 } from "lucide-react";
import { useRadio } from "@/context/RadioContext";

export default function RadioEmbedPage() {
  const {
    isPlaying,
    togglePlay,
    volume,
    isMuted,
    setVolume,
    toggleMute,
    title,
    artist,
    onAirSlot,
    quality,
    switchQuality,
  } = useRadio();

  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const displayShow = onAirSlot?.show_title || "GOODLIFE LIVE AIRWAVES";
  const displayHost = onAirSlot?.dj_name || "Resident Presenter";
  const displayTrack = title || "Live Afro House & Amapiano";
  const displayArtist = artist || displayHost;

  return (
    <div className="w-full h-full min-h-[160px] max-w-xl mx-auto bg-brand-navy text-white font-sans p-4 border-2 border-brand-accent flex flex-col justify-between select-none overflow-hidden rounded-xl shadow-lg">
      {/* Top Bar: Station Name, On Air Indicator, Quality */}
      <div className="flex items-center justify-between gap-2 border-b border-brand-accent/20 pb-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse shrink-0" />
          <div className="min-w-0">
            <span className="font-display tracking-wider text-base uppercase text-brand-accent leading-none block truncate">
              GOODLIFE RADIO 254
            </span>
            <span className="text-[10px] font-mono text-white/70 block truncate">
              254.0 MHZ · NAIROBI
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => switchQuality(quality === "standard" ? "high" : "standard")}
            className="px-2 py-0.5 text-[10px] font-mono font-bold uppercase rounded border border-brand-accent/50 bg-brand-accent/10 text-brand-accent hover:bg-brand-accent hover:text-brand-navy transition-colors cursor-pointer"
            title="Toggle Audio Quality"
          >
            {quality === "standard" ? "64K SAVER" : "192K HI-FI"}
          </button>

          <a
            href="https://tickets.goodlife.co.ke/radio"
            target="_blank"
            rel="noopener noreferrer"
            className="p-1 text-white/60 hover:text-white transition-colors"
            title="Open Station"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>

      {/* Middle: On-Air Track & Show */}
      <div className="py-2.5 flex items-center justify-between gap-3 min-w-0">
        <div className="space-y-0.5 min-w-0 flex-1">
          <div className="text-[10px] font-mono font-black uppercase tracking-wider text-brand-accent truncate">
            {displayShow} · {displayHost}
          </div>
          <div className="font-display text-lg uppercase tracking-wide text-white truncate leading-tight">
            {displayTrack}
          </div>
          <div className="text-xs font-mono text-white/75 truncate">
            {displayArtist}
          </div>
        </div>

        {/* Big Play / Pause Button */}
        <button
          type="button"
          onClick={togglePlay}
          className="w-12 h-12 rounded-full bg-brand-accent hover:bg-amber-400 text-brand-navy flex items-center justify-center shrink-0 shadow-md transition-transform active:scale-95 cursor-pointer"
          title={isPlaying ? "Pause" : "Play Live"}
        >
          {isPlaying ? (
            <Pause className="w-6 h-6 fill-current" />
          ) : (
            <Play className="w-6 h-6 fill-current ml-0.5" />
          )}
        </button>
      </div>

      {/* Bottom Controls: Volume & Listeners Live Link */}
      <div className="flex items-center justify-between gap-3 border-t border-brand-accent/20 pt-2 text-[11px] font-mono text-white/60">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleMute}
            className="hover:text-white transition-colors cursor-pointer"
            title={isMuted ? "Unmute" : "Mute"}
          >
            {isMuted || volume === 0 ? (
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
            className="w-20 h-1 bg-white/20 accent-brand-accent rounded cursor-pointer"
            aria-label="Volume Slider"
          />
        </div>

        <a
          href="https://tickets.goodlife.co.ke/radio"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-brand-accent transition-colors flex items-center gap-1 font-bold text-white/80"
        >
          <span>TICKETS.GOODLIFE.CO.KE</span>
        </a>
      </div>
    </div>
  );
}
