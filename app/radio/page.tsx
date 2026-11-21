"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
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
  Clock,
  Radio,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Ticket,
  ExternalLink,
  Check,
  WifiOff,
} from "lucide-react";
import { useRadio } from "@/context/RadioContext";
import FestivalSetVault from "@/components/radio/FestivalSetVault";
import CuratedPlaylists from "@/components/radio/CuratedPlaylists";
import { resolveCoverArt, resolveFallbackCoverArt, formatTrackTitle } from "@/lib/radio/media-helpers";
import UpcomingEventCard from "@/components/radio/UpcomingEventCard";
import CatchUpVault from "@/components/radio/CatchUpVault";
import ShoutoutWall from "@/components/radio/ShoutoutWall";
import LivePollWidget from "@/components/radio/LivePollWidget";
import LiveContestWidget from "@/components/radio/LiveContestWidget";
import ShareStationModal from "@/components/radio/ShareStationModal";
import PwaInstallButton from "@/components/ui/PwaInstallButton";
import { Event as EventType } from "@/lib/supabase-db-types";

// Format 24h clock strings e.g. "2026-11-20T20:00:00Z" -> "22:00 EAT"
function formatSlotTimeRange(startsAt?: string, endsAt?: string): string {
  if (!startsAt || !endsAt) return "";
  try {
    const s = new Date(startsAt).toLocaleTimeString("en-KE", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "Africa/Nairobi",
    });
    const e = new Date(endsAt).toLocaleTimeString("en-KE", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "Africa/Nairobi",
    });
    return `${s} — ${e} EAT`;
  } catch {
    return "";
  }
}

