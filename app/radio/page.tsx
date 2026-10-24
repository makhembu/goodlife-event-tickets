"use client";

import React from "react";
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
} from "lucide-react";
import { useRadio } from "@/context/RadioContext";

export default function RadioPage() {
  const {
    currentSet,
    isPlaying,
    isLive,
    liveTitle,
    quality,
    progress,
    isMuted,
    queue,
    togglePlay,
    playSet,
    nextTrack,
    prevTrack,
    seek,
    toggleMute,
    switchQuality,
  } = useRadio();

  return (
    <div className="min-h-screen bg-brand-bg py-8 px-4 md:px-12 text-brand-navy font-sans relative">
      <div
        className="absolute inset-0 z-0 pointer-events-none opacity-20"
        style={{
          backgroundImage:
            "radial-gradient(rgba(20,43,76,0.18) 1px, transparent 1px), radial-gradient(rgba(199,154,86,0.12) 1px, transparent 1px)",
          backgroundSize: "24px 24px, 48px 48px",
          backgroundPosition: "0 0, 12px 12px",
        }}
      />

      <div className="relative z-10 max-w-4xl mx-auto space-y-8">
        {/* Header */}
        <header className="w-full flex items-center justify-between border-b-4 border-brand-navy pb-4">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="p-2 border-2 border-brand-navy bg-brand-off-white hover:bg-brand-accent transition-colors shadow-(--shadow-brut-sm)"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div className="flex items-center gap-2">
              <span className="font-display text-2xl tracking-wide uppercase">GOODLIFE RADIO</span>
              {isLive && (
                <span className="bg-red-600 text-white font-mono text-[10px] font-black px-2 py-0.5 animate-pulse uppercase">
                  LIVE STAGE
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!isLive && (
              <button
                onClick={() => switchQuality(quality === "high" ? "standard" : "high")}
                className="px-2.5 py-1 border-2 border-brand-navy bg-white hover:bg-brand-accent font-mono text-[10px] font-black uppercase shadow-(--shadow-brut-xs) transition-colors cursor-pointer"
              >
                {quality === "high" ? "🔊 HI-FI 320K" : "📱 DATA SAVER 192K"}
              </button>
            )}
            <Flame className="w-6 h-6 text-brand-accent hidden md:block" strokeWidth={2.5} />
          </div>
        </header>

        {!currentSet && !isLive ? (
          <div className="h-64 flex items-center justify-center font-mono uppercase tracking-widest text-brand-navy/60">
            No festival sets available currently.
          </div>
        ) : (
          <div className="space-y-10">
            {/* Boombox Main Player */}
            <div className="flex flex-col gap-8 md:flex-row items-center md:items-start md:mt-8">
              
              {/* Player Artwork */}
              <div className="w-full md:w-1/2 aspect-square border-4 border-brand-navy shadow-(--shadow-brut-2xl) bg-brand-navy p-4 relative overflow-hidden flex items-center justify-center">
                {currentSet?.cover_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={currentSet.cover_url}
                    alt="Cover"
                    className={`w-full h-full object-cover transition-transform duration-[10000ms] ${
                      isPlaying && !isLive ? "scale-110" : "scale-100"
                    }`}
                  />
                ) : (
                  <div
                    className={`w-3/4 h-3/4 rounded-full border-8 border-brand-navy/50 border-t-brand-accent transition-all duration-1000 ${
                      isPlaying && !isLive ? "animate-spin" : ""
                    }`}
                  />
                )}

                <div className="absolute top-4 left-4 bg-brand-accent text-brand-navy font-bold text-[10px] px-2 py-1 uppercase tracking-widest border-2 border-brand-navy shadow-(--shadow-brut-xs) flex items-center gap-1.5">
                  {isLive ? <RadioTower className="w-3 h-3 text-red-600 animate-pulse" /> : <Radio className="w-3 h-3" />}
                  <span>{isLive ? "STAGE ON AIR" : "FESTIVAL SET"}</span>
                </div>
              </div>

              {/* Controls */}
              <div className="w-full md:w-1/2 flex flex-col space-y-6">
                <div>
                  <h2 className="font-display text-3xl sm:text-4xl uppercase tracking-wider mb-1 leading-none">
                    {isLive ? liveTitle : currentSet?.title}
                  </h2>
                  <p className="font-mono text-sm font-bold tracking-widest uppercase text-brand-navy/70">
                    {isLive ? "🔴 DIRECT VENUE STREAM" : `BY ${currentSet?.dj_name}`}
                  </p>
                  {!isLive && currentSet && (
                    <div className="mt-3 flex gap-2">
                      <span className="px-2 py-1 border-2 border-brand-navy bg-brand-off-white text-[10px] font-bold uppercase tracking-widest">
                        {currentSet.genre}
                      </span>
                      <span className="px-2 py-1 border-2 border-brand-navy bg-brand-off-white text-[10px] font-bold uppercase tracking-widest font-mono">
                        {currentSet.duration || "FESTIVAL MIX"}
                      </span>
                    </div>
                  )}
                </div>

                {/* Scrubber (only in on-demand mode) */}
                {!isLive && (
                  <div className="w-full space-y-2 pt-2">
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={progress || 0}
                      onChange={(e) => seek(Number(e.target.value))}
                      className="w-full h-4 bg-brand-off-white border-2 border-brand-navy appearance-none cursor-pointer accent-brand-accent"
                    />
                  </div>
                )}

                {/* Primary Buttons */}
                <div className="flex items-center gap-3 pt-2">
                  {!isLive && (
                    <button
                      onClick={prevTrack}
                      className="w-12 h-12 border-4 border-brand-navy bg-brand-off-white flex items-center justify-center shadow-(--shadow-brut-sm) hover:bg-brand-accent transition-colors cursor-pointer"
                      title="Previous Track"
                    >
                      <SkipBack className="w-5 h-5 fill-brand-navy" />
                    </button>
                  )}

                  <button
                    onClick={togglePlay}
                    className="w-16 h-16 border-4 border-brand-navy bg-brand-accent flex items-center justify-center shadow-(--shadow-brut-md) hover:bg-brand-off-white hover:translate-x-1 hover:translate-y-1 transition-all cursor-pointer"
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
                      className="w-12 h-12 border-4 border-brand-navy bg-brand-off-white flex items-center justify-center shadow-(--shadow-brut-sm) hover:bg-brand-accent transition-colors cursor-pointer"
                      title="Next Track"
                    >
                      <SkipForward className="w-5 h-5 fill-brand-navy" />
                    </button>
                  )}

                  <div className="flex-1" />

                  <button
                    onClick={toggleMute}
                    className="p-3 border-2 border-brand-navy bg-brand-off-white shadow-(--shadow-brut-xs) hover:bg-brand-accent transition-colors cursor-pointer"
                    title={isMuted ? "Unmute" : "Mute"}
                  >
                    {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
                  </button>
                </div>
              </div>
            </div>

            {/* Playlist Queue */}
            {queue.length > 1 && !isLive && (
              <div className="p-6 border-4 border-brand-navy bg-white shadow-(--shadow-brut-md) space-y-4 font-mono">
                <div className="flex items-center gap-2 border-b-2 border-brand-navy pb-2">
                  <Music2 className="w-5 h-5 text-brand-navy" />
                  <h3 className="font-display text-lg font-black uppercase">FESTIVAL TRACKLIST ({queue.length})</h3>
                </div>

                <div className="divide-y-2 divide-brand-navy/10 max-h-72 overflow-y-auto pr-1">
                  {queue.map((track, i) => {
                    const isSelected = currentSet?.id === track.id;
                    return (
                      <div
                        key={track.id}
                        onClick={() => playSet(track)}
                        className={`flex items-center justify-between p-2.5 transition-colors cursor-pointer ${
                          isSelected ? "bg-brand-accent/30 font-bold" : "hover:bg-brand-off-white"
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="text-xs font-mono text-brand-navy/50 w-5">
                            {isSelected ? <Check className="w-4 h-4 text-brand-navy" /> : `${i + 1}.`}
                          </span>
                          <div className="truncate">
                            <p className="text-xs uppercase font-bold truncate">{track.title}</p>
                            <p className="text-[10px] text-brand-navy/60 uppercase">{track.dj_name}</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 shrink-0 ml-3 text-[10px] text-brand-navy/60">
                          <span className="hidden sm:inline px-1.5 py-0.5 border border-brand-navy/30 bg-white uppercase">
                            {track.genre}
                          </span>
                          <span>{track.duration || "Set"}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
