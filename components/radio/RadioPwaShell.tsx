"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Share2,
  Music2,
  Radio,
  Disc3,
  MessageSquare,
  X,
  RotateCcw,
  Calendar,
} from "lucide-react";
import { useRadio } from "@/context/RadioContext";
import {
  resolveCoverArt,
  resolveFallbackCoverArt,
  formatTrackTitle,
} from "@/lib/radio/media-helpers";
import RadioRibbonVisualizer from "@/components/radio/RadioRibbonVisualizer";
import RadioPwaTimetableDrawer from "@/components/radio/RadioPwaTimetableDrawer";
import FestivalSetVault from "@/components/radio/FestivalSetVault";
import CatchUpVault from "@/components/radio/CatchUpVault";
import ShoutoutWall from "@/components/radio/ShoutoutWall";
import LivePollWidget from "@/components/radio/LivePollWidget";
import LiveContestWidget from "@/components/radio/LiveContestWidget";
import ShareStationModal from "@/components/radio/ShareStationModal";

type PwaTab = "live" | "vault" | "chat";

/**
 * Standalone PWA shell (Option A: Clean Radio Deck) for GOODLIFE Radio 254.
 * Activated only in standalone display mode or ?source=pwa; browser visitors
 * continue to see the full website experience.
 */
export default function RadioPwaShell() {
  const {
    engineState,
    isPlaying,
    isLive,
    broadcastMode,
    activePlaylist,
    title,
    artist,
    coverUrl,
    isDropPlaying,
    activeDropTitle,
    volume = 1,
    isMuted,
    togglePlay,
    toggleMute,
    snapToBroadcast,
    onAirSlot,
    getActiveAudioElement,
  } = useRadio();

  const [activeTab, setActiveTab] = useState<PwaTab>("live");
  const [showLyrics, setShowLyrics] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [coverError, setCoverError] = useState(false);

  // Honor ?tab= from manifest app shortcuts
  useEffect(() => {
    if (typeof window === "undefined") return;
    const param = new URLSearchParams(window.location.search).get("tab");
    if (param === "live" || param === "vault" || param === "chat") {
      setActiveTab(param);
    }
  }, []);

  const isLiveTakeover = broadcastMode === "live" || Boolean(onAirSlot?.is_live);
  const activePresenterName =
    onAirSlot?.presenter?.display_name ||
    onAirSlot?.presenter?.name ||
    artist ||
    "GOODLIFE DJ";

  const displayTitle = useMemo(() => {
    if (isDropPlaying && activeDropTitle) return activeDropTitle;
    if (title) return formatTrackTitle(title);
    return onAirSlot?.show?.title || "GOODLIFE RADIO LIVE";
  }, [isDropPlaying, activeDropTitle, title, onAirSlot?.show?.title]);

  const displaySubtitle = useMemo(() => {
    if (isLiveTakeover) return `Hosted by ${activePresenterName} · Live on Decks`;
    if (activePlaylist && !isLive) {
      return `${artist || "GOODLIFE 254"} · Playlist: ${activePlaylist.name}`;
    }
    return artist || "24/7 Afrobeats, Amapiano & Festival Anthems";
  }, [isLiveTakeover, activePresenterName, activePlaylist, isLive, artist]);

  const resolvedCover = useMemo(() => {
    if (coverError) return resolveFallbackCoverArt();
    if (coverUrl && coverUrl !== "/flyer.png") return resolveCoverArt(coverUrl);
    return "/radio-pass-3d.png";
  }, [coverUrl, coverError]);

  const statusTag = useMemo(() => {
    if (isLiveTakeover) return "LIVE DJ TAKEOVER";
    if (activePlaylist && !isLive) {
      return `PLAYLIST · TRACK ${activePlaylist.trackIndex + 1}/${activePlaylist.tracks.length}`;
    }
    if (!isLive) return "VAULT · ON-DEMAND";
    return "GOODLIFE RADIO · 24/7";
  }, [isLiveTakeover, activePlaylist, isLive]);

  const isDefaultPass = useMemo(() => {
    return (
      !coverUrl ||
      coverError ||
      resolvedCover === "/flyer.png" ||
      resolvedCover.includes("flyer.png") ||
      resolvedCover.includes("radio-pass-3d")
    );
  }, [coverUrl, coverError, resolvedCover]);

  return (
    <div className="h-[100dvh] w-full max-w-md md:max-w-5xl lg:max-w-7xl mx-auto bg-[#0D0F12] text-[#FBF9F6] flex flex-col overflow-hidden select-none md:border-x md:border-white/[0.08] shadow-[0_0_80px_rgba(0,0,0,0.85)]">
      {/* App-Only Top Bar */}
      <header className="bg-[#0D0F12] text-[#FBF9F6] px-4 md:px-6 py-3 border-b border-white/[0.08] flex items-center justify-between shrink-0 gap-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-none bg-[#E84855] text-white font-mono text-[11px] font-bold uppercase tracking-wider shadow-sm">
            <span
              className={`w-2 h-2 rounded-full ${
                isPlaying ? "bg-white animate-pulse motion-reduce:animate-none" : "bg-white/50"
              }`}
            />
            <span>{isPlaying ? "ON AIR" : "STANDBY"}</span>
          </div>
          <span className="font-mono text-xs font-bold tracking-wider text-white/90">254 FM</span>
          <span className="hidden lg:inline-block font-mono text-[10px] text-neutral-400 border-l border-white/10 pl-3">
            GOODLIFE LIVE AIRWAVES
          </span>
        </div>

        {/* Desktop / Tablet Nav Switcher */}
        <nav aria-label="Desktop Station Navigation" className="hidden md:flex items-center gap-1 bg-[#14171E] border border-white/10 p-1">
          {(
            [
              { id: "live", label: "LIVE AIRWAVES", Icon: Radio },
              { id: "vault", label: "DJ VAULT & RECAPS", Icon: Disc3 },
              { id: "chat", label: "BOOTH CHAT", Icon: MessageSquare },
            ] as const
          ).map(({ id, label, Icon }) => {
            const isActive = activeTab === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setActiveTab(id)}
                className={`px-4 py-1.5 flex items-center gap-2 font-mono text-xs uppercase cursor-pointer transition-all ${
                  isActive
                    ? "bg-[#DFBB7D] text-[#0D0F12] font-black shadow-md"
                    : "text-[#CBD5E1]/80 hover:text-white hover:bg-white/[0.04] font-bold"
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? "text-[#0D0F12]" : "text-[#CBD5E1]"}`} />
                <span>{label}</span>
              </button>
            );
          })}
        </nav>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowSchedule(true)}
            className="px-3 py-1.5 rounded-none bg-transparent border border-[#DFBB7D]/50 hover:border-[#DFBB7D] text-[#DFBB7D] font-mono text-[10px] font-bold tracking-wider uppercase flex items-center gap-1.5 cursor-pointer transition-colors shadow-[inset_0_1px_1px_rgba(223,187,125,0.15)]"
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>SCHEDULE</span>
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 min-h-0 flex flex-col relative">
        {activeTab === "live" && (
          <div className="flex-1 min-h-0 p-3.5 md:p-6 flex flex-col gap-3.5 md:gap-5 overflow-y-auto md:overflow-hidden justify-between">
            {/* Mobile-only conditional return to live banner */}
            {!isLive && (
              <div className="md:hidden bg-[#181A20] text-[#FBF9F6] border border-white/15 rounded-none px-3.5 py-2 flex items-center justify-between gap-2 shrink-0">
                <span className="font-mono text-[11px] font-bold uppercase truncate text-[#CBD5E1]">
                  {activePlaylist ? `PLAYING: ${activePlaylist.name}` : "PLAYING VAULT SET"}
                </span>
                <button
                  type="button"
                  onClick={snapToBroadcast}
                  className="px-2.5 py-1 bg-[#E84855] text-white font-mono text-[10px] font-bold uppercase rounded-none border border-white/20 flex items-center gap-1 shrink-0 cursor-pointer hover:bg-[#d63c49] transition-colors"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>RETURN TO LIVE</span>
                </button>
              </div>
            )}

            {/* Responsive Grid Deck: 1 col on mobile, 12 cols on md+ */}
            <div className="flex-1 min-h-0 flex flex-col md:grid md:grid-cols-12 md:gap-6 md:items-stretch">
              {/* Left Column: Cover Art + Studio Specs (md:col-span-5) */}
              <div className="flex-1 md:flex-initial md:col-span-5 flex flex-col gap-4 min-h-0">
                <div className="relative flex-1 min-h-[220px] md:min-h-[300px] border border-white/[0.08] rounded-none shadow-2xl overflow-hidden bg-[#13151C] flex flex-col justify-between items-center p-4">
                  {isDefaultPass ? (
                    <>
                      <span className="relative z-10 px-4 py-1.5 rounded-none bg-[#1C2028] border border-white/10 shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)] font-mono text-[10px] font-bold uppercase tracking-wider text-[#DFBB7D] text-center">
                        {statusTag}
                      </span>

                      <div className="relative z-10 w-full flex-1 flex items-center justify-center my-auto py-2">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={resolvedCover}
                          alt={displayTitle}
                          onError={() => setCoverError(true)}
                          className="w-[84%] max-w-[340px] md:max-w-[280px] lg:max-w-[340px] aspect-square object-contain mx-auto drop-shadow-[0_20px_40px_rgba(0,0,0,0.85)]"
                        />
                      </div>

                      <div className="w-full flex items-center justify-start px-2 mt-auto">
                        <span className="relative z-10 font-mono text-[10px] font-bold uppercase tracking-widest text-[#DFBB7D]/90 drop-shadow-sm">
                          {onAirSlot?.show?.title || "GOODLIFE RADIO 254"}
                        </span>
                      </div>
                    </>
                  ) : (
                    <>
                      {/* Real track cover art */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={resolvedCover}
                        alt={displayTitle}
                        onError={() => setCoverError(true)}
                        className="absolute inset-0 w-full h-full object-cover"
                      />
                      <div
                        className="absolute inset-0"
                        style={{
                          background:
                            "linear-gradient(to top, rgba(13,15,18,0.92) 0%, rgba(13,15,18,0.2) 55%, rgba(13,15,18,0.45) 100%)",
                        }}
                      />
                      <span className="relative z-10 px-4 py-1.5 rounded-none bg-[#1C2028]/80 backdrop-blur-xs border border-white/10 shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)] font-mono text-[10px] font-bold uppercase tracking-wider text-[#DFBB7D]">
                        {statusTag}
                      </span>
                      <div className="w-full flex items-center justify-start px-2 mt-auto">
                        <span className="relative z-10 font-mono text-[10px] font-bold uppercase tracking-widest text-[#DFBB7D] drop-shadow">
                          {onAirSlot?.show?.title || "GOODLIFE RADIO 254"}
                        </span>
                      </div>
                    </>
                  )}
                </div>

                {/* Studio Specs Card (Tablet/Desktop Only) */}
                <div className="hidden md:flex flex-col gap-2 p-4 bg-[#14171E] border border-white/[0.08] shadow-lg shrink-0">
                  <div className="flex items-center justify-between font-mono text-[10px] text-neutral-400 uppercase">
                    <span>BROADCAST NETWORK</span>
                    <span className="text-emerald-400 font-bold flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      ONLINE 24/7
                    </span>
                  </div>
                  <div className="flex items-center justify-between font-mono text-xs text-white/90">
                    <span className="text-[#DFBB7D] font-bold">NAIROBI AIRWAVES</span>
                    <span className="font-mono text-[11px] text-neutral-300">320K DIGITAL HLS</span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] font-mono text-neutral-400 pt-1.5 border-t border-white/[0.06]">
                    <span className="truncate max-w-[160px]">HOST: {activePresenterName}</span>
                    <button
                      type="button"
                      onClick={() => setShowSchedule(true)}
                      className="text-[#DFBB7D] hover:underline uppercase font-bold cursor-pointer shrink-0"
                    >
                      SCHEDULE →
                    </button>
                  </div>
                </div>
              </div>

              {/* Right Column: Track Info, Visualizer, Transport Controls, and Booth Card (md:col-span-7) */}
              <div className="flex flex-col gap-4 md:col-span-7 justify-between min-h-0 mt-3 md:mt-0">
                {/* Desktop conditional Return to Live banner */}
                {!isLive && (
                  <div className="hidden md:flex bg-[#181A20] text-[#FBF9F6] border border-white/15 rounded-none px-4 py-2.5 items-center justify-between gap-3 shadow-md shrink-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-2 h-2 rounded-full bg-[#E84855] animate-ping" />
                      <span className="font-mono text-xs font-bold uppercase truncate text-[#CBD5E1]">
                        {activePlaylist ? `PLAYING PLAYLIST: ${activePlaylist.name}` : "PLAYING VAULT SET"}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={snapToBroadcast}
                      className="px-3 py-1 bg-[#E84855] hover:bg-[#d63c49] text-white font-mono text-xs font-bold uppercase rounded-none border border-white/20 flex items-center gap-1.5 shrink-0 cursor-pointer transition-colors shadow-sm"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>RETURN TO LIVE</span>
                    </button>
                  </div>
                )}

                {/* Track Info + Ribbon Soundwave Visualizer */}
                <div className="bg-[#14171E] border border-white/[0.08] rounded-none shadow-xl px-4 py-3.5 md:p-5 shrink-0 flex flex-col gap-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="font-sans font-bold text-lg sm:text-xl md:text-2xl lg:text-3xl leading-tight tracking-wide text-white uppercase truncate">
                      {displayTitle}
                    </h2>
                    <button
                      type="button"
                      onClick={() => setShowLyrics(true)}
                      className="px-3.5 py-1.5 bg-gradient-to-b from-[#242832] to-[#171A21] hover:border-white/20 text-white/90 border border-white/10 rounded-none font-mono text-xs font-bold uppercase flex items-center gap-1.5 shrink-0 cursor-pointer transition-all shadow-[inset_0_1px_1px_rgba(255,255,255,0.08)]"
                    >
                      <Music2 className="w-3.5 h-3.5 text-white/80" />
                      <span>LYRICS</span>
                    </button>
                  </div>
                  <p className="text-xs sm:text-sm font-semibold text-[#DFBB7D] truncate">
                    {displaySubtitle}
                  </p>
                  <div className="mt-1">
                    <RadioRibbonVisualizer
                      isPlaying={isPlaying}
                      isMuted={isMuted}
                      volume={volume}
                      isDropPlaying={isDropPlaying}
                      getAudioElement={getActiveAudioElement}
                    />
                  </div>
                </div>

                {/* Balanced 3-Button Hardware Transport Bar */}
                <div className="bg-gradient-to-b from-[#181B22] to-[#12141A] border border-white/10 rounded-none shadow-2xl p-4 md:p-6 shrink-0 flex flex-col items-center gap-3">
                  <div className="flex items-center justify-center gap-6 sm:gap-8 md:gap-10 w-full">
                    <button
                      type="button"
                      onClick={toggleMute}
                      aria-label={isMuted ? "Unmute radio" : "Mute radio"}
                      className={`px-5 py-2.5 rounded-none border font-mono text-xs font-bold uppercase flex items-center justify-center gap-2 cursor-pointer transition-all min-h-[44px] min-w-[100px] ${
                        isMuted
                          ? "bg-[#E84855] border-[#E84855] text-white shadow-lg"
                          : "bg-gradient-to-b from-[#222630] to-[#16181F] border-white/10 hover:border-white/20 text-white/90 shadow-[0_4px_12px_rgba(0,0,0,0.5),inset_0_1px_1px_rgba(255,255,255,0.1)]"
                      }`}
                    >
                      {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4 text-white/80" />}
                      <span>{isMuted ? "UNMUTE" : "MUTE"}</span>
                    </button>

                    <button
                      type="button"
                      onClick={togglePlay}
                      aria-label={isPlaying ? "Pause radio" : "Play radio"}
                      className="relative w-17 h-17 md:w-20 md:h-20 rounded-full bg-[radial-gradient(circle_at_35%_35%,#FFF3B8_0%,#F5C842_45%,#C99318_80%,#7C5808_100%)] border-2 border-[#FFECA8]/70 shadow-[0_0_32px_rgba(245,200,66,0.6),0_4px_16px_rgba(0,0,0,0.6)] hover:shadow-[0_0_45px_rgba(245,200,66,0.85)] flex items-center justify-center cursor-pointer active:scale-95 transition-all"
                    >
                      {isPlaying && (
                        <span className="absolute -inset-2.5 md:-inset-3 rounded-full border-2 border-[#F5C842] animate-ping motion-reduce:animate-none pointer-events-none opacity-60" />
                      )}
                      {isPlaying ? (
                        <Pause className="w-7 h-7 md:w-8 md:h-8 text-[#16181D] fill-[#16181D] drop-shadow-[0_1px_1px_rgba(255,255,255,0.3)]" />
                      ) : (
                        <Play className="w-7 h-7 md:w-8 md:h-8 text-[#16181D] fill-[#16181D] ml-0.5 drop-shadow-[0_1px_1px_rgba(255,255,255,0.3)]" />
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => setShowShareModal(true)}
                      aria-label="Share GOODLIFE Radio"
                      className="px-5 py-2.5 rounded-none bg-gradient-to-b from-[#222630] to-[#16181F] border border-white/10 hover:border-white/20 text-white/90 font-mono text-xs font-bold uppercase flex items-center justify-center gap-2 cursor-pointer transition-all min-h-[44px] min-w-[100px] shadow-[0_4px_12px_rgba(0,0,0,0.5),inset_0_1px_1px_rgba(255,255,255,0.1)]"
                    >
                      <Share2 className="w-4 h-4 text-white/80" />
                      <span>SHARE</span>
                    </button>
                  </div>

                  <div className="font-mono text-[10px] text-neutral-400 uppercase tracking-widest text-center">
                    {isPlaying ? "LIVE STREAM ACTIVE · LOW-LATENCY STEREO" : "STATION STANDBY · PRESS PLAY TO STREAM"}
                  </div>
                </div>

                {/* Booth Shoutout Teaser & Fast Access (Tablet/Desktop Only) */}
                <div className="hidden md:flex items-center justify-between gap-4 p-4 bg-[#14171E] border border-white/[0.08] shadow-lg shrink-0">
                  <div className="min-w-0">
                    <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-[#DFBB7D] block">
                      INTERACTIVE DJ BOOTH
                    </span>
                    <p className="text-xs text-neutral-300 font-medium truncate mt-0.5">
                      Send a shoutout, request a track, or participate in live stage polls.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab("chat")}
                    className="px-4 py-2 bg-gradient-to-b from-[#242832] to-[#171A21] hover:border-[#DFBB7D]/50 text-white border border-white/10 rounded-none font-mono text-xs font-bold uppercase flex items-center gap-2 shrink-0 cursor-pointer transition-all shadow-md"
                  >
                    <MessageSquare className="w-3.5 h-3.5 text-[#DFBB7D]" />
                    <span>OPEN BOOTH CHAT</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === "vault" && (
          <div className="flex-1 overflow-y-auto p-3.5 md:p-6 md:max-w-6xl md:mx-auto w-full space-y-6">
            <FestivalSetVault />
            <CatchUpVault />
          </div>
        )}

        {activeTab === "chat" && (
          <div className="flex-1 overflow-y-auto p-3.5 md:p-6 md:max-w-7xl md:mx-auto w-full">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              <div className="lg:col-span-7">
                <ShoutoutWall
                  isLiveTakeover={isLiveTakeover}
                  presenterName={activePresenterName}
                  presenterId={onAirSlot?.presenter?.id}
                />
              </div>
              <div className="lg:col-span-5 space-y-6">
                <LivePollWidget />
                <LiveContestWidget />
              </div>
            </div>
          </div>
        )}

        {/* Slide-Up Lyrics & Track Info Drawer */}
        {showLyrics && (
          <div className="absolute inset-0 z-30 bg-black/60 backdrop-blur-xs flex items-end md:items-center md:justify-center md:p-6">
            <div className="w-full md:max-w-xl bg-[#181A20] border-t md:border border-white/15 rounded-none p-4 md:p-6 max-h-[68%] md:max-h-[80%] flex flex-col gap-3 shadow-2xl">
              <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
                <div>
                  <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-[#DFBB7D]">
                    TRACK LYRICS &amp; INFO
                  </span>
                  <h3 className="font-sans font-bold text-xl leading-none text-white uppercase mt-0.5">
                    {displayTitle}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowLyrics(false)}
                  className="px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/15 rounded-none font-mono text-xs font-bold text-white uppercase flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>CLOSE</span>
                </button>
              </div>
              <div className="overflow-y-auto space-y-2.5 text-sm font-medium text-white/90 pb-2">
                <p className="font-mono text-xs uppercase text-[#CBD5E1]">
                  {displaySubtitle}
                </p>
                <div className="p-3 bg-white/5 border border-white/10 rounded-none font-mono text-xs leading-relaxed text-[#CBD5E1]">
                  {isLiveTakeover
                    ? "Live DJ takeover in progress — synced lyrics pause during live booth mixes."
                    : engineState === "live" || isPlaying
                    ? "Synced lyrics will appear automatically here whenever track metadata includes LRC lyrics."
                    : "Press Play to tune in to GOODLIFE Radio 24/7."}
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Bottom 3-Tab Dock (Mobile Only) */}
      <nav
        aria-label="GOODLIFE Radio App Navigation"
        className="bg-[#0B0C0E] border-t border-[#DFBB7D]/25 grid grid-cols-3 shrink-0 pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        {(
          [
            { id: "live", label: "LIVE", Icon: Radio },
            { id: "vault", label: "VAULT", Icon: Disc3 },
            { id: "chat", label: "CHAT", Icon: MessageSquare },
          ] as const
        ).map(({ id, label, Icon }) => {
          const isActive = activeTab === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id)}
              className={`py-3 px-1 flex flex-col items-center justify-center gap-1 font-mono text-[10px] uppercase cursor-pointer transition-all ${
                isActive
                  ? "bg-[#F5C842] text-[#16181D] font-bold shadow-lg"
                  : "text-[#CBD5E1]/80 hover:text-white hover:bg-white/[0.04] font-medium"
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? "text-[#16181D]" : "text-[#CBD5E1]"}`} />
              <span>{label}</span>
            </button>
          );
        })}
      </nav>

      <ShareStationModal
        isOpen={showShareModal}
        onClose={() => setShowShareModal(false)}
        title={title}
        artist={activePresenterName}
      />

      <RadioPwaTimetableDrawer
        isOpen={showSchedule}
        onClose={() => setShowSchedule(false)}
      />
    </div>
  );
}