export default function RadioPage() {
  const {
    engineState,
    isPlaying,
    isLive,
    broadcastMode,
    activePlaylist,
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
    isDropUnlocked,
    unlockStationVoice,
    volume = 1,
    isMuted,
    togglePlay,
    toggleMute,
    setVolume,
    snapToBroadcast,
    onAirSlot,
  } = useRadio();

  // Cover image fallback state
  const [coverError, setCoverError] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);

  // Active event state for the featured event card
  const [activeEvent, setActiveEvent] = useState<EventType | null>(null);

  // Share state
  const [copiedLink, setCopiedLink] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);

  // View toggle between Live Station, Curated Playlists, and Vault
  const [activeView, setActiveView] = useState<"live" | "playlists" | "vault">("live");

  // Mobile navigation tab below deck: 'on_air' or 'booth'
  const [mobileTab, setMobileTab] = useState<"on_air" | "booth">("on_air");

  // Live Toast announcement state
  const [liveToast, setLiveToast] = useState<{ message: string; show: boolean } | null>(null);
  const isFirstLoadRef = useRef(true);
  const prevModeRef = useRef(broadcastMode);

  // Determine if active presenter takeover is live
  const isLiveTakeover = broadcastMode === "live" || Boolean(onAirSlot?.is_live);
  const activePresenterName = onAirSlot?.presenter?.dj_name || artist || "GOODLIFE DJ";
  const activeShowTitle = onAirSlot?.show?.title || title || "GOODLIFE LIVE AIRWAVE";
  const activeShowGenre = onAirSlot?.show?.genre || "Curated Live Selections";
  const activeShowDescription = onAirSlot?.show?.description || "Tracks are selected and mixed live on the decks. There is no automated queue.";
  const presenterSlug = onAirSlot?.presenter?.slug;
  const presenterAvatar = onAirSlot?.presenter?.avatar_url;
  const isOverrun = Boolean(onAirSlot?.is_overrun);

  // Reset cover error on track change
  useEffect(() => {
    setCoverError(false);
    setImgLoaded(false);
  }, [coverUrl, title, presenterAvatar]);

  // Live Toast: Fire ONCE when transitioning from autodj -> live (never on mid-set first load)
  useEffect(() => {
    if (isFirstLoadRef.current) {
      isFirstLoadRef.current = false;
      prevModeRef.current = broadcastMode;
      return;
    }

    if (prevModeRef.current !== "live" && broadcastMode === "live") {
      setLiveToast({
        message: `${activePresenterName} is now LIVE ON AIR!`,
        show: true,
      });
      const timer = setTimeout(() => {
        setLiveToast((prev) => (prev ? { ...prev, show: false } : null));
      }, 6000);
      return () => clearTimeout(timer);
    }
    prevModeRef.current = broadcastMode;
  }, [broadcastMode, activePresenterName]);

  // Keyboard shortcuts: Space for Play/Pause, M for Mute (desktop only)
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

  // Derived cover URL (presenter avatar wins when live)
  const resolvedCover = useMemo(() => {
    if (isLiveTakeover && presenterAvatar) {
      return resolveCoverArt(presenterAvatar);
    }
    if (!coverUrl) return "";
    if (coverError) return resolveFallbackCoverArt(coverUrl);
    return resolveCoverArt(coverUrl);
  }, [coverUrl, coverError, isLiveTakeover, presenterAvatar]);

  const displayTitle = formatTrackTitle(activeShowTitle);

  // Share handler
  const handleShare = useCallback(() => {
    setShowShareModal(true);
  }, []);

  // Reusable Share Station Card
  const shareCardNode = (
    <div className="border-4 border-brand-navy bg-white shadow-(--shadow-brut-md) rounded-none p-5 space-y-3">
      <div className="flex items-center gap-2 border-b-2 border-brand-navy/15 pb-2">
        <Share2 className="w-4 h-4 text-brand-navy" />
        <h4 className="font-display text-lg sm:text-xl uppercase tracking-wide text-brand-navy">
          SPREAD THE AIRWAVE
        </h4>
      </div>

      <p className="font-mono text-xs sm:text-sm text-brand-navy/80">
        Share GOODLIFE Radio with friends or locked-in festival crews across Kenya.
      </p>

      <button
        type="button"
        onClick={handleShare}
        className="w-full min-h-[44px] py-2.5 px-4 bg-brand-off-white hover:bg-brand-accent text-brand-navy font-mono text-xs sm:text-sm font-bold uppercase tracking-wider border-2 border-brand-navy rounded-none shadow-(--shadow-brut-xs) transition-all flex items-center justify-center gap-2 cursor-pointer active:translate-x-0.5 active:translate-y-0.5 focus-visible:outline-3 focus-visible:outline-brand-navy focus-visible:outline-offset-2"
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
    <div className="min-h-screen bg-brand-bg py-4 sm:py-6 px-3 sm:px-6 md:px-10 text-brand-navy font-sans relative selection:bg-brand-accent selection:text-brand-navy overflow-x-hidden w-full max-w-full">
      {/* Pre-rendered Live Announcement Region (Screen Readers) */}
      <div role="status" aria-live="polite" className="sr-only">
        {liveToast?.show ? liveToast.message : ""}
      </div>

      {/* Floating Toast Notification */}
      {liveToast?.show && (
        <div
          role="alert"
          className="fixed bottom-24 md:bottom-6 right-4 sm:right-6 z-50 bg-brand-navy text-brand-off-white border-4 border-brand-accent shadow-(--shadow-brut-lg) p-4 rounded-none max-w-sm flex items-center gap-3 animate-in fade-in slide-in-from-bottom duration-200"
        >
          <Radio className="w-5 h-5 text-brand-danger animate-pulse motion-reduce:animate-none shrink-0" />
          <div className="min-w-0 flex-1">
            <span className="font-display text-base uppercase tracking-wider text-brand-accent block leading-none">
              LIVE TAKEOVER
            </span>
            <p className="font-mono text-xs text-white mt-1 leading-snug">
              {liveToast.message}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setLiveToast((prev) => (prev ? { ...prev, show: false } : null))}
            className="p-1 hover:bg-white/20 text-white font-mono text-xs rounded-none border border-white/40 focus-visible:outline-3 focus-visible:outline-brand-accent focus-visible:outline-offset-2"
            aria-label="Dismiss notification"
          >
            ✕
          </button>
        </div>
      )}

      {/* Background Atmosphere */}
      <div
        className="absolute inset-0 z-0 pointer-events-none opacity-25"
        style={{
          backgroundImage:
            "radial-gradient(rgba(22,24,29,0.18) 1px, transparent 1px), radial-gradient(rgba(223,187,125,0.15) 1px, transparent 1px)",
          backgroundSize: "28px 28px, 56px 56px",
          backgroundPosition: "0 0, 14px 14px",
        }}
      />

      <div className="relative z-10 max-w-6xl mx-auto space-y-4 sm:space-y-6 w-full min-w-0">
        {/* ========================================================================= */}
        {/* STATION HEADER BAR                                                        */}
        {/* ========================================================================= */}
        <header className="w-full flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b-4 border-brand-navy pb-3">
          <div className="flex items-center gap-3 min-w-0">
            <Link
              href="/"
              className="p-2 sm:p-2.5 border-2 border-brand-navy bg-brand-off-white hover:bg-brand-accent transition-all shadow-(--shadow-brut-xs) flex items-center justify-center cursor-pointer shrink-0 rounded-none focus-visible:outline-3 focus-visible:outline-brand-navy focus-visible:outline-offset-2"
              title="Return to Festival Gate"
              aria-label="Return to Festival Gate"
            >
              <ArrowLeft className="w-5 h-5 text-brand-navy" />
            </Link>

            <div className="min-w-0">
              <h1 className="font-display text-2xl sm:text-3xl tracking-wide uppercase text-brand-navy leading-none truncate">
                GOODLIFE RADIO 254
              </h1>
              <p className="font-mono text-xs font-semibold text-brand-navy/80 tracking-wider uppercase mt-0.5 truncate">
                NAIROBI LIVE FESTIVAL AIRWAVE
              </p>
            </div>
          </div>

          <div className="w-full sm:w-auto flex flex-col sm:flex-row sm:items-center gap-2">
            {/* View Switcher: Live vs Playlists vs Vault */}
            <div className="w-full sm:w-auto flex border-2 border-brand-navy bg-brand-off-white rounded-none overflow-hidden shadow-(--shadow-brut-xs)">
              <button
                type="button"
                onClick={() => setActiveView("live")}
                className={`flex-1 sm:flex-initial px-3 py-2 font-mono text-xs font-bold uppercase transition-colors cursor-pointer text-center whitespace-nowrap rounded-none focus-visible:outline-3 focus-visible:outline-brand-navy focus-visible:outline-offset-2 ${
                  activeView === "live"
                    ? "bg-brand-navy text-brand-off-white"
                    : "text-brand-navy hover:bg-brand-accent"
                }`}
              >
                LIVE STATION
              </button>
              <button
                type="button"
                onClick={() => setActiveView("playlists")}
                className={`flex-1 sm:flex-initial px-3 py-2 font-mono text-xs font-bold uppercase transition-colors cursor-pointer flex items-center justify-center gap-1.5 whitespace-nowrap rounded-none focus-visible:outline-3 focus-visible:outline-brand-navy focus-visible:outline-offset-2 ${
                  activeView === "playlists"
                    ? "bg-brand-navy text-brand-off-white"
                    : "text-brand-navy hover:bg-brand-accent"
                }`}
              >
                <span>PLAYLISTS</span>
                {activePlaylist && !isLive && (
                  <span className="w-1.5 h-1.5 rounded-full bg-brand-accent animate-ping motion-reduce:animate-none" />
                )}
              </button>
              <button
                type="button"
                onClick={() => setActiveView("vault")}
                className={`flex-1 sm:flex-initial px-3 py-2 font-mono text-xs font-bold uppercase transition-colors cursor-pointer text-center whitespace-nowrap rounded-none focus-visible:outline-3 focus-visible:outline-brand-navy focus-visible:outline-offset-2 ${
                  activeView === "vault"
                    ? "bg-brand-navy text-brand-off-white"
                    : "text-brand-navy hover:bg-brand-accent"
                }`}
              >
                VAULT
              </button>
            </div>

            {/* Action Bar */}
            <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
              <Link
                href="/radio/schedule"
                className="flex-1 sm:flex-initial min-h-[44px] justify-center px-3 py-2 font-mono text-xs font-bold uppercase border-2 border-brand-navy bg-brand-off-white hover:bg-brand-accent transition-colors shadow-(--shadow-brut-xs) flex items-center gap-1.5 text-brand-navy rounded-none focus-visible:outline-3 focus-visible:outline-brand-navy focus-visible:outline-offset-2"
                title="View full broadcast timetable"
              >
                <Calendar className="w-3.5 h-3.5 text-brand-navy" />
                <span>TIMETABLE</span>
              </Link>
              <PwaInstallButton appName="GOODLIFE Radio" />

              {/* Engine Status Badge: 24/7 ON AIR */}
              <span className="hidden sm:flex bg-red-600 text-white font-mono text-xs font-bold px-2.5 sm:px-3 py-1.5 uppercase items-center gap-1.5 border-2 border-brand-navy shadow-(--shadow-brut-xs) rounded-none">
                <span className="w-2 h-2 rounded-full bg-white animate-pulse motion-reduce:animate-none" />
                <span>24/7 ON AIR</span>
              </span>
            </div>
          </div>
        </header>

        {/* ========================================================================= */}
        {/* TAB VIEW 1: LIVE BROADCAST STATION                                        */}
        {/* ========================================================================= */}
        {activeView === "live" && (
          <div className="space-y-6">
            {/* If currently playing an on-demand tape, show quick return pill */}
            {activePlaylist && !isLive && (
              <div className="p-3 bg-brand-navy text-white border-3 border-brand-navy rounded-none flex flex-wrap items-center justify-between gap-3 shadow-(--shadow-brut-sm)">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="w-2.5 h-2.5 rounded-full bg-brand-accent animate-ping motion-reduce:animate-none shrink-0" />
                  <span className="font-mono text-xs uppercase truncate text-brand-off-white">
                    PLAYING ON-DEMAND PLAYLIST:{" "}
                    <strong className="text-brand-accent">{activePlaylist.name}</strong>{" "}
                    (TRACK {activePlaylist.trackIndex + 1} OF {activePlaylist.tracks.length})
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setActiveView("playlists")}
                    className="px-3 py-1 bg-white text-brand-navy font-mono text-xs font-bold uppercase border border-brand-navy hover:bg-brand-accent transition-colors cursor-pointer rounded-none focus-visible:outline-3 focus-visible:outline-brand-accent focus-visible:outline-offset-2"
                  >
                    VIEW TAPE
                  </button>
                  <button
                    type="button"
                    onClick={snapToBroadcast}
                    className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white font-mono text-xs font-bold uppercase border border-brand-navy transition-colors cursor-pointer rounded-none focus-visible:outline-3 focus-visible:outline-brand-accent focus-visible:outline-offset-2"
                  >
                    RETURN TO LIVE BROADCAST
                  </button>
                </div>
              </div>
            )}

            {/* HERO DECK CONSOLE (THE CENTERPIECE) */}
            <div className="relative border-4 border-brand-navy bg-brand-navy text-brand-off-white shadow-(--shadow-brut-xl) rounded-none p-3.5 sm:p-6 lg:p-8 overflow-hidden w-full max-w-full">
              {/* Top Strip Indicator */}
              <div className="relative z-10 flex items-center justify-between gap-3 border-b-2 border-white/10 pb-3 mb-4 sm:mb-6">
                <div className="flex items-center gap-2">
                  <div
                    className={`w-2.5 h-2.5 rounded-full ${
                      isPlaying ? "bg-brand-accent animate-pulse motion-reduce:animate-none" : "bg-white/40"
                    }`}
                  />
                  <span className="font-mono text-xs font-bold text-brand-accent tracking-widest uppercase">
                    {engineState === "live"
                      ? "LIVE AIRWAVE · NAIROBI FREQUENCY"
                      : engineState === "reconnecting"
                      ? "RECONNECTING TO LIVE STREAM..."
                      : engineState === "buffering"
                      ? "BUFFERING AUDIO..."
                      : engineState === "connecting"
                      ? "CONNECTING TO LIVE STREAM..."
                      : engineState === "offline"
                      ? "STATION OFFLINE"
                      : "READY TO TUNE IN"}
                  </span>
                  {isStale && (
                    <span className="font-mono text-xs text-brand-navy bg-amber-400 px-2 py-0.5 rounded-none border border-brand-navy font-bold">
                      FEED RECONNECTING
                    </span>
                  )}
                </div>

                {/* Audio Equalizer Bars */}
                {isPlaying && (
                  <div
                    className="flex items-end gap-1 h-5 px-2.5 py-1 rounded-none bg-black/40 border border-white/10"
                    aria-hidden="true"
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
              <div className="relative z-10 grid grid-cols-1 md:grid-cols-12 gap-4 sm:gap-6 md:gap-8 items-center w-full min-w-0 max-w-full">
                {/* 1. Desktop Vinyl & Sleeve Motif */}
                <div className="hidden md:flex md:col-span-5 justify-center">
                  <div className="relative w-64 h-64 sm:w-72 sm:h-72 group">
                    {/* Spinning Vinyl (circular) */}
                    <div
                      className={`absolute top-2 -right-4 sm:-right-8 w-60 h-60 sm:w-68 sm:h-68 rounded-full border-4 border-black bg-neutral-950 shadow-2xl flex items-center justify-center transition-transform duration-700 ${
                        isPlaying ? "translate-x-4 sm:translate-x-8" : "translate-x-0"
                      }`}
                      aria-hidden="true"
                    >
                      <div className="w-52 h-52 sm:w-60 sm:h-60 rounded-full border border-white/5 flex items-center justify-center">
                        <div className="w-44 h-44 sm:w-52 sm:h-52 rounded-full border border-white/10 flex items-center justify-center">
                          <div className="w-36 h-36 sm:w-44 sm:h-44 rounded-full border border-white/5 flex items-center justify-center">
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

                    {/* Sharp Sleeve Cover Art */}
                    <div className="relative z-10 w-60 h-60 sm:w-68 sm:h-68 rounded-none border-4 border-brand-navy-light bg-neutral-900 overflow-hidden shadow-2xl flex items-center justify-center">
                      {!resolvedCover ? (
                        <div className="w-full h-full bg-linear-to-br from-neutral-900 via-brand-navy to-black flex flex-col items-center justify-center p-4 text-center select-none">
                          <Disc3 className="w-10 h-10 text-brand-accent/80 mb-2" />
                          <span className="font-display text-base tracking-wider uppercase text-brand-off-white">
                            {isLiveTakeover ? activePresenterName : "GOODLIFE AIRWAVE"}
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

                      {/* Single Definitive ON AIR NOW Badge */}
                      {engineState === "live" && isPlaying && (
                        <div className="absolute top-2 left-2 bg-brand-danger text-white font-mono font-bold text-xs px-2.5 py-1 uppercase tracking-widest border border-brand-navy shadow-md flex items-center gap-1.5 rounded-none">
                          <Radio className="w-3.5 h-3.5 animate-pulse motion-reduce:animate-none" />
                          <span>ON AIR NOW</span>
                        </div>
                      )}
                      {engineState === "reconnecting" && (
                        <div className="absolute top-2 left-2 bg-amber-400 text-brand-navy font-mono font-bold text-xs px-2.5 py-1 uppercase tracking-widest border border-brand-navy shadow-md flex items-center gap-1.5 rounded-none">
                          <RotateCcw className="w-3.5 h-3.5 animate-spin motion-reduce:animate-none" />
                          <span>RECONNECTING</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* 2. Controls & Metadata Column */}
                <div className="md:col-span-7 flex flex-col justify-between space-y-4 sm:space-y-5 w-full min-w-0 max-w-full">
                  {/* MOBILE COMPACT DECK VIEW (<768px, <320px vertical height budget) */}
                  <div className="flex md:hidden items-center gap-3 w-full min-w-0">
                    <div className="relative w-18 h-18 shrink-0 rounded-none border-2 border-brand-accent bg-neutral-900 overflow-hidden shadow-md flex items-center justify-center">
                      {!resolvedCover ? (
                        <Disc3 className="w-8 h-8 text-brand-accent/80" />
                      ) : (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={resolvedCover}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <h2 className="font-display text-xl sm:text-2xl uppercase tracking-wide text-brand-off-white leading-tight truncate">
                        {displayTitle}
                      </h2>
                      <p className="font-mono text-xs font-bold tracking-wider uppercase text-brand-accent mt-0.5 truncate">
                        BY {activePresenterName}
                      </p>
                    </div>

                    <button
                      type="button"
                      id="mobile-play-button"
                      onClick={togglePlay}
                      className="w-14 h-14 shrink-0 rounded-none bg-brand-accent text-brand-navy border-2 border-brand-navy shadow-(--shadow-brut-xs) active:translate-x-0.5 active:translate-y-0.5 flex items-center justify-center cursor-pointer transition-transform focus-visible:outline-3 focus-visible:outline-brand-accent focus-visible:outline-offset-2"
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

                  {/* DESKTOP METADATA VIEW (>=768px) */}
                  <div className="hidden md:block space-y-2">
                    <h2 className="font-display text-3xl sm:text-4xl lg:text-5xl uppercase tracking-wide text-brand-off-white leading-[0.95]">
                      {displayTitle}
                    </h2>

                    <div className="flex flex-wrap items-center gap-3 mt-2">
                      <p className="font-mono text-sm sm:text-base font-bold tracking-widest uppercase text-brand-accent flex items-center gap-2">
                        <span>HOSTED BY {activePresenterName}</span>
                      </p>

                      {presenterSlug && (
                        <Link
                          href={`/radio/presenters/${presenterSlug}`}
                          className="min-h-[44px] inline-flex items-center px-3 py-1 font-mono text-xs font-bold border-2 border-brand-accent/50 text-brand-accent hover:bg-brand-accent hover:text-brand-navy transition-colors rounded-none focus-visible:outline-3 focus-visible:outline-brand-accent focus-visible:outline-offset-2"
                        >
                          <span>VIEW BIO & ARCHIVES ↗</span>
                        </Link>
                      )}
                    </div>

                    {/* Slot Timetable Pill & Stream Mode */}
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
                            className="w-full h-2 bg-white/15 rounded-none appearance-none"
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="hidden">
                        <span>LIVE STAGE FEED</span>
                      </div>
                    )}

                    {onAirSlot?.starts_at && onAirSlot?.ends_at && (
                      <div className="flex items-center gap-2 pt-1">
                        <span className="font-mono text-xs text-white/80 bg-white/10 px-2.5 py-1 border border-white/20 rounded-none flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-brand-accent" />
                          <span>
                            {isOverrun ? "LIVE EXTENDED SET" : formatSlotTimeRange(onAirSlot.starts_at, onAirSlot.ends_at)}
                          </span>
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Desktop Master Transport Controls */}
                  <div className="hidden md:flex flex-wrap items-center justify-between gap-4 pt-3 border-t border-white/10">
                    <div className="flex items-center gap-4">
                      <button
                        type="button"
                        id="desktop-play-button"
                        onClick={togglePlay}
                        className="w-16 h-16 rounded-none border-3 border-brand-navy bg-brand-accent hover:bg-brand-accent-vivid text-brand-navy flex items-center justify-center transition-all cursor-pointer hover:scale-105 active:translate-x-0.5 active:translate-y-0.5 shadow-(--shadow-brut-md) focus-visible:outline-3 focus-visible:outline-brand-accent focus-visible:outline-offset-2"
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
                        <span className="font-mono text-xs text-white/70 hidden lg:block">
                          Spacebar: Play/Pause · M: Mute
                        </span>
                      </div>
                    </div>

                    {/* Tactile Volume Controls */}
                    <div className="flex items-center gap-2.5 bg-black/40 border border-white/10 px-3 py-2 rounded-none">
                      <button
                        type="button"
                        onClick={toggleMute}
                        className="text-white/80 hover:text-brand-accent transition-colors cursor-pointer p-1 focus-visible:outline-3 focus-visible:outline-brand-accent focus-visible:outline-offset-2"
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
                        className="w-20 sm:w-24 h-2 bg-white/20 rounded-none appearance-none accent-brand-accent cursor-pointer focus-visible:outline-3 focus-visible:outline-brand-accent focus-visible:outline-offset-2"
                        title="Volume Slider"
                        aria-label="Volume Slider"
                      />
                      <span className="font-mono text-xs text-white/70 w-8 text-right">
                        {isMuted ? "0%" : `${Math.round(volume * 100)}%`}
                      </span>
                    </div>
                  </div>

                  {/* Mobile Volume Row */}
                  <div className="flex md:hidden items-center justify-between gap-3 pt-2 border-t border-white/10">
                    <button
                      type="button"
                      onClick={toggleMute}
                      className="min-h-[44px] inline-flex items-center gap-1.5 text-white/80 font-mono text-xs py-1"
                      aria-label={isMuted ? "Unmute" : "Mute"}
                    >
                      {isMuted ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4" />}
                      <span>{isMuted ? "MUTED" : `${Math.round(volume * 100)}%`}</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleShare}
                      className="min-h-[44px] inline-flex items-center gap-1.5 font-mono text-xs text-brand-accent py-1"
                    >
                      <Share2 className="w-3.5 h-3.5" />
                      <span>{copiedLink ? "COPIED" : "SHARE"}</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* MOBILE NAVIGATION TABS (Under 768px, tablist role with accessible keyboard navigation) */}
            <div className="block md:hidden border-2 border-brand-navy bg-brand-off-white rounded-none p-1 shadow-(--shadow-brut-xs)">
              <div role="tablist" aria-label="Mobile Station Navigation" className="flex">
                <button
                  type="button"
                  role="tab"
                  aria-selected={mobileTab === "on_air"}
                  onClick={() => setMobileTab("on_air")}
                  className={`flex-1 py-2.5 font-mono text-xs font-black uppercase tracking-wider rounded-none transition-colors text-center cursor-pointer ${
                    mobileTab === "on_air"
                      ? "bg-brand-navy text-brand-off-white"
                      : "text-brand-navy hover:bg-brand-accent"
                  }`}
                >
                  📻 ON AIR
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={mobileTab === "booth"}
                  onClick={() => setMobileTab("booth")}
                  className={`flex-1 py-2.5 font-mono text-xs font-black uppercase tracking-wider rounded-none transition-colors text-center cursor-pointer ${
                    mobileTab === "booth"
                      ? "bg-brand-navy text-brand-off-white"
                      : "text-brand-navy hover:bg-brand-accent"
                  }`}
                >
                  💬 BOOTH LINE
                </button>
              </div>
            </div>

            {/* ========================================================================= */}
            {/* BELOW-DECK SECTIONS (Desktop: 2 columns; Mobile: controlled by mobileTab)   */}
            {/* ========================================================================= */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* LEFT COLUMN: CRATE MODE OR AUTOMATED QUEUE (7 COLS) */}
              <div className={`lg:col-span-7 space-y-6 ${mobileTab !== "on_air" ? "hidden md:block" : ""}`}>
                {/* 1. CRATE MODE (When live) OR UP NEXT (AutoDJ) */}
                {isLiveTakeover ? (
                  <section
                    aria-label="Live DJ Crate"
                    className="border-4 border-brand-navy bg-white shadow-(--shadow-brut-md) rounded-none p-5 space-y-4"
                  >
                    <div className="flex items-center justify-between border-b-2 border-brand-navy/15 pb-2">
                      <div className="flex items-center gap-2">
                        <Radio className="w-4 h-4 text-brand-danger animate-pulse motion-reduce:animate-none" />
                        <h3 className="font-display text-xl sm:text-2xl uppercase tracking-wide text-brand-navy">
                          LIVE IN THE CRATE
                        </h3>
                      </div>
                      <span className="font-mono text-xs font-bold uppercase text-brand-danger px-2.5 py-0.5 rounded-none bg-red-50 border border-brand-danger">
                        MIXING LIVE
                      </span>
                    </div>

                    <p className="font-mono text-xs uppercase text-brand-navy/80 leading-relaxed">
                      {activeShowDescription}
                    </p>

                    <div className="p-3 bg-brand-off-white border-2 border-brand-navy rounded-none space-y-1 font-mono text-xs">
                      <span className="font-black text-brand-navy block uppercase tracking-wider">
                        SOUND &amp; VIBE
                      </span>
                      <p className="text-brand-navy/70 uppercase">
                        {activeShowGenre}
                      </p>
                    </div>

                    <div className="p-3 bg-emerald-50 border-2 border-emerald-800 rounded-none flex items-center gap-2 font-mono text-xs text-emerald-950 font-bold">
                      <ShieldCheck className="w-4 h-4 text-emerald-700 shrink-0" />
                      <span>RECORDING THIS SET FOR FESTIVAL VAULT</span>
                    </div>
                  </section>
                ) : upNext && upNext.length > 0 ? (
                  <section
                    aria-label="Up Next"
                    className="border-4 border-brand-navy bg-white shadow-(--shadow-brut-md) rounded-none p-4 sm:p-5 space-y-3"
                  >
                    <div className="flex items-center justify-between border-b-2 border-brand-navy/15 pb-2">
                      <h3 className="font-display text-xl sm:text-2xl uppercase tracking-wide text-brand-navy">
                        UP NEXT ON AIR
                      </h3>
                      <span className="font-mono text-xs font-bold uppercase text-brand-navy/70 px-2 py-0.5 rounded-none bg-brand-off-white border border-brand-navy/20">
                        {upNext.length} IN QUEUE
                      </span>
                    </div>

                    <div className="divide-y divide-brand-navy/10">
                      {upNext.slice(0, 3).map((item, index) => (
                        <div key={item.video_id || index} className="py-2.5 flex items-center justify-between gap-2 sm:gap-3 min-w-0">
                          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
                            <span className="w-5 font-mono text-xs font-bold text-brand-navy/60 shrink-0">
                              #{index + 1}
                            </span>
                            <div className="w-10 h-10 rounded-none border border-brand-navy/30 overflow-hidden bg-brand-off-white flex items-center justify-center shrink-0">
                              {item.thumbnail ? (
                                /* eslint-disable-next-line @next/next/no-img-element */
                                <img
                                  src={resolveCoverArt(item.thumbnail)}
                                  alt=""
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <Disc3 className="w-5 h-5 text-brand-navy/40" />
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="font-bold text-xs sm:text-sm uppercase text-brand-navy truncate leading-tight">
                                {formatTrackTitle(item.title)}
                              </p>
                              {item.artist && (
                                <p className="font-mono text-xs text-brand-navy/80 uppercase truncate mt-0.5">
                                  {item.artist}
                                </p>
                              )}
                            </div>
                          </div>
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
                ) : null}

                {/* 2. RECENTLY PLAYED (Suppressed during live takeovers) */}
                {!isLiveTakeover && history && history.length > 0 && (
                  <section
                    aria-label="Recently Played"
                    className="border-4 border-brand-navy bg-white shadow-(--shadow-brut-md) rounded-none p-4 sm:p-5 space-y-3"
                  >
                    <div className="flex items-center justify-between border-b-2 border-brand-navy/15 pb-2">
                      <h3 className="font-display text-xl sm:text-2xl uppercase tracking-wide text-brand-navy">
                        RECENTLY PLAYED
                      </h3>
                      <span className="font-mono text-xs font-bold uppercase text-brand-navy/70 px-2 py-0.5 rounded-none bg-brand-off-white border border-brand-navy/20">
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
                                {formatTrackTitle(hist.title)}
                              </p>
                              {hist.artist && (
                                <p className="font-mono text-xs text-brand-navy/80 uppercase truncate mt-0.5">
                                  {hist.artist}
                                </p>
                              )}
                            </div>

                            <a
                              href={songSearchUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1.5 rounded-none hover:bg-brand-accent text-brand-navy/70 hover:text-brand-navy transition-colors focus-visible:outline-3 focus-visible:outline-brand-navy focus-visible:outline-offset-2"
                              title={`Search "${hist.title}" on Spotify`}
                              aria-label={`Search ${hist.title} on Spotify`}
                            >
                              <ExternalLink className="w-4 h-4" />
                            </a>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                )}
              </div>

              {/* RIGHT COLUMN: BOOTH HOTLINE & EVENT CARDS (5 COLS) */}
              <div className={`lg:col-span-5 space-y-6 ${mobileTab !== "booth" ? "hidden md:block" : ""}`}>
                <UpcomingEventCard event={activeEvent} />
                <LiveContestWidget />
                <LivePollWidget />
                <ShoutoutWall
                  isLiveTakeover={isLiveTakeover}
                  presenterName={activePresenterName}
                  presenterId={onAirSlot?.presenter?.id}
                />
                {shareCardNode}
                <CatchUpVault />
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB VIEW 2: CURATED PLAYLISTS / TAPES                                     */}
        {/* ========================================================================= */}
        {activeView === "playlists" && (
          <div className="space-y-4">
            <CuratedPlaylists />
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB VIEW 3: FESTIVAL SET VAULT (ARCHIVED DJ SETS)                         */}
        {/* ========================================================================= */}
        {activeView === "vault" && (
          <div className="space-y-4">
            <div className="p-4 bg-brand-off-white border-2 border-brand-navy rounded-none flex items-center justify-between">
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
                className="px-3 py-1.5 bg-brand-accent text-brand-navy font-mono text-xs sm:text-sm font-bold uppercase border-2 border-brand-navy rounded-none shadow-(--shadow-brut-xs) cursor-pointer focus-visible:outline-3 focus-visible:outline-brand-navy focus-visible:outline-offset-2"
              >
                ← RETURN TO LIVE ON AIR
              </button>
            </div>
            {/* Full festival set tracklist queue for vault archive */}
            {queue && queue.length > 0 && (
              <div className="hidden">
                {queue.map((t) => (
                  <span key={t.id}>{formatTrackTitle(t.title)}</span>
                ))}
              </div>
            )}
            <FestivalSetVault />
          </div>
        )}
      </div>

      {/* Social Share Modal */}
      <ShareStationModal
        isOpen={showShareModal}
        onClose={() => setShowShareModal(false)}
        title={title}
        artist={activePresenterName}
      />
    </div>
  );
}
