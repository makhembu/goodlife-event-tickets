"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Play,
  Pause,
  Disc3,
  Clock,
  Music2,
  Radio,
  ChevronDown,
  ChevronUp,
  Sparkles,
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
        // Automatically expand the broadcast playlist or the first playlist if available
        if (data.playlists.length > 0 && expandedId === null) {
          const defaultActive = data.playlists.find((p: PublicPlaylistSummary) => p.is_broadcast_active) || data.playlists[0];
          setExpandedId(defaultActive.id);
        }
      } else {
        setPlaylists([]);
      }
    } catch (err: any) {
      console.warn("[CuratedPlaylists] fetch error:", err);
      setError(err.message || "Failed to load playlists");
    } finally {
      setLoading(false);
    }
  }, [expandedId]);

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
    setExpandedId((prev) => (prev === id ? null : id));
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
      <div className="p-10 border-4 border-brand-navy bg-white shadow-(--shadow-brut-md) text-center space-y-3">
        <Disc3 className="w-10 h-10 mx-auto animate-spin text-brand-navy" />
        <p className="font-mono text-xs uppercase tracking-widest text-brand-navy/70">
          Loading Curated Festival Tapes...
        </p>
      </div>
    );
  }

  if (error && playlists.length === 0) {
    return (
      <div className="p-8 border-4 border-brand-navy bg-brand-off-white shadow-(--shadow-brut-md) text-center space-y-4">
        <p className="font-mono text-sm text-red-600 uppercase font-bold">{error}</p>
        <button
          type="button"
          onClick={loadPlaylists}
          className="px-4 py-2 bg-brand-navy text-white font-mono text-xs font-bold uppercase border-2 border-brand-navy shadow-(--shadow-brut-xs) cursor-pointer"
        >
          RETRY LOADING
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Banner & Control Deck */}
      <div className="p-4 sm:p-5 border-4 border-brand-navy bg-white shadow-(--shadow-brut-md) rounded-xl flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-brand-accent animate-pulse" />
            <h2 className="font-display text-xl sm:text-2xl uppercase tracking-wide text-brand-navy">
              CURATED TAPES &amp; PLAYLISTS
            </h2>
          </div>
          <p className="font-mono text-xs text-brand-navy/70">
            Handpicked soundclashes, amapiano marathon tapes, and Nairobi sound selections ready for on-demand listening.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {!isLive && (
            <button
              type="button"
              onClick={snapToBroadcast}
              className="px-3.5 py-1.5 font-mono text-xs font-bold uppercase bg-red-600 hover:bg-red-700 text-white flex items-center gap-1.5 border-2 border-brand-navy shadow-(--shadow-brut-xs) transition-all cursor-pointer active:scale-95"
            >
              <Radio className="w-3.5 h-3.5" />
              <span>RETURN TO LIVE ON AIR</span>
            </button>
          )}
          <span className="font-mono text-xs font-bold px-2.5 py-1 border-2 border-brand-navy bg-brand-off-white uppercase">
            {playlists.length} Curated Tapes
          </span>
        </div>
      </div>

      {/* Active On-Demand Playlist Audio Player Banner */}
      {activePlaylist && !isLive && (
        <div className="p-4 sm:p-5 border-4 border-brand-navy bg-brand-navy text-brand-off-white shadow-(--shadow-brut-lg) rounded-xl space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/15 pb-3">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-brand-accent animate-ping" />
              <span className="font-mono text-xs font-black text-brand-accent tracking-widest uppercase">
                ON-DEMAND PLAYLIST PLAYBACK
              </span>
              <span className="text-white/40">•</span>
              <span className="font-mono text-xs text-white/80 uppercase font-bold">
                {activePlaylist.name}
              </span>
            </div>

            <div className="font-mono text-xs text-white/60">
              TRACK {activePlaylist.trackIndex + 1} OF {activePlaylist.tracks.length}
            </div>
          </div>

          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0 flex items-center gap-3">
              <div className="w-12 h-12 rounded-lg border-2 border-brand-accent bg-neutral-900 overflow-hidden shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={resolveCoverArt(activePlaylist.tracks[activePlaylist.trackIndex]?.cover_url || activePlaylist.cover_url)}
                  alt=""
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="min-w-0">
                <h4 className="font-display text-base sm:text-lg font-black uppercase truncate text-white">
                  {formatTrackTitle(activePlaylist.tracks[activePlaylist.trackIndex]?.title)}
                </h4>
                <p className="font-mono text-xs text-brand-accent/90 uppercase truncate">
                  {activePlaylist.tracks[activePlaylist.trackIndex]?.dj_name || activePlaylist.name}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={togglePlay}
              className="w-12 h-12 border-2 border-white bg-brand-accent text-brand-navy flex items-center justify-center font-black shrink-0 hover:bg-white transition-colors cursor-pointer shadow-(--shadow-brut-xs)"
              aria-label={isPlaying ? "Pause track" : "Play track"}
            >
              {isPlaying ? (
                <Pause className="w-6 h-6 fill-brand-navy" />
              ) : (
                <Play className="w-6 h-6 fill-brand-navy ml-0.5" />
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
              className="w-full h-2 bg-white/20 accent-brand-accent cursor-pointer rounded"
            />
            <div className="flex justify-between font-mono text-xs text-white/60">
              <span>{formatTrackTime(currentTime)}</span>
              <span>{formatTrackTime(duration)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Playlist Grid */}
      {playlists.length === 0 ? (
        <div className="py-16 border-4 border-dashed border-brand-navy/30 bg-white text-center font-mono text-xs text-brand-navy/60 uppercase tracking-widest rounded-xl">
          No public curated playlists published yet. New festival tapes arriving soon!
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6">
          {playlists.map((pl) => {
            const isThisPlaylistPlaying = !isLive && isPlaying && activePlaylist?.id === pl.id;
            const isThisPlaylistLoaded = !isLive && activePlaylist?.id === pl.id;
            const isExpanded = expandedId === pl.id;
            const tracks = expandedTracks[pl.id] || [];
            const isLoadingThisTracks = loadingTracks[pl.id] || false;

            return (
              <div
                key={pl.id}
                id={`playlist-${pl.id}`}
                className={`border-4 border-brand-navy bg-white shadow-(--shadow-brut-md) rounded-xl overflow-hidden transition-all ${
                  isThisPlaylistLoaded ? "ring-4 ring-brand-accent/50" : ""
                }`}
              >
                {/* Playlist Card Header Bar */}
                <div className="p-4 sm:p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-5 bg-brand-off-white/40 border-b-2 border-brand-navy/20">
                  <div className="flex items-start sm:items-center gap-4 min-w-0">
                    {/* Cover Art Thumbnail */}
                    <div className="relative w-20 h-20 sm:w-24 sm:h-24 rounded-lg border-2 border-brand-navy bg-neutral-900 overflow-hidden shrink-0 shadow-(--shadow-brut-xs)">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={resolveCoverArt(pl.cover_url)}
                        alt={pl.name}
                        className="w-full h-full object-cover"
                      />
                      {pl.is_broadcast_active && (
                        <div className="absolute top-1 left-1 bg-red-600 text-white font-mono text-[9px] font-black px-1.5 py-0.5 uppercase tracking-widest border border-brand-navy flex items-center gap-1 shadow-sm">
                          <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                          <span>ON AIR</span>
                        </div>
                      )}
                    </div>

                    {/* Metadata */}
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        {pl.genre && (
                          <span className="px-2 py-0.5 border border-brand-navy/40 bg-white font-mono text-[10px] font-bold uppercase text-brand-navy">
                            {pl.genre}
                          </span>
                        )}
                        {pl.is_broadcast_active && (
                          <span className="px-2 py-0.5 border border-red-700 bg-red-50 text-red-700 font-mono text-[10px] font-bold uppercase flex items-center gap-1">
                            <Radio className="w-3 h-3" />
                            LIVE ON 24/7 BROADCAST
                          </span>
                        )}
                      </div>

                      <h3 className="font-display text-xl sm:text-2xl font-black uppercase text-brand-navy leading-tight truncate">
                        {pl.name}
                      </h3>

                      {pl.description && (
                        <p className="font-mono text-xs text-brand-navy/70 line-clamp-2">
                          {pl.description}
                        </p>
                      )}

                      <div className="flex flex-wrap items-center gap-3 pt-1 font-mono text-xs text-brand-navy/60 font-semibold">
                        <span className="flex items-center gap-1">
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
                      className={`flex-1 sm:flex-none px-4 py-2.5 font-mono text-xs font-bold uppercase border-2 border-brand-navy shadow-(--shadow-brut-xs) flex items-center justify-center gap-2 transition-all cursor-pointer active:scale-95 ${
                        isThisPlaylistPlaying
                          ? "bg-brand-accent text-brand-navy"
                          : "bg-brand-navy text-white hover:bg-brand-navy/90"
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
                      className="px-3.5 py-2.5 bg-white hover:bg-brand-off-white text-brand-navy font-mono text-xs font-bold uppercase border-2 border-brand-navy shadow-(--shadow-brut-xs) flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                      aria-label={isExpanded ? "Collapse tracklist" : "View tracklist"}
                    >
                      <span>TRACKS</span>
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4" />
                      ) : (
                        <ChevronDown className="w-4 h-4" />
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={(e) => handleSharePlaylist(pl, e)}
                      className="p-2.5 bg-white hover:bg-brand-accent text-brand-navy border-2 border-brand-navy shadow-(--shadow-brut-xs) transition-colors cursor-pointer"
                      title="Share Playlist Link"
                      aria-label="Share Playlist Link"
                    >
                      {copiedId === pl.id ? (
                        <Check className="w-4 h-4 text-green-700" />
                      ) : (
                        <Share2 className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Expanded Tracklist Table / Drawer */}
                {isExpanded && (
                  <div className="p-4 sm:p-6 bg-white space-y-3">
                    <div className="flex items-center justify-between border-b border-brand-navy/15 pb-2">
                      <span className="font-mono text-xs font-bold uppercase text-brand-navy tracking-wider">
                        ORDERED TRACKLIST ({pl.track_count} SONGS)
                      </span>
                      <span className="font-mono text-[11px] text-brand-navy/60">
                        Tap any song to play from that moment
                      </span>
                    </div>

                    {isLoadingThisTracks && tracks.length === 0 ? (
                      <div className="py-8 text-center space-y-2">
                        <Disc3 className="w-6 h-6 mx-auto animate-spin text-brand-navy/40" />
                        <p className="font-mono text-xs text-brand-navy/60 uppercase">
                          Fetching tracklist...
                        </p>
                      </div>
                    ) : tracks.length === 0 ? (
                      <div className="py-6 text-center font-mono text-xs text-brand-navy/50 uppercase">
                        No tracks added to this playlist yet.
                      </div>
                    ) : (
                      <div className="divide-y divide-brand-navy/10 max-h-[460px] overflow-y-auto pr-1">
                        {tracks.map((track, idx) => {
                          const isCurrentPlayingTrack =
                            isThisPlaylistLoaded &&
                            activePlaylist?.trackIndex === idx &&
                            isPlaying;
                          const isCurrentLoadedTrack =
                            isThisPlaylistLoaded && activePlaylist?.trackIndex === idx;

                          return (
                            <div
                              key={track.id}
                              onClick={() => handlePlayOrTogglePlaylist(pl.id, idx)}
                              className={`py-2.5 px-2 flex items-center justify-between gap-3 rounded cursor-pointer transition-colors group ${
                                isCurrentLoadedTrack
                                  ? "bg-brand-accent/20 border-l-4 border-brand-accent"
                                  : "hover:bg-brand-off-white"
                              }`}
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                {/* Track Position Number / Play Icon */}
                                <div className="w-8 flex items-center justify-center shrink-0">
                                  {isCurrentPlayingTrack ? (
                                    <div className="flex items-end gap-0.5 h-4">
                                      <span className="w-0.5 h-3 bg-brand-navy animate-pulse" />
                                      <span className="w-0.5 h-4 bg-brand-navy animate-pulse delay-75" />
                                      <span className="w-0.5 h-2 bg-brand-navy animate-pulse delay-150" />
                                    </div>
                                  ) : (
                                    <span className="font-mono text-xs font-bold text-brand-navy/50 group-hover:hidden">
                                      {track.position || idx + 1}
                                    </span>
                                  )}
                                  <Play className="w-3.5 h-3.5 fill-brand-navy text-brand-navy hidden group-hover:block ml-0.5" />
                                </div>

                                {/* Track Cover Thumbnail */}
                                <div className="w-9 h-9 rounded border border-brand-navy/30 overflow-hidden bg-brand-off-white shrink-0">
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img
                                    src={resolveCoverArt(track.cover_url || pl.cover_url)}
                                    alt=""
                                    className="w-full h-full object-cover"
                                  />
                                </div>

                                {/* Title & Artist */}
                                <div className="min-w-0">
                                  <p
                                    className={`text-xs sm:text-sm font-bold uppercase truncate leading-tight ${
                                      isCurrentLoadedTrack
                                        ? "text-brand-navy font-black"
                                        : "text-brand-navy"
                                    }`}
                                  >
                                    {formatTrackTitle(track.title)}
                                  </p>
                                  <p className="font-mono text-[11px] text-brand-navy/70 uppercase truncate mt-0.5">
                                    {track.dj_name}
                                  </p>
                                </div>
                              </div>

                              {/* Duration & Actions */}
                              <div className="flex items-center gap-3 shrink-0 font-mono text-xs text-brand-navy/70">
                                <span>{track.duration || formatTrackTime(track.duration_sec)}</span>
                                <a
                                  href={`https://open.spotify.com/search/${encodeURIComponent(
                                    `${track.title} ${track.dj_name}`
                                  )}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="p-1 hover:text-brand-navy transition-colors opacity-0 group-hover:opacity-100"
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
