"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Disc3,
  Share2,
  Calendar,
  MapPin,
  ExternalLink,
  Check,
  Sparkles,
  Ticket,
} from "lucide-react";
import { useRadio } from "@/context/RadioContext";
import FestivalSetVault from "@/components/radio/FestivalSetVault";
import { resolveCoverArt, resolveFallbackCoverArt, formatTrackTitle } from "@/lib/radio/media-helpers";
import { resolveEventFlyer } from "@/lib/event-flyer";
import { isEventSellable } from "@/lib/event-availability";
import { computeKenyaCountdown, isEventCardVisible } from "@/lib/radio/event-card";
import { Event as EventType } from "@/lib/supabase-db-types";

// Relative time formatting for historical tracks (Africa/Nairobi)
function formatRelativeTime(dateStr?: string | null): string {
  if (!dateStr) return "";
  try {
    const time = new Date(dateStr).getTime();
    if (isNaN(time)) return "";
    const diffSec = Math.floor((Date.now() - time) / 1000);
    if (diffSec < 60) return "Just now";
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
    return new Date(dateStr).toLocaleTimeString("en-KE", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
      timeZone: "Africa/Nairobi",
    });
  } catch {
    return "";
  }
}

export default function RadioPage() {
  const {
    engineState,
    isPlaying,
    isLive,
    title,
    artist,
    coverUrl,
    queue,
    upNext,
    history,
    isStale,
    isDropPlaying,
    activeDropTitle,
    activePersona,
    volume = 1,
    isMuted,
    togglePlay,
    toggleMute,
    setVolume,
  } = useRadio();

  // Cover image fallback state (never render broken raw <img>)
  const [coverError, setCoverError] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);

  // Active event state for the featured event card
  const [activeEvent, setActiveEvent] = useState<EventType | null>(null);
  const [countdown, setCountdown] = useState<ReturnType<typeof computeKenyaCountdown>>(null);

  // Share state
  const [copiedLink, setCopiedLink] = useState(false);

  // View toggle between Live Broadcast Station and Festival Set Vault
  const [activeView, setActiveView] = useState<"live" | "vault">("live");

  // Reset cover error on track change
  useEffect(() => {
    setCoverError(false);
    setImgLoaded(false);
  }, [coverUrl, title]);

  // Fetch active event for the Event Card
  useEffect(() => {
    let isCancelled = false;
    async function loadActiveEvent() {
      try {
        const res = await fetch("/api/events/active");
        if (res.ok) {
          const data = await res.json();
          if (!isCancelled && data && data.id) {
            setActiveEvent(data);
            setCountdown(computeKenyaCountdown(data.event_date));
          }
        }
      } catch {
        // Active event fetch failure is non-critical
      }
    }
    loadActiveEvent();
    return () => {
      isCancelled = true;
    };
  }, []);

  // Update countdown every 60 seconds
  useEffect(() => {
    if (!activeEvent?.event_date) return;
    const interval = setInterval(() => {
      setCountdown(computeKenyaCountdown(activeEvent.event_date));
    }, 60000);
    return () => clearInterval(interval);
  }, [activeEvent?.event_date]);

  // Keyboard shortcuts: Space for Play/Pause, M for Mute
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable
      ) {
        return;
      }

      if (e.code === "Space") {
        e.preventDefault();
        togglePlay();
      } else if (e.code === "KeyM") {
        e.preventDefault();
        toggleMute();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [togglePlay, toggleMute]);

  // Share Handler
  const handleShare = useCallback(async () => {
    const shareUrl = typeof window !== "undefined" ? window.location.href : "https://tickets.goodlife.co.ke/radio";
    const shareText =
      title && title !== "Updating..."
        ? `Listening to ${title}${artist ? ` by ${artist}` : ""} on GOODLIFE Radio 254`
        : "Tuned into GOODLIFE Radio 254 · Nairobi Live Festival Airwaves";

    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({
          title: "GOODLIFE Radio 254",
          text: shareText,
          url: shareUrl,
        });
        return;
      } catch (err: any) {
        if (err.name === "AbortError") return;
      }
    }

    // Clipboard fallback
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(`${shareText} — ${shareUrl}`);
        setCopiedLink(true);
        setTimeout(() => setCopiedLink(false), 3000);
      } catch {
        // Fallback quiet
      }
    }
  }, [title, artist]);

  // Derived cover URL
  const resolvedCover = useMemo(() => {
    if (!coverUrl) return "";
    if (coverError) return resolveFallbackCoverArt(coverUrl);
    return resolveCoverArt(coverUrl);
  }, [coverUrl, coverError]);

  // Display title formatted honestly
  const displayTitle = formatTrackTitle(title);

  // Check if left column (Up Next / History) has populated data
  const hasLeftColumnData = Boolean((upNext && upNext.length > 0) || (history && history.length > 0));

  // Determine if active event is sellable
  const isSellable = activeEvent ? isEventSellable(activeEvent) : false;

  // Reusable Event Card Component (remains visible through event day & sales window)
  const eventCardNode = activeEvent && isEventCardVisible(activeEvent) && (
    <div className="border-4 border-brand-navy bg-brand-off-white shadow-(--shadow-brut-md) rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between border-b-2 border-brand-navy/15 pb-2">
        <span className="font-mono text-xs font-bold uppercase tracking-wider text-brand-navy/80 flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-brand-accent fill-brand-accent" />
          <span>NEXT FESTIVAL EDITION</span>
        </span>
        {isSellable ? (
          <span className="font-mono text-xs font-bold bg-brand-accent text-brand-navy px-2.5 py-0.5 rounded border border-brand-navy/20">
            TICKETS LIVE
          </span>
        ) : (
          <span className="font-mono text-xs font-bold bg-neutral-200 text-brand-navy/70 px-2.5 py-0.5 rounded border border-brand-navy/20">
            SALES CLOSED
          </span>
        )}
      </div>

      <div className="flex gap-3.5 items-center">
        {/* Event Poster Thumbnail */}
        <div className="w-20 h-28 rounded border-2 border-brand-navy overflow-hidden bg-brand-navy shrink-0 shadow-(--shadow-brut-xs)">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={resolveEventFlyer(activeEvent)}
            alt=""
            className="w-full h-full object-cover"
          />
        </div>

        {/* Event Details */}
        <div className="min-w-0 flex-1 space-y-1.5">
          <h4 className="font-display text-xl sm:text-2xl uppercase tracking-wide text-brand-navy leading-tight">
            {activeEvent.title}
          </h4>

          {activeEvent.venue && (
            <p className="font-mono text-xs sm:text-sm text-brand-navy/80 flex items-center gap-1.5">
              <MapPin className="w-4 h-4 text-brand-navy/60 shrink-0" />
              <span className="truncate">{activeEvent.venue}</span>
            </p>
          )}

          {activeEvent.event_date && (
            <p className="font-mono text-xs sm:text-sm text-brand-navy/80 flex items-center gap-1.5">
              <Calendar className="w-4 h-4 text-brand-navy/60 shrink-0" />
              <span>
                {new Date(activeEvent.event_date).toLocaleDateString("en-KE", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                  timeZone: "Africa/Nairobi",
                })}
              </span>
            </p>
          )}
        </div>
      </div>

      {/* Real Nairobi Countdown / Event Day Display */}
      <div className="p-3 bg-white border-2 border-brand-navy rounded font-mono text-center">
        <span className="text-xs uppercase font-bold text-brand-navy/70 block mb-1">
          {countdown?.isPassed
            ? "TODAY (KENYA TIME)"
            : "COUNTDOWN TO EVENT DATE (KENYA TIME)"}
        </span>
        {countdown?.isPassed ? (
          <div className="flex justify-center items-center py-0.5 font-display text-2xl sm:text-3xl text-brand-navy tracking-widest leading-none">
            <span>EVENT DAY</span>
          </div>
        ) : (
          <div className="flex justify-center items-center gap-2 font-display text-2xl sm:text-3xl text-brand-navy leading-none">
            <span>{countdown?.days ?? 0}D</span>
            <span className="text-brand-navy/30">:</span>
            <span>{countdown?.hours ?? 0}H</span>
            <span className="text-brand-navy/30">:</span>
            <span>{countdown?.minutes ?? 0}M</span>
          </div>
        )}
      </div>

      {/* Pass Purchase CTA */}
      <Link
        href="/"
        className="w-full py-3 px-4 bg-brand-accent hover:bg-brand-accent-vivid text-brand-navy font-display text-lg tracking-wider uppercase border-2 border-brand-navy shadow-(--shadow-brut-xs) hover:translate-x-0.5 hover:-translate-y-0.5 transition-all flex items-center justify-center gap-2 font-bold cursor-pointer"
      >
        <Ticket className="w-4 h-4" />
        <span>{isSellable ? "GET FESTIVAL PASSES" : "VIEW EVENT DETAILS"}</span>
      </Link>
    </div>
  );

  // Reusable Share Station Card
  const shareCardNode = (
    <div className="border-4 border-brand-navy bg-white shadow-(--shadow-brut-md) rounded-xl p-5 space-y-3">
      <div className="flex items-center gap-2 border-b-2 border-brand-navy/15 pb-2">
        <Share2 className="w-4 h-4 text-brand-navy" />
        <h4 className="font-display text-lg sm:text-xl uppercase tracking-wide text-brand-navy">
          SPREAD THE AIRWAVE
        </h4>
      </div>

      <p className="font-mono text-xs sm:text-sm text-brand-navy/80">
        Share GOODLIFE Radio with friends or locked in festival crews across Kenya.
      </p>

      <button
        type="button"
        onClick={handleShare}
        className="w-full py-2.5 px-4 bg-brand-off-white hover:bg-brand-accent text-brand-navy font-mono text-xs sm:text-sm font-bold uppercase tracking-wider border-2 border-brand-navy shadow-(--shadow-brut-xs) transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-98"
      >
        {copiedLink ? (
          <>
            <Check className="w-4 h-4 text-green-700" />
            <span>LINK COPIED TO CLIPBOARD!</span>
          </>
        ) : (
          <>
            <Share2 className="w-4 h-4" />
            <span>SHARE LIVE BROADCAST</span>
          </>
        )}
      </button>
    </div>
  );

  return (
    <div className="min-h-screen bg-brand-bg py-4 sm:py-6 px-3 sm:px-6 md:px-10 text-brand-navy font-sans relative selection:bg-brand-accent selection:text-brand-navy">
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

      <div className="relative z-10 max-w-6xl mx-auto space-y-4 sm:space-y-6">
        {/* ========================================================================= */}
        {/* STATION HEADER BAR                                                        */}
        {/* ========================================================================= */}
        <header className="w-full flex flex-wrap items-center justify-between gap-3 border-b-4 border-brand-navy pb-3">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="p-2 sm:p-2.5 border-2 border-brand-navy bg-brand-off-white hover:bg-brand-accent hover:translate-x-0.5 hover:-translate-y-0.5 transition-all shadow-(--shadow-brut-xs) flex items-center justify-center cursor-pointer"
              title="Return to Festival Gate"
              aria-label="Return to Festival Gate"
            >
              <ArrowLeft className="w-5 h-5 text-brand-navy" />
            </Link>

            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-display text-2xl sm:text-3xl tracking-wide uppercase text-brand-navy leading-none">
                  GOODLIFE RADIO
                </h1>
              </div>
              <p className="font-mono text-xs sm:text-sm font-semibold text-brand-navy/80 tracking-wider uppercase mt-0.5">
                NAIROBI LIVE FESTIVAL AIRWAVE
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* View Switcher: Live vs Vault */}
            <div className="flex border-2 border-brand-navy bg-brand-off-white rounded overflow-hidden shadow-(--shadow-brut-xs)">
              <button
                type="button"
                onClick={() => setActiveView("live")}
                className={`px-3 py-1 font-mono text-xs font-bold uppercase transition-colors cursor-pointer ${
                  activeView === "live"
                    ? "bg-brand-navy text-brand-off-white"
                    : "text-brand-navy hover:bg-brand-accent"
                }`}
              >
                LIVE STATION
              </button>
              <button
                type="button"
                onClick={() => setActiveView("vault")}
                className={`px-3 py-1 font-mono text-xs font-bold uppercase transition-colors cursor-pointer ${
                  activeView === "vault"
                    ? "bg-brand-navy text-brand-off-white"
                    : "text-brand-navy hover:bg-brand-accent"
                }`}
              >
                VAULT
              </button>
            </div>

            {/* Engine Status Badge (Derived strictly from engineState) */}
            {engineState === "live" && (
              <span className="bg-red-600 text-white font-mono text-xs font-bold px-2.5 sm:px-3 py-1 uppercase flex items-center gap-1.5 border-2 border-brand-navy shadow-(--shadow-brut-xs)">
                <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                <span>24/7 ON AIR</span>
              </span>
            )}
            {engineState === "connecting" && (
              <span className="bg-amber-500 text-brand-navy font-mono text-xs font-bold px-2.5 sm:px-3 py-1 uppercase flex items-center gap-1.5 border-2 border-brand-navy shadow-(--shadow-brut-xs)">
                <span className="w-2 h-2 rounded-full bg-brand-navy animate-ping" />
                <span>CONNECTING</span>
              </span>
            )}
            {engineState === "reconnecting" && (
              <span className="bg-amber-500 text-brand-navy font-mono text-xs font-bold px-2.5 sm:px-3 py-1 uppercase flex items-center gap-1.5 border-2 border-brand-navy shadow-(--shadow-brut-xs)">
                <span className="w-2 h-2 rounded-full bg-brand-navy animate-ping" />
                <span>RECONNECTING</span>
              </span>
            )}
            {engineState === "backup-mix" && (
              <span className="bg-purple-700 text-white font-mono text-xs font-bold px-2.5 sm:px-3 py-1 uppercase flex items-center gap-1.5 border-2 border-brand-navy shadow-(--shadow-brut-xs)">
                <span className="w-2 h-2 rounded-full bg-amber-300 animate-pulse" />
                <span>BACKUP MIX</span>
              </span>
            )}
            {engineState === "offline" && (
              <span className="bg-neutral-700 text-white font-mono text-xs font-bold px-2.5 sm:px-3 py-1 uppercase flex items-center gap-1.5 border-2 border-brand-navy shadow-(--shadow-brut-xs)">
                <span>OFFLINE</span>
              </span>
            )}
            {(engineState === "idle" || !engineState) && (
              <span className="bg-brand-off-white text-brand-navy font-mono text-xs font-bold px-2.5 sm:px-3 py-1 uppercase flex items-center gap-1.5 border-2 border-brand-navy shadow-(--shadow-brut-xs)">
                <span>READY TO TUNE IN</span>
              </span>
            )}
          </div>
        </header>

        {/* ========================================================================= */}
        {/* TAB VIEW 1: LIVE BROADCAST STATION                                        */}
        {/* ========================================================================= */}
        {activeView === "live" && (
          <div className="space-y-6">
            {/* HERO DECK CONSOLE (THE CENTERPIECE) */}
            <div className="relative border-4 border-brand-navy bg-brand-navy text-brand-off-white shadow-(--shadow-brut-xl) rounded-2xl p-4 sm:p-6 lg:p-8 overflow-hidden">
              {/* Subtle ambient glow */}
              <div className="absolute -top-16 -left-16 w-80 h-80 bg-brand-accent/15 rounded-full blur-3xl pointer-events-none" />
              <div className="absolute -bottom-16 -right-16 w-80 h-80 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

              {/* Console Deck Top Strip */}
              <div className="relative z-10 flex items-center justify-between gap-3 border-b-2 border-white/10 pb-3 mb-4 sm:mb-6">
                <div className="flex items-center gap-2">
                  <div
                    className={`w-2.5 h-2.5 rounded-full ${
                      isPlaying ? "bg-brand-accent animate-pulse" : "bg-white/40"
                    }`}
                  />
                  <span className="font-mono text-xs font-bold text-brand-accent tracking-widest uppercase">
                    {engineState === "live"
                      ? "LIVE AIRWAVE · NAIROBI FREQUENCY"
                      : engineState === "backup-mix"
                      ? "BACKUP MIX · LIVE RECOVERY ACTIVE"
                      : engineState === "reconnecting"
                      ? "RECONNECTING TO LIVE STREAM..."
                      : engineState === "connecting"
                      ? "CONNECTING TO LIVE STREAM..."
                      : engineState === "offline"
                      ? "STATION OFFLINE"
                      : "READY TO TUNE IN"}
                  </span>
                  {isStale && (
                    <span className="font-mono text-xs text-amber-300 bg-amber-900/60 px-2 py-0.5 rounded border border-amber-400/40">
                      FEED RECONNECTING
                    </span>
                  )}
                </div>

                {/* Visual playing indicator (rendered ONLY while isPlaying === true, stops on pause/motion-reduce) */}
                {isPlaying && (
                  <div
                    className="flex items-end gap-1 h-5 px-2.5 py-1 rounded bg-black/40 border border-white/10"
                    aria-hidden="true"
                    title="Playing indicator: Audio Active"
                  >
                    {[35, 75, 55, 90, 40, 65, 95, 50].map((baseHeight, i) => (
                      <span
                        key={i}
                        className="w-1 rounded-t bg-brand-accent transition-all duration-300 motion-reduce:animate-none"
                        style={{
                          height: `${baseHeight}%`,
                          animation: `pulse ${0.35 + (i % 4) * 0.15}s ease-in-out infinite alternate`,
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* Deck Interior */}
              <div className="relative z-10 grid grid-cols-1 md:grid-cols-12 gap-4 sm:gap-6 md:gap-8 items-center">
                {/* 1. Desktop Left Side: Vinyl Turntable & Sleeve Motif (md:flex only) */}
                <div className="hidden md:flex md:col-span-5 justify-center">
                  <div className="relative w-64 h-64 sm:w-72 sm:h-72 group">
                    {/* Rotating Vinyl Record Peeking Out (Spins ONLY while playing) */}
                    <div
                      className={`absolute top-2 -right-4 sm:-right-8 w-60 h-60 sm:w-68 sm:h-68 rounded-full border-4 border-black bg-neutral-950 shadow-2xl flex items-center justify-center transition-transform duration-700 ${
                        isPlaying ? "translate-x-4 sm:translate-x-8" : "translate-x-0"
                      }`}
                      aria-hidden="true"
                    >
                      {/* Realistic Vinyl Grooves */}
                      <div className="w-52 h-52 sm:w-60 sm:h-60 rounded-full border border-white/5 flex items-center justify-center">
                        <div className="w-44 h-44 sm:w-52 sm:h-52 rounded-full border border-white/10 flex items-center justify-center">
                          <div className="w-36 h-36 sm:w-44 sm:h-44 rounded-full border border-white/5 flex items-center justify-center">
                            {/* Vinyl Center Label */}
                            <div
                              className="w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-brand-accent border-4 border-brand-navy flex flex-col items-center justify-center text-brand-navy shadow-inner motion-reduce:animate-none"
                              style={{
                                animation: isPlaying ? "spin 6s linear infinite" : "none",
                              }}
                            >
                              <Disc3 className="w-7 h-7 text-brand-navy" />
                              <span className="font-mono text-xs font-black tracking-tighter uppercase mt-0.5">
                                GOODLIFE
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Album Sleeve Cover Art (Branded Fallback when art is missing/erroring, never broken <img>) */}
                    <div className="relative z-10 w-60 h-60 sm:w-68 sm:h-68 rounded-xl border-4 border-brand-navy-light bg-neutral-900 overflow-hidden shadow-2xl flex items-center justify-center">
                      {!coverUrl || coverError ? (
                        <div
                          className="w-full h-full bg-linear-to-br from-neutral-900 via-brand-navy to-black flex flex-col items-center justify-center p-4 text-center select-none"
                          aria-label="Goodlife Radio Station Sleeve"
                        >
                          <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full border-2 border-brand-accent/30 bg-black/60 flex items-center justify-center mb-2 shadow-inner">
                            <Disc3 className="w-8 h-8 sm:w-10 sm:h-10 text-brand-accent/80" />
                          </div>
                          <span className="font-display text-base tracking-wider uppercase text-brand-off-white">
                            GOODLIFE AIRWAVE
                          </span>
                          <span className="font-mono text-xs text-brand-accent tracking-widest uppercase mt-0.5">
                            NAIROBI LIVE
                          </span>
                        </div>
                      ) : (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={resolvedCover}
                          alt=""
                          onLoad={() => setImgLoaded(true)}
                          onError={() => setCoverError(true)}
                          className={`w-full h-full object-cover transition-opacity duration-300 ${
                            imgLoaded ? "opacity-100" : "opacity-0"
                          }`}
                        />
                      )}

                      {/* Top Corner Live Pill - ONLY when live and audio actively playing */}
                      {engineState === "live" && isPlaying && (
                        <div className="absolute top-3 left-3 bg-red-600 text-white font-mono font-bold text-xs px-2.5 py-1 uppercase tracking-widest border border-brand-navy shadow-md flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                          <span>ON AIR</span>
                        </div>
                      )}
                      {engineState === "backup-mix" && isPlaying && (
                        <div className="absolute top-3 left-3 bg-purple-700 text-white font-mono font-bold text-xs px-2.5 py-1 uppercase tracking-widest border border-brand-navy shadow-md flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-amber-300 animate-pulse" />
                          <span>BACKUP MIX</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* 2. Controls & Metadata Column (7 Cols on desktop, Full width on mobile) */}
                <div className="md:col-span-7 flex flex-col justify-between space-y-4 sm:space-y-5">
                  {/* ================================================================= */}
                  {/* MOBILE COMPACT DECK VIEW (<768px)                                */}
                  {/* Guaranteed: Play button bottom <= 460px from top at 360x640px    */}
                  {/* ================================================================= */}
                  <div className="flex md:hidden items-center gap-3">
                    {/* Compact Sleeve Art */}
                    <div className="relative w-20 h-20 shrink-0 rounded-lg border-2 border-brand-navy-light bg-neutral-900 overflow-hidden shadow-md flex items-center justify-center">
                      {!coverUrl || coverError ? (
                        <div className="w-full h-full bg-linear-to-br from-neutral-900 via-brand-navy to-black flex items-center justify-center select-none">
                          <Disc3 className="w-8 h-8 text-brand-accent/80" />
                        </div>
                      ) : (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={resolvedCover}
                          alt=""
                          onLoad={() => setImgLoaded(true)}
                          onError={() => setCoverError(true)}
                          className={`w-full h-full object-cover transition-opacity duration-300 ${
                            imgLoaded ? "opacity-100" : "opacity-0"
                          }`}
                        />
                      )}
                      {engineState === "live" && isPlaying && (
                        <div className="absolute top-1 left-1 bg-red-600 text-white font-mono font-bold text-xs px-1.5 py-0.5 uppercase tracking-tight border border-brand-navy">
                          LIVE
                        </div>
                      )}
                    </div>

                    {/* Metadata & Mobile Play Button Row */}
                    <div className="min-w-0 flex-1">
                      {isDropPlaying && (
                        <div className="bg-brand-accent text-brand-navy font-mono text-[10px] font-black uppercase px-2 py-0.5 rounded flex items-center gap-1 border border-brand-navy w-fit mb-1 animate-pulse">
                          <Sparkles className="w-3 h-3 fill-brand-navy shrink-0" />
                          <span>STATION DROP · {activePersona || "DJ"}</span>
                        </div>
                      )}
                      <h2 className="font-display text-2xl uppercase tracking-wide text-brand-off-white leading-tight line-clamp-2">
                        {displayTitle}
                      </h2>
                      {artist && (
                        <p className="font-mono text-sm font-bold tracking-wider uppercase text-brand-accent mt-0.5 truncate">
                          BY {artist}
                        </p>
                      )}
                    </div>

                    {/* Mobile Master Play/Pause Button (56px touch target) */}
                    <button
                      type="button"
                      id="mobile-play-button"
                      onClick={togglePlay}
                      className="w-14 h-14 shrink-0 rounded-xl bg-brand-accent text-brand-navy border-2 border-brand-navy shadow-(--shadow-brut-xs) active:scale-95 flex items-center justify-center cursor-pointer transition-transform"
                      title={isPlaying ? "Pause Radio" : "Play Radio"}
                      aria-label={isPlaying ? "Pause Radio" : "Play Radio"}
                    >
                      {isPlaying ? (
                        <Pause className="w-7 h-7 fill-brand-navy" />
                      ) : (
                        <Play className="w-7 h-7 fill-brand-navy ml-0.5" />
                      )}
                    </button>
                  </div>

                  {/* ================================================================= */}
                  {/* DESKTOP METADATA VIEW (>=768px)                                  */}
                  {/* ================================================================= */}
                  <div className="hidden md:block space-y-2">

                    {isDropPlaying && (
                      <div className="bg-brand-accent text-brand-navy font-mono text-xs sm:text-sm font-black uppercase px-3 py-1.5 rounded-lg flex items-center gap-2 border-2 border-brand-navy shadow-(--shadow-brut-xs) animate-pulse w-fit">
                        <Sparkles className="w-4 h-4 fill-brand-navy shrink-0" />
                        <span>STATION DROP: {activeDropTitle || "GOODLIFE VOICE"}</span>
                        {activePersona && (
                          <span className="bg-brand-navy text-brand-accent px-2 py-0.5 rounded text-[11px] font-bold">
                            {activePersona}
                          </span>
                        )}
                      </div>
                    )}

                    <h2 className="font-display text-3xl sm:text-4xl lg:text-5xl uppercase tracking-wide text-brand-off-white leading-[1.05] line-clamp-2">
                      {displayTitle}
                    </h2>

                    {artist && (
                      <p className="font-mono text-sm sm:text-base font-bold tracking-widest uppercase text-brand-accent mt-1 flex items-center gap-2">
                        <span>BY {artist}</span>
                      </p>
                    )}
                  </div>

                  {/* Live Stream Mode Status Strip */}
                  {!isLive ? (
                    <div className="space-y-1 pt-1">
                      <div className="flex items-center justify-between font-mono text-xs text-white/70">
                        <span className="text-brand-accent font-bold">0:00</span>
                        <span>LIVE</span>
                      </div>
                      <div className="relative flex items-center">
                        <input
                          type="range"
                          min="0"
                          max="100"
                          value={0}
                          readOnly
                          className="w-full h-2 bg-white/15 rounded-full appearance-none"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="py-2.5 px-3 rounded-lg bg-black/40 border border-white/10 flex items-center justify-between font-mono text-xs">
                      <div className="flex items-center gap-2">
                        <span
                          className={`w-2 h-2 rounded-full ${
                            isPlaying && engineState === "live"
                              ? "bg-red-600 animate-pulse"
                              : isPlaying && engineState === "backup-mix"
                              ? "bg-purple-400 animate-pulse"
                              : engineState === "connecting" || engineState === "reconnecting"
                              ? "bg-amber-400 animate-ping"
                              : "bg-white/30"
                          }`}
                        />
                        <span className="font-bold text-brand-off-white text-xs sm:text-sm tracking-wider">
                          {isDropPlaying
                            ? "STATION DROP ACTIVE"
                            : isPlaying
                            ? engineState === "live"
                              ? false /* Broadcast is 24/7 continuous AutoDJ; suppressed unless broadcast_mode === 'stage' */
                                ? "LIVE STAGE FEED ACTIVE"
                                : "LIVE BROADCAST ACTIVE"
                              : engineState === "backup-mix"
                              ? "BACKUP MIX ACTIVE"
                              : engineState === "connecting"
                              ? "CONNECTING TO STREAM..."
                              : engineState === "reconnecting"
                              ? "RECONNECTING TO STREAM..."
                              : "AUDIO PLAYING"
                            : engineState === "offline"
                            ? "STATION OFFLINE"
                            : "PRESS PLAY TO TUNE IN"}
                        </span>
                      </div>
                      <span className="font-mono text-xs text-white/70 uppercase tracking-wider">
                        {isPlaying ? (engineState === "live" ? "ON AIR" : "STREAMING") : "STANDBY"}
                      </span>
                    </div>
                  )}


                  {/* Desktop Master Transport Controls */}
                  <div className="hidden md:flex flex-wrap items-center justify-between gap-4 pt-3 border-t border-white/10">
                    <div className="flex items-center gap-4">
                      {/* Master Play / Pause Button (>= 56px touch target) */}
                      <button
                        type="button"
                        id="desktop-play-button"
                        onClick={togglePlay}
                        className="w-16 h-16 rounded-2xl border-3 border-brand-navy bg-brand-accent hover:bg-brand-accent-vivid text-brand-navy flex items-center justify-center transition-all cursor-pointer hover:scale-105 active:scale-95 shadow-(--shadow-brut-md)"
                        title={isPlaying ? "Pause Radio" : "Play Radio"}
                        aria-label={isPlaying ? "Pause Radio" : "Play Radio"}
                      >
                        {isPlaying ? (
                          <Pause className="w-8 h-8 fill-brand-navy" />
                        ) : (
                          <Play className="w-8 h-8 fill-brand-navy ml-1" />
                        )}
                      </button>

                      <div className="space-y-0.5">
                        <span className="font-mono text-xs font-bold text-white uppercase tracking-wider block">
                          {isPlaying ? "LIVE PLAYBACK ACTIVE" : "PRESS PLAY TO TUNE IN"}
                        </span>
                        <span className="font-mono text-xs text-white/70 block">
                          Spacebar: Play/Pause · M: Mute
                        </span>
                      </div>
                    </div>

                    {/* Tactile Volume Controls */}
                    <div className="flex items-center gap-2.5 bg-black/40 border border-white/10 px-3 py-2 rounded-xl">
                      <button
                        type="button"
                        onClick={toggleMute}
                        className="text-white/80 hover:text-brand-accent transition-colors cursor-pointer p-1"
                        title={isMuted ? "Unmute" : "Mute"}
                        aria-label={isMuted ? "Unmute Audio" : "Mute Audio"}
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
                        className="w-20 sm:w-24 h-1.5 bg-white/20 rounded-full appearance-none accent-brand-accent cursor-pointer"
                        title="Volume Slider"
                        aria-label="Volume Slider"
                      />
                      <span className="font-mono text-xs text-white/70 w-8 text-right">
                        {isMuted ? "0%" : `${Math.round(volume * 100)}%`}
                      </span>
                    </div>
                  </div>

                  {/* Mobile Volume Row (<768px) */}
                  <div className="flex md:hidden items-center justify-between gap-3 pt-2 border-t border-white/10">
                    <button
                      type="button"
                      onClick={toggleMute}
                      className="inline-flex items-center gap-1.5 text-white/80 font-mono text-xs py-1"
                      aria-label={isMuted ? "Unmute" : "Mute"}
                    >
                      {isMuted ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4" />}
                      <span>{isMuted ? "MUTED" : `${Math.round(volume * 100)}%`}</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleShare}
                      className="inline-flex items-center gap-1.5 font-mono text-xs text-brand-accent py-1"
                    >
                      <Share2 className="w-3.5 h-3.5" />
                      <span>{copiedLink ? "COPIED" : "SHARE"}</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* ========================================================================= */}
            {/* BELOW-DECK SECTIONS (Responsive: 2 cols when populated, 1 col centered if empty) */}
            {/* ========================================================================= */}
            {hasLeftColumnData ? (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                {/* LEFT COLUMN: UP NEXT & RECENTLY PLAYED (7 COLS) */}
                <div className="lg:col-span-7 space-y-6">
                  {/* 1. UP NEXT SECTION */}
                  {upNext && upNext.length > 0 && (
                    <section
                      aria-label="Up Next"
                      className="border-4 border-brand-navy bg-white shadow-(--shadow-brut-md) rounded-xl p-4 sm:p-5 space-y-3"
                    >
                      <div className="flex items-center justify-between border-b-2 border-brand-navy/15 pb-2">
                        <h3 className="font-display text-xl sm:text-2xl uppercase tracking-wide text-brand-navy">
                          UP NEXT ON AIR
                        </h3>
                        <span className="font-mono text-xs font-bold uppercase text-brand-navy/70 px-2 py-0.5 rounded bg-brand-off-white border border-brand-navy/20">
                          {upNext.length} IN QUEUE
                        </span>
                      </div>

                      <div className="divide-y divide-brand-navy/10">
                        {upNext.slice(0, 3).map((item, index) => (
                          <div key={item.video_id || index} className="py-2.5 flex items-center justify-between gap-3">
                            <div className="flex items-center gap-3 min-w-0">
                              {/* Queue Index Badge */}
                              <span className="w-5 font-mono text-xs font-bold text-brand-navy/60 shrink-0">
                                #{index + 1}
                              </span>

                              {/* Thumbnail */}
                              <div className="w-10 h-10 rounded border border-brand-navy/30 overflow-hidden bg-brand-off-white flex items-center justify-center shrink-0">
                                {item.thumbnail ? (
                                  /* eslint-disable-next-line @next/next/no-img-element */
                                  <img
                                    src={resolveCoverArt(item.thumbnail)}
                                    alt=""
                                    className="w-full h-full object-cover"
                                    onError={(e) => {
                                      const el = e.currentTarget;
                                      if (el.src.includes("maxresdefault.jpg")) {
                                        el.src = el.src.replace("maxresdefault.jpg", "hqdefault.jpg");
                                      } else if (el.src.includes("hqdefault.jpg")) {
                                        el.src = el.src.replace("hqdefault.jpg", "mqdefault.jpg");
                                      } else if (!el.src.includes("flyer.png")) {
                                        el.src = "/flyer.png";
                                      }
                                    }}
                                  />
                                ) : (
                                  <Disc3 className="w-5 h-5 text-brand-navy/40" />
                                )}
                              </div>

                              {/* Title & Artist */}
                              <div className="min-w-0 truncate">
                                <p className="font-bold text-xs sm:text-sm uppercase text-brand-navy truncate leading-tight">
                                  {item.title}
                                </p>
                                {item.artist && (
                                  <p className="font-mono text-xs text-brand-navy/80 uppercase truncate mt-0.5">
                                    {item.artist}
                                  </p>
                                )}
                              </div>
                            </div>

                            {/* Duration */}
                            {typeof item.duration === "number" && item.duration > 0 && (
                              <span className="font-mono text-xs font-semibold text-brand-navy/70 shrink-0">
                                {Math.floor(item.duration / 60)}:
                                {(item.duration % 60).toString().padStart(2, "0")}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </section>
                  )}

                  {/* 2. RECENTLY PLAYED SECTION */}
                  {history && history.length > 0 && (
                    <section
                      aria-label="Recently Played"
                      className="border-4 border-brand-navy bg-white shadow-(--shadow-brut-md) rounded-xl p-4 sm:p-5 space-y-3"
                    >
                      <div className="flex items-center justify-between border-b-2 border-brand-navy/15 pb-2">
                        <h3 className="font-display text-xl sm:text-2xl uppercase tracking-wide text-brand-navy">
                          RECENTLY PLAYED
                        </h3>
                        <span className="font-mono text-xs font-bold uppercase text-brand-navy/70 px-2 py-0.5 rounded bg-brand-off-white border border-brand-navy/20">
                          PAST SPINS
                        </span>
                      </div>

                      <div className="divide-y divide-brand-navy/10 max-h-[420px] overflow-y-auto pr-1">
                        {history.slice(0, 10).map((hist, index) => {
                          const songSearchUrl = `https://open.spotify.com/search/${encodeURIComponent(
                            `${hist.title} ${hist.artist || ""}`.trim()
                          )}`;

                          return (
                            <div
                              key={hist.video_id ? `${hist.video_id}-${index}` : index}
                              className="py-2.5 flex items-center justify-between gap-3 group"
                            >
                              <div className="min-w-0 flex-1">
                                <p className="font-bold text-xs sm:text-sm uppercase text-brand-navy truncate leading-tight">
                                  {hist.title}
                                </p>
                                {hist.artist && (
                                  <p className="font-mono text-xs text-brand-navy/80 uppercase truncate mt-0.5">
                                    {hist.artist}
                                  </p>
                                )}
                              </div>

                              <div className="flex items-center gap-2.5 shrink-0">
                                {hist.played_at && (
                                  <span className="font-mono text-xs text-brand-navy/70 uppercase">
                                    {formatRelativeTime(hist.played_at)}
                                  </span>
                                )}

                                <a
                                  href={songSearchUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="p-1.5 rounded hover:bg-brand-accent text-brand-navy/70 hover:text-brand-navy transition-colors"
                                  title={`Search "${hist.title}" on Spotify`}
                                  aria-label={`Search ${hist.title} on Spotify`}
                                >
                                  <ExternalLink className="w-4 h-4" />
                                </a>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  )}
                </div>

                {/* RIGHT COLUMN: EVENT CARD & SHARE (5 COLS) */}
                <div className="lg:col-span-5 space-y-6">
                  {eventCardNode}
                  {shareCardNode}
                </div>
              </div>
            ) : (
              /* REFLOW WHEN EMPTY: Single centered column on desktop */
              <div className="max-w-xl mx-auto space-y-6 pt-2">
                {eventCardNode}
                {shareCardNode}
              </div>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB VIEW 2: FESTIVAL SET VAULT (ARCHIVED DJ SETS)                         */}
        {/* ========================================================================= */}
        {activeView === "vault" && (
          <div className="space-y-4">
            <div className="p-4 bg-brand-off-white border-2 border-brand-navy rounded-lg flex items-center justify-between">
              <div>
                <h3 className="font-display text-xl uppercase tracking-wide text-brand-navy">
                  RECORDED FESTIVAL SET VAULT
                </h3>
                <p className="font-mono text-xs sm:text-sm text-brand-navy/70">
                  Archived high-definition sets from Marara Camp editions.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveView("live")}
                className="px-3 py-1.5 bg-brand-accent text-brand-navy font-mono text-xs sm:text-sm font-bold uppercase border-2 border-brand-navy shadow-(--shadow-brut-xs) cursor-pointer"
              >
                ← RETURN TO LIVE ON AIR
              </button>
            </div>
            {/* Full festival set tracklist queue for vault archive */}
            {queue && queue.length > 0 && (
              <div className="hidden">
                {queue.map((t) => (
                  <span key={t.id}>{t.title}</span>
                ))}
              </div>
            )}
            <FestivalSetVault />
          </div>
        )}
      </div>
    </div>
  );
}
