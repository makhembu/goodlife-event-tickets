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
    <div className="h-[100dvh] w-full bg-[#0D0F12] text-[#FBF9F6] flex flex-col overflow-hidden select-none">
      {/* App-Only Top Bar */}
      <header className="bg-[#14161C] text-[#FBF9F6] px-4 py-3 border-b border-white/10 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2 font-mono text-xs font-bold tracking-widest uppercase">
          <span
            className={`w-2.5 h-2.5 rounded-full ${
              isPlaying ? "bg-[#E84855] animate-pulse motion-reduce:animate-none" : "bg-white/40"
            }`}
          />
          <span>{isPlaying ? "ON AIR · 254 FM" : "STANDBY · 254 FM"}</span>
        </div>
        <button
          type="button"
          onClick={() => setShowSchedule(true)}
          className="px-3 py-1.5 rounded-full bg-white/5 hover:bg-white/10 text-[#F5C842] border border-[#F5C842]/40 font-mono text-[10px] font-bold tracking-wider uppercase flex items-center gap-1.5 cursor-pointer transition-colors"
        >
          <Calendar className="w-3.5 h-3.5" />
          <span>SCHEDULE</span>
        </button>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 min-h-0 flex flex-col relative">
        {activeTab === "live" && (
          <div className="flex-1 min-h-0 p-3.5 flex flex-col gap-2.5">
            {/* Conditional Return to Live banner (only when playing Playlist or Vault) */}
            {!isLive && (
              <div className="bg-[#181A20] text-[#FBF9F6] border border-white/15 rounded-xl px-3.5 py-2 flex items-center justify-between gap-2 shrink-0">
                <span className="font-mono text-[11px] font-bold uppercase truncate text-[#CBD5E1]">
                  {activePlaylist ? `PLAYING: ${activePlaylist.name}` : "PLAYING VAULT SET"}
                </span>
                <button
                  type="button"
                  onClick={snapToBroadcast}
                  className="px-2.5 py-1 bg-[#E84855] text-white font-mono text-[10px] font-bold uppercase rounded-lg border border-white/20 flex items-center gap-1 shrink-0 cursor-pointer hover:bg-[#d63c49] transition-colors"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>RETURN TO LIVE</span>
                </button>
              </div>
            )}

            {/* Flex Cover Art Box: Centered 3D VIP Pass on fallback, clean artwork when available */}
            <div className="relative flex-1 min-h-[175px] border border-white/10 rounded-2xl shadow-2xl overflow-hidden bg-[#14161C] flex flex-col justify-between items-center p-4">
              {isDefaultPass ? (
                <>
                  <span
                    className={`relative z-10 px-3.5 py-1 rounded-full border font-mono text-[10px] font-bold uppercase tracking-wider text-center ${
                      isLiveTakeover
                        ? "bg-[#E84855]/90 border-[#E84855] text-white"
                        : !isLive
                        ? "bg-[#DFBB7D]/15 border-[#DFBB7D]/40 text-[#DFBB7D]"
                        : "bg-white/5 border-white/15 text-[#DFBB7D]"
                    }`}
                  >
                    {statusTag}
                  </span>

                  <div className="relative z-10 w-full flex-1 flex items-center justify-center py-1">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={resolvedCover}
                      alt={displayTitle}
                      onError={() => setCoverError(true)}
                      className="max-h-[220px] max-w-[85%] object-contain mx-auto rounded-xl drop-shadow-[0_12px_24px_rgba(0,0,0,0.65)]"
                    />
                  </div>

                  <span className="relative z-10 font-mono text-[11px] font-bold uppercase tracking-widest text-[#F5C842] text-center drop-shadow">
                    {onAirSlot?.show?.title || "GOODLIFE RADIO 254"}
                  </span>
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
                  <span
                    className={`relative z-10 self-center px-3.5 py-1 rounded-full border font-mono text-[10px] font-bold uppercase tracking-wider ${
                      isLiveTakeover
                        ? "bg-[#E84855] border-[#E84855] text-white"
                        : !isLive
                        ? "bg-[#DFBB7D] border-[#DFBB7D] text-[#16181D]"
                        : "bg-[#F5C842] border-[#F5C842] text-[#16181D]"
                    }`}
                  >
                    {statusTag}
                  </span>
                  <span className="relative z-10 font-mono text-[11px] font-bold uppercase tracking-widest text-[#F5C842] text-center drop-shadow">
                    {onAirSlot?.show?.title || "GOODLIFE RADIO 254"}
                  </span>
                </>
              )}
            </div>

            {/* Track Info + Ribbon Soundwave Visualizer */}
            <div className="bg-[#181A20] border border-white/10 rounded-2xl shadow-lg px-4 py-3 shrink-0">
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-sans font-bold text-xl leading-tight tracking-wide text-white uppercase truncate">
                  {displayTitle}
                </h2>
                <button
                  type="button"
                  onClick={() => setShowLyrics(true)}
                  className="px-3 py-1 bg-white/5 hover:bg-white/10 text-white/90 border border-white/15 rounded-full font-mono text-[11px] font-bold uppercase flex items-center gap-1.5 shrink-0 cursor-pointer transition-colors"
                >
                  <Music2 className="w-3.5 h-3.5" />
                  <span>LYRICS</span>
                </button>
              </div>
              <p className="text-xs font-semibold text-[#CBD5E1] truncate mt-1">
                {displaySubtitle}
              </p>
              <RadioRibbonVisualizer
                isPlaying={isPlaying}
                isMuted={isMuted}
                volume={volume}
                isDropPlaying={isDropPlaying}
                getAudioElement={getActiveAudioElement}
              />
            </div>

            {/* Balanced 3-Button Transport Controls (with >=44px touch floor) */}
            <div className="flex items-center justify-center gap-6 py-2 shrink-0">
              <button
                type="button"
                onClick={toggleMute}
                aria-label={isMuted ? "Unmute radio" : "Mute radio"}
                className={`px-4 py-2.5 rounded-full border font-mono text-xs font-bold uppercase flex items-center justify-center gap-2 cursor-pointer transition-all min-h-[44px] min-w-[90px] ${
                  isMuted
                    ? "bg-[#E84855] border-[#E84855] text-white shadow-lg"
                    : "bg-white/5 hover:bg-white/10 border-white/15 text-white shadow-sm"
                }`}
              >
                {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4 text-[#DFBB7D]" />}
                <span>{isMuted ? "UNMUTE" : "MUTE"}</span>
              </button>

              <button
                type="button"
                onClick={togglePlay}
                aria-label={isPlaying ? "Pause radio" : "Play radio"}
                className="relative w-16 h-16 rounded-full bg-gradient-to-tr from-[#E6B800] via-[#F5C842] to-[#FFE27D] text-[#16181D] shadow-[0_0_24px_rgba(245,200,66,0.5)] hover:shadow-[0_0_32px_rgba(245,200,66,0.7)] flex items-center justify-center cursor-pointer active:scale-95 transition-all"
              >
                {isPlaying && (
                  <span className="absolute -inset-2.5 rounded-full border-2 border-[#F5C842] animate-ping motion-reduce:animate-none pointer-events-none opacity-60" />
                )}
                {isPlaying ? (
                  <Pause className="w-7 h-7 text-[#16181D] fill-[#16181D]" />
                ) : (
                  <Play className="w-7 h-7 text-[#16181D] fill-[#16181D] ml-0.5" />
                )}
              </button>

              <button
                type="button"
                onClick={() => setShowShareModal(true)}
                aria-label="Share GOODLIFE Radio"
                className="px-4 py-2.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/15 text-white font-mono text-xs font-bold uppercase flex items-center justify-center gap-2 cursor-pointer transition-all min-h-[44px] min-w-[90px] shadow-sm"
              >
                <Share2 className="w-4 h-4 text-[#DFBB7D]" />
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
          <div className="absolute inset-0 z-30 bg-black/60 backdrop-blur-xs flex items-end">
            <div className="w-full bg-[#181A20] border-t border-white/15 rounded-t-2xl p-4 max-h-[68%] flex flex-col gap-3 shadow-2xl">
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
                  className="px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/15 rounded-lg font-mono text-xs font-bold text-white uppercase flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>CLOSE</span>
                </button>
              </div>
              <div className="overflow-y-auto space-y-2.5 text-sm font-medium text-white/90 pb-2">
                <p className="font-mono text-xs uppercase text-[#CBD5E1]">
                  {displaySubtitle}
                </p>
                <div className="p-3 bg-white/5 border border-white/10 rounded-xl font-mono text-xs leading-relaxed text-[#CBD5E1]">
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
        className="bg-[#0D0F12] border-t border-white/10 grid grid-cols-4 shrink-0 pb-[env(safe-area-inset-bottom)] p-1.5 gap-1"
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
              className={`py-2 px-1 flex flex-col items-center justify-center gap-1 font-mono text-[10px] font-bold uppercase rounded-xl cursor-pointer transition-all ${
                isActive
                  ? "bg-[#F5C842] text-[#16181D] shadow-md"
                  : "text-[#CBD5E1] hover:text-white hover:bg-white/5"
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

      <RadioPwaTimetableDrawer
        isOpen={showSchedule}
        onClose={() => setShowSchedule(false)}
      />
    </div>
  );
}
