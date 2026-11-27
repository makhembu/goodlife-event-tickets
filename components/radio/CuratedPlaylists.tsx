"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Play,
  Pause,
  Disc3,
  Clock,
  Music2,
  Radio,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Share2,
  Check,
} from "lucide-react";
import { useRadio } from "@/context/RadioContext";
import { resolveCoverArt, formatTrackTitle } from "@/lib/radio/media-helpers";

export interface PublicPlaylistSummary {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  genre: string | null;
  cover_url: string | null;
  is_broadcast_active: boolean;
  track_count: number;
  total_duration_sec: number;
}

export interface PlaylistTrackDetail {
  position: number;
  id: number;
  event_id: number;
  title: string;
  dj_name: string;
  audio_url: string;
  audio_high_url: string | null;
  cover_url: string | null;
  duration: string;
  duration_sec: number;
  genre: string | null;
  bitrate: number;
}

function formatDurationHhMm(totalSec: number): string {
  if (!totalSec || isNaN(totalSec) || totalSec <= 0) return "0 min";
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes} min`;
}

function formatTrackTime(sec: number): string {
  if (!sec || isNaN(sec) || sec <= 0) return "0:00";
  const mins = Math.floor(sec / 60);
  const secs = Math.floor(sec % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

const DEFAULT_COVER = "/radio-pass-3d.png";
const INITIAL_TRACK_LIMIT = 25;

export default function CuratedPlaylists() {
  const {
    isLive,
    isPlaying,
    activePlaylist,
    currentTime,
    duration,
    progress,
    playPlaylist,
    togglePlay,
    seek,
    snapToBroadcast,
  } = useRadio();

  const [playlists, setPlaylists] = useState<PublicPlaylistSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Tracklist drawer / expanded state keyed by playlist id
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [expandedTracks, setExpandedTracks] = useState<Record<number, PlaylistTrackDetail[]>>({});
  const [loadingTracks, setLoadingTracks] = useState<Record<number, boolean>>({});
  const [visibleCounts, setVisibleCounts] = useState<Record<number, number>>({});

  // Share link feedback
  const [copiedId, setCopiedId] = useState<number | null>(null);

  const loadPlaylists = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/radio/playlists");
      if (!res.ok) throw new Error("Failed to load curated playlists");
      const data = await res.json();
      if (data.success && Array.isArray(data.playlists)) {
        setPlaylists(data.playlists);
        // Do NOT auto-expand on load to prevent massive DOM freezes (e.g. 771 tracks in playlist #1)
      } else {
        setPlaylists([]);
      }
    } catch (err: any) {
      console.warn("[CuratedPlaylists] fetch error:", err);
      setError(err.message || "Failed to load playlists");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPlaylists();
  }, [loadPlaylists]);

  // Fetch tracks for expanded playlist on demand
  useEffect(() => {
    if (!expandedId) return;
    if (expandedTracks[expandedId]) return; // already loaded

    let isSubscribed = true;
    async function loadTracksForPlaylist(id: number) {
      setLoadingTracks((prev) => ({ ...prev, [id]: true }));
      try {
        const res = await fetch(`/api/radio/playlists/${id}`);
        if (!res.ok) throw new Error("Failed to load tracks");
        const data = await res.json();
        if (isSubscribed && data.success && Array.isArray(data.tracks)) {
          setExpandedTracks((prev) => ({ ...prev, [id]: data.tracks }));
        }
      } catch (err) {
        console.warn(`[CuratedPlaylists] failed to load tracks for playlist ${id}:`, err);
      } finally {
        if (isSubscribed) {
          setLoadingTracks((prev) => ({ ...prev, [id]: false }));
        }
      }
    }

    loadTracksForPlaylist(expandedId);
    return () => {
      isSubscribed = false;
    };
  }, [expandedId, expandedTracks]);

  const toggleExpand = (id: number) => {
    setExpandedId((prev) => {
      const next = prev === id ? null : id;
      if (next !== null) {
        setTimeout(() => {
          const el = document.getElementById(`playlist-${next}`);
          if (el) {
            el.scrollIntoView({ behavior: "smooth", block: "nearest" });
          }
        }, 120);
      }
      return next;
    });
  };

  const handlePlayOrTogglePlaylist = async (playlistId: number, startTrackIndex = 0) => {
    const isThisActive = activePlaylist?.id === playlistId && !isLive;
    if (isThisActive && startTrackIndex === activePlaylist.trackIndex) {
      togglePlay();
    } else {
      await playPlaylist(playlistId, startTrackIndex);
    }
  };

  const handleSharePlaylist = (playlist: PublicPlaylistSummary, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const url = `${window.location.origin}/radio#playlist-${playlist.id}`;
      navigator.clipboard.writeText(url);
      setCopiedId(playlist.id);
      setTimeout(() => setCopiedId(null), 2500);
    } catch {}
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const percent = parseFloat(e.target.value);
    seek(percent);
  };

  if (loading) {
    return (
      <div className="p-10 border border-white/[0.08] bg-[#13151C] shadow-2xl text-center space-y-3">
        <Disc3 className="w-10 h-10 mx-auto animate-spin text-[#DFBB7D]" />
        <p className="font-mono text-xs uppercase tracking-widest text-neutral-400">
          Loading Curated Festival Tapes...
        </p>
      </div>
    );
  }

  if (error && playlists.length === 0) {
    return (
      <div className="p-8 border border-red-500/30 bg-[#161214] shadow-2xl text-center space-y-4">
        <p className="font-mono text-sm text-red-400 uppercase font-bold">{error}</p>
        <button
          type="button"
          onClick={loadPlaylists}
          className="px-4 py-2 bg-[#E84855] text-white font-mono text-xs font-bold uppercase border border-white/20 shadow-sm cursor-pointer hover:bg-[#d43f4c] transition-colors"
        >
          RETRY LOADING
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5 text-[#FBF9F6]">
      {/* Top Banner & Control Deck */}
      <div className="p-4 sm:p-5 border border-white/[0.08] bg-[#13151C] shadow-2xl rounded-none flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#DFBB7D] animate-pulse" />
            <h2 className="font-sans font-bold text-xl sm:text-2xl uppercase tracking-wide text-white">
              CURATED TAPES &amp; PLAYLISTS
            </h2>
          </div>
          <p className="font-mono text-xs text-neutral-400">
            Handpicked soundclashes, amapiano marathon tapes, and Nairobi sound selections ready for on-demand listening.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {!isLive && (
            <button
              type="button"
              onClick={snapToBroadcast}
              className="px-3.5 py-1.5 font-mono text-xs font-bold uppercase bg-[#E84855] hover:bg-[#d63c49] text-white flex items-center gap-1.5 border border-white/20 shadow-sm transition-all cursor-pointer active:scale-95"
            >
              <Radio className="w-3.5 h-3.5" />
              <span>RETURN TO LIVE ON AIR</span>
            </button>
          )}
          <span className="font-mono text-xs font-bold px-3 py-1 border border-[#DFBB7D]/40 bg-[#1C2028] text-[#DFBB7D] uppercase">
            {playlists.length} Curated Tapes
          </span>
        </div>
      </div>

      {/* Active On-Demand Playlist Audio Player Banner */}
      {activePlaylist && !isLive && (
        <div className="p-4 sm:p-5 border border-[#DFBB7D]/40 bg-[#181A22] text-[#FBF9F6] shadow-2xl rounded-none space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#DFBB7D] animate-ping motion-reduce:animate-none" />
              <span className="font-mono text-xs font-black text-[#DFBB7D] tracking-widest uppercase">
                ON-DEMAND PLAYLIST PLAYBACK
              </span>
              <span className="text-white/40">•</span>
              <span className="font-mono text-xs text-white/90 uppercase font-bold">
                {activePlaylist.name}
              </span>
            </div>

            <div className="font-mono text-xs text-neutral-400">
              TRACK {activePlaylist.trackIndex + 1} OF {activePlaylist.tracks.length}
            </div>
          </div>

          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0 flex items-center gap-3">
              <div className="w-12 h-12 rounded-none border border-[#DFBB7D]/50 bg-neutral-900 overflow-hidden shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={resolveCoverArt(activePlaylist.tracks[activePlaylist.trackIndex]?.cover_url || activePlaylist.cover_url)}
                  alt=""
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).src = DEFAULT_COVER;
                  }}
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="min-w-0">
                <h4 className="font-sans text-base sm:text-lg font-bold uppercase truncate text-white">
                  {formatTrackTitle(activePlaylist.tracks[activePlaylist.trackIndex]?.title)}
                </h4>
                <p className="font-mono text-xs text-[#DFBB7D] uppercase truncate">
                  {activePlaylist.tracks[activePlaylist.trackIndex]?.dj_name || activePlaylist.name}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={togglePlay}
              className="w-12 h-12 border border-white/20 bg-[#DFBB7D] text-[#0D0F12] flex items-center justify-center font-black shrink-0 hover:bg-[#edd39d] transition-colors cursor-pointer shadow-md"
              aria-label={isPlaying ? "Pause track" : "Play track"}
            >
              {isPlaying ? (
                <Pause className="w-6 h-6 fill-current" />
              ) : (
                <Play className="w-6 h-6 fill-current ml-0.5" />
              )}
            </button>
          </div>

          {/* Interactive Scrubber Bar */}
          <div className="space-y-1">
            <input
              type="range"
              min="0"
              max="100"
              step="0.1"
              value={progress}
              onChange={handleSeek}
              className="w-full h-2 bg-white/15 accent-[#DFBB7D] cursor-pointer rounded"
            />
            <div className="flex justify-between font-mono text-xs text-neutral-400">
              <span>{formatTrackTime(currentTime)}</span>
              <span>{formatTrackTime(duration)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Playlist Grid */}
      {playlists.length === 0 ? (
        <div className="py-16 border border-dashed border-white/20 bg-[#13151C] text-center font-mono text-xs text-neutral-400 uppercase tracking-widest rounded-none">
          No public curated playlists published yet. New festival tapes arriving soon!
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5">
          {playlists.map((pl) => {
            const isThisPlaylistPlaying = !isLive && isPlaying && activePlaylist?.id === pl.id;
            const isThisPlaylistLoaded = !isLive && activePlaylist?.id === pl.id;
            const isExpanded = expandedId === pl.id;
            const tracks = expandedTracks[pl.id] || [];
            const isLoadingThisTracks = loadingTracks[pl.id] || false;
            const visibleCount = visibleCounts[pl.id] || INITIAL_TRACK_LIMIT;
            const visibleTracks = tracks.slice(0, visibleCount);

            return (
              <div
                key={pl.id}
                id={`playlist-${pl.id}`}
                className={`border rounded-none overflow-hidden transition-all bg-[#14171E] ${
                  isThisPlaylistLoaded
                    ? "border-[#DFBB7D] ring-2 ring-[#DFBB7D]/40"
                    : "border-white/[0.08] shadow-xl hover:border-white/20"
                }`}
              >
                {/* Playlist Card Header Bar */}
                <div className="p-4 sm:p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 bg-[#181C26]/70 border-b border-white/[0.08]">
                  <div className="flex items-start sm:items-center gap-4 min-w-0">
                    {/* Cover Art Thumbnail */}
                    <div className="relative w-20 h-20 sm:w-24 sm:h-24 rounded-none border border-white/10 bg-[#0D0F12] overflow-hidden shrink-0 shadow-md">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={resolveCoverArt(pl.cover_url)}
                        alt={pl.name}
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).src = DEFAULT_COVER;
                        }}
                        className="w-full h-full object-cover"
                      />
                      {pl.is_broadcast_active && (
                        <div className="absolute top-1 left-1 bg-[#E84855] text-white font-mono text-[10px] font-black px-1.5 py-0.5 uppercase tracking-widest border border-white/20 flex items-center gap-1 shadow-sm">
                          <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse motion-reduce:animate-none" />
                          <span>ON AIR</span>
                        </div>
                      )}
                    </div>

                    {/* Metadata */}
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        {pl.genre && (
                          <span className="px-2 py-0.5 border border-white/10 bg-[#1C2028] font-mono text-[10px] font-bold uppercase text-[#DFBB7D]">
                            {pl.genre}
                          </span>
                        )}
                        {pl.is_broadcast_active && (
                          <span className="px-2 py-0.5 border border-[#E84855]/50 bg-[#E84855]/15 text-[#E84855] font-mono text-[10px] font-bold uppercase flex items-center gap-1">
                            <Radio className="w-3 h-3" />
                            LIVE ON 24/7 BROADCAST
                          </span>
                        )}
                      </div>

                      <h3 className="font-sans text-lg sm:text-xl font-bold uppercase text-white leading-tight truncate">
                        {pl.name}
                      </h3>

                      {pl.description && (
                        <p className="font-mono text-xs text-neutral-400 line-clamp-2">
                          {pl.description}
                        </p>
                      )}

                      <div className="flex flex-wrap items-center gap-3 pt-1 font-mono text-xs text-neutral-400 font-semibold">
                        <span className="flex items-center gap-1 text-[#DFBB7D]/90">
                          <Music2 className="w-3.5 h-3.5" />
                          {pl.track_count} TRACKS
                        </span>
                        <span>•</span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" />
                          {formatDurationHhMm(pl.total_duration_sec)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Actions Right */}
                  <div className="flex flex-wrap sm:flex-nowrap items-center gap-2.5 w-full md:w-auto shrink-0">
                    <button
                      type="button"
                      onClick={() => handlePlayOrTogglePlaylist(pl.id, 0)}
                      className={`flex-1 sm:flex-none px-4 py-2.5 font-mono text-xs font-bold uppercase border shadow-sm flex items-center justify-center gap-2 transition-all cursor-pointer active:scale-95 ${
                        isThisPlaylistPlaying
                          ? "bg-[#DFBB7D] text-[#0D0F12] border-[#DFBB7D]"
                          : "bg-gradient-to-b from-[#242832] to-[#171A21] text-white border-white/15 hover:border-white/30"
                      }`}
                    >
                      {isThisPlaylistPlaying ? (
                        <>
                          <Pause className="w-4 h-4 fill-current" />
                          <span>PAUSE TAPE</span>
                        </>
                      ) : (
                        <>
                          <Play className="w-4 h-4 fill-current ml-0.5" />
                          <span>{isThisPlaylistLoaded ? "RESUME TAPE" : "PLAY TAPE"}</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => toggleExpand(pl.id)}
                      className="px-3.5 py-2.5 bg-[#1C2028] hover:bg-[#252B36] text-white font-mono text-xs font-bold uppercase border border-white/10 flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                      aria-label={isExpanded ? "Collapse tracklist" : "View tracklist"}
                    >
                      <span>TRACKS</span>
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4 text-[#DFBB7D]" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-neutral-400" />
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={(e) => handleSharePlaylist(pl, e)}
                      className="p-2.5 bg-[#1C2028] hover:bg-[#252B36] text-neutral-300 hover:text-white border border-white/10 transition-colors cursor-pointer"
                      title="Share Playlist Link"
                      aria-label="Share Playlist Link"
                    >
                      {copiedId === pl.id ? (
                        <Check className="w-4 h-4 text-emerald-400" />
                      ) : (
                        <Share2 className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Expanded Tracklist Table / Drawer */}
                {isExpanded && (
                  <div className="p-4 sm:p-5 bg-[#0E1015] border-t border-white/[0.08] space-y-3">
                    <div className="flex items-center justify-between border-b border-white/[0.08] pb-2">
                      <span className="font-mono text-xs font-bold uppercase text-[#DFBB7D] tracking-wider">
                        ORDERED TRACKLIST ({pl.track_count} SONGS)
                      </span>
                      <span className="font-mono text-[11px] text-neutral-400">
                        Tap any song to play from that moment
                      </span>
                    </div>

                    {isLoadingThisTracks && tracks.length === 0 ? (
                      <div className="py-8 text-center space-y-2">
                        <Disc3 className="w-6 h-6 mx-auto animate-spin text-[#DFBB7D]/70" />
                        <p className="font-mono text-xs text-neutral-400 uppercase">
                          Fetching tracklist...
                        </p>
                      </div>
                    ) : tracks.length === 0 ? (
                      <div className="py-6 text-center font-mono text-xs text-neutral-500 uppercase">
                        No tracks added to this playlist yet.
                      </div>
                    ) : (
                      <>
                        <div className="divide-y divide-white/[0.06] max-h-[460px] overflow-y-auto pr-1">
                          {visibleTracks.map((track, idx) => {
                            const isCurrentPlayingTrack =
                              isThisPlaylistLoaded &&
                              activePlaylist?.trackIndex === idx &&
                              isPlaying;
                            const isCurrentLoadedTrack =
                              isThisPlaylistLoaded && activePlaylist?.trackIndex === idx;

                            const displayNumber =
                              track.position !== undefined && track.position !== null
                                ? track.position + 1
                                : idx + 1;

                            return (
                              <div
                                key={track.id}
                                onClick={() => handlePlayOrTogglePlaylist(pl.id, idx)}
                                className={`py-2.5 px-2 flex items-center justify-between gap-3 rounded cursor-pointer transition-colors group ${
                                  isCurrentLoadedTrack
                                    ? "bg-[#DFBB7D]/10 border-l-2 border-[#DFBB7D]"
                                    : "hover:bg-white/[0.04]"
                                }`}
                              >
                                <div className="flex items-center gap-3 min-w-0">
                                  {/* Track Position Number / Play Icon */}
                                  <div className="w-8 flex items-center justify-center shrink-0">
                                    {isCurrentPlayingTrack ? (
                                      <div className="flex items-end gap-0.5 h-4">
                                        <span className="w-0.5 h-3 bg-[#DFBB7D] animate-pulse" />
                                        <span className="w-0.5 h-4 bg-[#DFBB7D] animate-pulse delay-75" />
                                        <span className="w-0.5 h-2 bg-[#DFBB7D] animate-pulse delay-150" />
                                      </div>
                                    ) : (
                                      <span className="font-mono text-xs font-bold text-neutral-400 group-hover:hidden">
                                        {displayNumber}
                                      </span>
                                    )}
                                    <Play className="w-3.5 h-3.5 fill-[#DFBB7D] text-[#DFBB7D] hidden group-hover:block ml-0.5" />
                                  </div>

                                  {/* Track Cover Thumbnail */}
                                  <div className="w-9 h-9 rounded border border-white/10 overflow-hidden bg-[#13151C] shrink-0">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                      src={resolveCoverArt(track.cover_url || pl.cover_url)}
                                      alt=""
                                      onError={(e) => {
                                        (e.currentTarget as HTMLImageElement).src = DEFAULT_COVER;
                                      }}
                                      className="w-full h-full object-cover"
                                    />
                                  </div>

                                  {/* Title & Artist */}
                                  <div className="min-w-0">
                                    <p
                                      className={`text-xs sm:text-sm font-bold uppercase truncate leading-tight ${
                                        isCurrentLoadedTrack
                                          ? "text-[#DFBB7D]"
                                          : "text-white"
                                      }`}
                                    >
                                      {formatTrackTitle(track.title)}
                                    </p>
                                    <p className="font-mono text-[11px] text-neutral-400 uppercase truncate mt-0.5">
                                      {track.dj_name}
                                    </p>
                                  </div>
                                </div>

                                {/* Duration & Actions */}
                                <div className="flex items-center gap-3 shrink-0 font-mono text-xs text-neutral-400">
                                  <span>{track.duration || formatTrackTime(track.duration_sec)}</span>
                                  <a
                                    href={`https://open.spotify.com/search/${encodeURIComponent(
                                      `${track.title} ${track.dj_name}`
                                    )}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={(e) => e.stopPropagation()}
                                    className="p-1 hover:text-white transition-colors opacity-0 group-hover:opacity-100"
                                    title="Search on Spotify"
                                    aria-label={`Search ${track.title} on Spotify`}
                                  >
                                    <ExternalLink className="w-3.5 h-3.5" />
                                  </a>
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {/* Chunked Loading for large playlists (e.g. Master Rotation 771 tracks) */}
                        {tracks.length > visibleCount && (
                          <div className="pt-2 text-center border-t border-white/[0.06]">
                            <button
                              type="button"
                              onClick={() =>
                                setVisibleCounts((prev) => ({
                                  ...prev,
                                  [pl.id]: (prev[pl.id] || INITIAL_TRACK_LIMIT) + 50,
                                }))
                              }
                              className="px-4 py-2 bg-[#1C2028] hover:bg-[#252B36] border border-white/10 text-[#DFBB7D] font-mono text-xs font-bold uppercase transition-colors cursor-pointer shadow-sm"
                            >
                              Load More Tracks ({tracks.length - visibleCount} remaining)
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
