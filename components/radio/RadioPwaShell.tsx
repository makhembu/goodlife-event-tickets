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
  ListMusic,
  MessageSquare,
  X,
  RotateCcw,
} from "lucide-react";
import { useRadio } from "@/context/RadioContext";
import {
  resolveCoverArt,
  resolveFallbackCoverArt,
  formatTrackTitle,
} from "@/lib/radio/media-helpers";
import RadioRibbonVisualizer from "@/components/radio/RadioRibbonVisualizer";
import CuratedPlaylists from "@/components/radio/CuratedPlaylists";
import FestivalSetVault from "@/components/radio/FestivalSetVault";
import CatchUpVault from "@/components/radio/CatchUpVault";
import ShoutoutWall from "@/components/radio/ShoutoutWall";
import LivePollWidget from "@/components/radio/LivePollWidget";
import LiveContestWidget from "@/components/radio/LiveContestWidget";
import ShareStationModal from "@/components/radio/ShareStationModal";

type PwaTab = "live" | "playlists" | "vault" | "chat";

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
  } = useRadio();

  const [activeTab, setActiveTab] = useState<PwaTab>("live");
  const [showLyrics, setShowLyrics] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [coverError, setCoverError] = useState(false);

  // Honor ?tab= from manifest app shortcuts
  useEffect(() => {
    if (typeof window === "undefined") return;
    const param = new URLSearchParams(window.location.search).get("tab");
    if (param === "live" || param === "playlists" || param === "vault" || param === "chat") {
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
    if (coverUrl) return resolveCoverArt(coverUrl);
    return "/flyer.png";
  }, [coverUrl, coverError]);

  const statusTag = useMemo(() => {
    if (isLiveTakeover) return "LIVE DJ TAKEOVER";
    if (activePlaylist && !isLive) {
      return `PLAYLIST · TRACK ${activePlaylist.trackIndex + 1}/${activePlaylist.tracks.length}`;
    }
    if (!isLive) return "VAULT · ON-DEMAND";
    return "GOODLIFE RADIO · 24/7";
  }, [isLiveTakeover, activePlaylist, isLive]);

  return (
    <div className="h-[100dvh] w-full bg-[#F3ECE1] text-[#16181D] flex flex-col overflow-hidden select-none">
      {/* App-Only Top Bar */}
      <header className="bg-[#16181D] text-[#FBF9F6] px-4 py-3 border-b-4 border-[#16181D] flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2 font-mono text-xs font-bold tracking-widest uppercase">
          <span
            className={`w-2.5 h-2.5 rounded-full ${
              isPlaying ? "bg-[#E84855] animate-pulse motion-reduce:animate-none" : "bg-white/40"
            }`}
          />
          <span>{isPlaying ? "ON AIR · 254 FM" : "STANDBY · 254 FM"}</span>
        </div>
        <span className="font-mono text-[11px] font-bold tracking-wider uppercase text-[#F5C842]">
          GOODLIFE RADIO
        </span>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 min-h-0 flex flex-col relative">
        {activeTab === "live" && (
          <div className="flex-1 min-h-0 p-3.5 flex flex-col gap-2.5">
            {/* Conditional Return to Live banner (only when playing Playlist or Vault) */}
            {!isLive && (
              <div className="bg-[#16181D] text-[#FBF9F6] border-3 border-[#16181D] px-3 py-1.5 flex items-center justify-between gap-2 shrink-0">
                <span className="font-mono text-[11px] font-bold uppercase truncate">
                  {activePlaylist ? `PLAYING: ${activePlaylist.name}` : "PLAYING VAULT SET"}
                </span>
                <button
                  type="button"
                  onClick={snapToBroadcast}
                  className="px-2.5 py-1 bg-[#E84855] text-white font-mono text-[10px] font-bold uppercase border border-white/20 flex items-center gap-1 shrink-0 cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>RETURN TO LIVE</span>
                </button>
              </div>
            )}

            {/* Flex Cover Art Box (absorbs available height cleanly with zero gap) */}
            <div className="relative flex-1 min-h-[165px] border-4 border-[#16181D] shadow-[4px_4px_0_#16181D] overflow-hidden bg-[#16181D] flex flex-col justify-between p-3.5">
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
                    "linear-gradient(to top, rgba(22,24,29,0.9) 0%, rgba(22,24,29,0.2) 58%, rgba(22,24,29,0.4) 100%)",
                }}
              />
              <span
                className={`relative z-10 self-start px-2.5 py-1 border-2 border-[#16181D] font-mono text-[10px] font-bold uppercase tracking-wider ${
                  isLiveTakeover
                    ? "bg-[#E84855] text-white"
                    : !isLive
                    ? "bg-[#DFBB7D] text-[#16181D]"
                    : "bg-[#F5C842] text-[#16181D]"
                }`}
              >
                {statusTag}
              </span>
              <h1 className="relative z-10 font-display text-3xl sm:text-4xl leading-[0.95] tracking-wide uppercase text-[#FBF9F6] line-clamp-2">
                {displayTitle}
              </h1>
            </div>

            {/* Track Info + Ribbon Soundwave Visualizer */}
            <div className="bg-[#FBF9F6] border-4 border-[#16181D] shadow-[4px_4px_0_#16181D] px-3.5 py-3 shrink-0">
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-display text-2xl leading-none tracking-wide uppercase truncate">
                  {displayTitle}
                </h2>
                <button
                  type="button"
                  onClick={() => setShowLyrics(true)}
                  className="px-2.5 py-1 bg-[#FBF9F6] hover:bg-[#F5C842] border-2 border-[#16181D] shadow-[2px_2px_0_#16181D] font-mono text-[11px] font-bold uppercase flex items-center gap-1.5 shrink-0 cursor-pointer transition-colors"
                >
                  <Music2 className="w-3.5 h-3.5" />
                  <span>LYRICS</span>
                </button>
              </div>
              <p className="text-xs font-semibold text-[#2A2C33] truncate mt-1">
                {displaySubtitle}
              </p>
              <RadioRibbonVisualizer
                isPlaying={isPlaying}
                isMuted={isMuted}
                volume={volume}
                isDropPlaying={isDropPlaying}
              />
            </div>

            {/* Balanced 3-Button Transport Controls */}
            <div className="flex items-center justify-center gap-5 py-1 shrink-0">
              <button
                type="button"
                onClick={toggleMute}
                aria-label={isMuted ? "Unmute radio" : "Mute radio"}
                className={`px-3.5 py-2.5 border-3 border-[#16181D] shadow-[3px_3px_0_#16181D] font-mono text-xs font-bold uppercase flex items-center gap-1.5 cursor-pointer transition-colors ${
                  isMuted ? "bg-[#E84855] text-white" : "bg-[#FBF9F6] hover:bg-[#DFBB7D]"
                }`}
              >
                {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                <span>{isMuted ? "UNMUTE" : "MUTE"}</span>
              </button>

              <button
                type="button"
                onClick={togglePlay}
                aria-label={isPlaying ? "Pause radio" : "Play radio"}
                className="relative w-15 h-15 rounded-full bg-[#F5C842] border-4 border-[#16181D] shadow-[4px_4px_0_#16181D] flex items-center justify-center cursor-pointer active:translate-x-0.5 active:translate-y-0.5 transition-transform"
              >
                {isPlaying && (
                  <span className="absolute -inset-2.5 rounded-full border-3 border-[#F5C842] animate-ping motion-reduce:animate-none pointer-events-none opacity-75" />
                )}
                {isPlaying ? (
                  <Pause className="w-6 h-6 text-[#16181D] fill-[#16181D]" />
                ) : (
                  <Play className="w-6 h-6 text-[#16181D] fill-[#16181D] ml-0.5" />
                )}
              </button>

              <button
                type="button"
                onClick={() => setShowShareModal(true)}
                aria-label="Share GOODLIFE Radio"
                className="px-3.5 py-2.5 bg-[#FBF9F6] hover:bg-[#DFBB7D] border-3 border-[#16181D] shadow-[3px_3px_0_#16181D] font-mono text-xs font-bold uppercase flex items-center gap-1.5 cursor-pointer transition-colors"
              >
                <Share2 className="w-4 h-4" />
                <span>SHARE</span>
              </button>
            </div>
          </div>
        )}

        {activeTab === "playlists" && (
          <div className="flex-1 overflow-y-auto p-3.5 space-y-4">
            <CuratedPlaylists />
          </div>
        )}

        {activeTab === "vault" && (
          <div className="flex-1 overflow-y-auto p-3.5 space-y-4">
            <FestivalSetVault />
            <CatchUpVault />
          </div>
        )}

        {activeTab === "chat" && (
          <div className="flex-1 overflow-y-auto p-3.5 space-y-4">
            <ShoutoutWall
              isLiveTakeover={isLiveTakeover}
              presenterName={activePresenterName}
              presenterId={onAirSlot?.presenter?.id}
            />
            <LivePollWidget />
            <LiveContestWidget />
          </div>
        )}

        {/* Slide-Up Lyrics & Track Info Drawer */}
        {showLyrics && (
          <div className="absolute inset-0 z-30 bg-[#16181D]/50 flex items-end">
            <div className="w-full bg-[#FBF9F6] border-t-4 border-[#16181D] p-4 max-h-[68%] flex flex-col gap-3">
              <div className="flex items-center justify-between border-b-2 border-[#16181D]/15 pb-2">
                <div>
                  <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-[#7A5A1F]">
                    TRACK LYRICS &amp; INFO
                  </span>
                  <h3 className="font-display text-2xl leading-none uppercase">
                    {displayTitle}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowLyrics(false)}
                  className="px-2.5 py-1.5 bg-[#F3ECE1] border-2 border-[#16181D] font-mono text-xs font-bold uppercase flex items-center gap-1 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>CLOSE</span>
                </button>
              </div>
              <div className="overflow-y-auto space-y-2.5 text-sm font-medium text-[#16181D] pb-2">
                <p className="font-mono text-xs uppercase text-[#2A2C33]">
                  {displaySubtitle}
                </p>
                <div className="p-3 bg-[#F3ECE1] border-2 border-[#16181D] font-mono text-xs leading-relaxed">
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

      {/* Bottom 4-Tab Dock */}
      <nav
        aria-label="GOODLIFE Radio App Navigation"
        className="bg-[#FBF9F6] border-t-4 border-[#16181D] grid grid-cols-4 shrink-0 pb-[env(safe-area-inset-bottom)]"
      >
        {(
          [
            { id: "live", label: "LIVE", Icon: Radio },
            { id: "playlists", label: "PLAYLISTS", Icon: ListMusic },
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
              className={`py-2.5 px-1 flex flex-col items-center justify-center gap-1 font-mono text-[10px] font-bold uppercase border-r-2 last:border-r-0 border-[#16181D] cursor-pointer transition-colors ${
                isActive ? "bg-[#F5C842] text-[#16181D]" : "bg-[#FBF9F6] text-[#16181D] hover:bg-[#F3ECE1]"
              }`}
            >
              <Icon className="w-4 h-4" />
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
    </div>
  );
}
