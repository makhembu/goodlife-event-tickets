"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  Layers,
  Play,
  ArrowUp,
  ArrowDown,
  Trash2,
  RefreshCw,
  Clock,
  Radio,
  Zap,
  Search,
  CheckCircle2,
  AlertCircle,
  SkipForward,
  MoreVertical,
  ListMusic,
  X,
  Sliders,
} from "lucide-react";
import { formatTrackTitle } from "@/lib/radio/media-helpers";
import { useRadio } from "@/context/RadioContext";

interface PlaylistTrack {
  id: number;
  title: string;
  dj_name: string;
  duration: string;
  duration_sec: number;
  cover_url: string;
  audio_url: string;
  display_order: number;
  genre?: string;
}

export interface OnAirSyncedTrack {
  id: number;
  title: string;
  dj_name?: string | null;
}

export interface OnAirRundownProps {
  onTrackStateSync?: (
    active: OnAirSyncedTrack | null,
    next: OnAirSyncedTrack | null
  ) => void;
  onEditTrack?: (track: PlaylistTrack) => void;
  refreshTrigger?: number;
}

export default function OnAirRundown({ onTrackStateSync, onEditTrack, refreshTrigger }: OnAirRundownProps) {
  const { fetchRadioLive, playImmediateBroadcastTrack } = useRadio();
  const [sets, setSets] = useState<PlaylistTrack[]>([]);
  const [playlistName, setPlaylistName] = useState<string | null>(null);
  const [activeSetId, setActiveSetId] = useState<number | null>(null);
  const [broadcastMode, setBroadcastMode] = useState<"autodj" | "mania">("autodj");
  const [loading, setLoading] = useState(true);
  const [operatingId, setOperatingId] = useState<number | null>(null);
  const [modeSwitching, setModeSwitching] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerSearchQuery, setDrawerSearchQuery] = useState("");
  const [notification, setNotification] = useState<string | null>(null);
  const [openMenuTrackId, setOpenMenuTrackId] = useState<number | null>(null);

  const activeTrackRef = useRef<HTMLDivElement | null>(null);
  const drawerActiveRef = useRef<HTMLDivElement | null>(null);

  const scrollToActiveInDrawer = (smooth = true) => {
    if (drawerActiveRef.current) {
      drawerActiveRef.current.scrollIntoView({
        behavior: smooth ? "smooth" : "auto",
        block: "center",
      });
    }
  };

  useEffect(() => {
    if (!drawerOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawerOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    const t = setTimeout(() => scrollToActiveInDrawer(false), 80);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      clearTimeout(t);
    };
  }, [drawerOpen]);

  const notify = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 3500);
  };

  const fetchPlaylist = async () => {
    try {
      const res = await fetch("/api/admin/radio/playlist");
      if (res.ok) {
        const data = await res.json();
        setSets(Array.isArray(data.sets) ? data.sets : []);
        setPlaylistName(data.playlist_name || null);
        let activeId = data.active_set_id || null;
        if (!activeId) {
          try {
            const liveRes = await fetch("/api/radio/live");
            if (liveRes.ok) {
              const liveData = await liveRes.json();
              if (liveData?.now_playing?.id) activeId = liveData.now_playing.id;
            }
          } catch {}
        }
        setActiveSetId(activeId);
        setBroadcastMode(data.mode === "mania" ? "mania" : "autodj");
      }
    } catch (err) {
      console.error("Failed to fetch playlist:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(fetchPlaylist, 0);
    const interval = setInterval(fetchPlaylist, 6000);
    return () => {
      clearTimeout(timer);
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (refreshTrigger && refreshTrigger > 0) {
      fetchPlaylist();
    }
  }, [refreshTrigger]);

  const handleToggleMode = async (newMode: "autodj" | "mania") => {
    if (modeSwitching || newMode === broadcastMode) return;
    setModeSwitching(true);
    try {
      const res = await fetch("/api/admin/radio/mode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: newMode }),
      });
      if (res.ok) {
        setBroadcastMode(newMode);
        notify(
          newMode === "mania"
            ? "⚡ DJ MANUAL CONTROL: Custom track ordering active"
            : "🤖 AUTODJ ENGAGED: Automated smart rotation"
        );
        fetchPlaylist();
      } else {
        alert("Failed to switch radio mode.");
      }
    } catch {
      alert("Network timeout switching radio mode.");
    } finally {
      setModeSwitching(false);
    }
  };

  const handlePlayNow = async (setId: number, trackTitle: string) => {
    if (operatingId) return;
    setOperatingId(setId);

    // Instant zero-lag crossfade: start incoming deck immediately from local memory
    const localTrack = sets.find((s) => s.id === setId);
    if (localTrack?.audio_url) {
      playImmediateBroadcastTrack(localTrack);
      setActiveSetId(setId);
      setBroadcastMode("mania");
      notify(`🔥 ON AIR: "${trackTitle}" is now live!`);
    }

    try {
      const res = await fetch("/api/admin/radio/playlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "play_now", setId }),
      });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        if (!localTrack?.audio_url && data?.active_track?.audio_url) {
          playImmediateBroadcastTrack(data.active_track);
          setActiveSetId(setId);
          setBroadcastMode("mania");
          notify(`🔥 ON AIR: "${trackTitle}" is now live!`);
        }
        fetchPlaylist();
      } else {
        alert("Failed to cue track.");
      }
    } catch {
      alert("Network timeout cueing track.");
    } finally {
      setOperatingId(null);
    }
  };

  const handleReorder = async (setId: number, direction: "up" | "down") => {
    if (operatingId) return;
    setOperatingId(setId);
    try {
      const res = await fetch("/api/admin/radio/playlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reorder", setId, direction }),
      });
      if (res.ok) {
        fetchPlaylist();
      }
    } catch {
      alert("Network timeout reordering playlist.");
    } finally {
      setOperatingId(null);
    }
  };

  const handleDelete = async (setId: number, title: string) => {
    if (!confirm(`CONFIRM REMOVAL: Remove "${title}" from the festival playlist?`)) return;
    setOperatingId(setId);
    try {
      const res = await fetch(`/api/admin/radio/playlist?id=${setId}`, { method: "DELETE" });
      if (res.ok) {
        setSets((prev) => prev.filter((s) => s.id !== setId));
        notify(`Removed "${title}" from rotation.`);
      } else {
        alert("Failed to remove track.");
      }
    } catch {
      alert("Network timeout removing track.");
    } finally {
      setOperatingId(null);
    }
  };

  const formatSecs = (sec: number) => {
    if (!sec || isNaN(sec)) return "--:--";
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m < 10 ? "0" : ""}${m}:${s < 10 ? "0" : ""}${s}`;
  };

  const filteredSets = useMemo(() => {
    if (!searchQuery.trim()) return sets;
    const q = searchQuery.toLowerCase();
    return sets.filter(
      (s) => s.title?.toLowerCase().includes(q) || s.dj_name?.toLowerCase().includes(q)
    );
  }, [sets, searchQuery]);

  const activeTrack = useMemo(() => {
    return sets.find((s) => s.id === activeSetId) || null;
  }, [sets, activeSetId]);

  const activeTrackIdx = useMemo(() => {
    return activeTrack ? sets.findIndex((s) => s.id === activeTrack.id) : -1;
  }, [sets, activeTrack]);

  const nextTrack = useMemo(() => {
    if (activeTrackIdx === -1 || sets.length === 0) return null;
    return sets[(activeTrackIdx + 1) % sets.length] || null;
  }, [sets, activeTrackIdx]);

  const onTrackStateSyncRef = useRef(onTrackStateSync);
  onTrackStateSyncRef.current = onTrackStateSync;

  // Synchronize BrowserMicRecorder Live Prompter directly with active Rundown track
  useEffect(() => {
    if (!onTrackStateSyncRef.current) return;
    onTrackStateSyncRef.current(
      activeTrack
        ? {
            id: activeTrack.id,
            title: formatTrackTitle(activeTrack.title),
            dj_name: activeTrack.dj_name || null,
          }
        : null,
      nextTrack
        ? {
            id: nextTrack.id,
            title: formatTrackTitle(nextTrack.title),
            dj_name: nextTrack.dj_name || null,
          }
        : null
    );
  }, [activeTrack?.id, activeTrack?.title, activeTrack?.dj_name, nextTrack?.id, nextTrack?.title, nextTrack?.dj_name]);

  // Focused On-Air Window: next 4 upcoming sequential tracks (zero nested scrollbar)
  const focusedWindowTracks = useMemo(() => {
    if (searchQuery.trim()) {
      return filteredSets.slice(0, 6);
    }
    if (sets.length === 0) return [];
    const startIdx = activeTrackIdx >= 0 ? activeTrackIdx + 1 : 0;
    const count = Math.min(4, Math.max(0, sets.length - (activeTrackIdx >= 0 ? 1 : 0)));
    const result: Array<{ track: PlaylistTrack; queuePosition: number }> = [];
    for (let i = 0; i < count; i++) {
      const realIdx = (startIdx + i) % sets.length;
      if (sets[realIdx]) {
        result.push({ track: sets[realIdx], queuePosition: realIdx + 1 });
      }
    }
    return result;
  }, [sets, filteredSets, searchQuery, activeTrackIdx]);

  const drawerFilteredSets = useMemo(() => {
    if (!drawerSearchQuery.trim()) return sets;
    const q = drawerSearchQuery.toLowerCase();
    return sets.filter(
      (s) =>
        s.title?.toLowerCase().includes(q) ||
        s.dj_name?.toLowerCase().includes(q) ||
        s.genre?.toLowerCase().includes(q)
    );
  }, [sets, drawerSearchQuery]);

  return (
    <div className="bg-[#16181D] text-[#FBF9F6] border-2 border-[#16181D] p-4 shadow-[4px_4px_0px_#DFBB7D] space-y-4 flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 pb-3">
        <div className="flex items-center space-x-2">
          <div className="p-1.5 bg-[#DFBB7D] text-[#16181D] font-bold">
            <Layers className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-mono text-sm font-bold tracking-wider uppercase text-white truncate max-w-[280px]">
              {playlistName ? `ON-AIR RUNDOWN · ${playlistName.toUpperCase()}` : "ON-AIR RUNDOWN · ROTATION TIMELINE"}
            </h3>
            <p className="text-[11px] font-mono text-[#DFBB7D]">
              {sets.length} Tracks in schedule · {playlistName ? "Active Broadcast Playlist" : "Real-time playout timeline"}
            </p>
          </div>
        </div>

        {/* Mode Toggle Buttons */}
        <div className="flex items-center space-x-1 bg-black/40 p-0.5 border border-white/10">
          <button
            onClick={() => handleToggleMode("autodj")}
            disabled={modeSwitching}
            className={`px-2 py-1 font-mono text-[10px] font-bold transition-colors ${
              broadcastMode === "autodj"
                ? "bg-[#DFBB7D] text-[#16181D]"
                : "text-white/60 hover:text-white"
            }`}
          >
            AUTODJ
          </button>
          <button
            onClick={() => handleToggleMode("mania")}
            disabled={modeSwitching}
            className={`px-2 py-1 font-mono text-[10px] font-bold transition-colors ${
              broadcastMode === "mania"
                ? "bg-[#E84855] text-white"
                : "text-white/60 hover:text-white"
            }`}
          >
            MANUAL
          </button>
        </div>
      </div>

      {/* Notification Toast */}
      {notification && (
        <div className="p-2 bg-[#10B981]/20 border border-[#10B981] text-emerald-200 font-mono text-xs flex items-center space-x-1.5">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span className="truncate">{notification}</span>
        </div>
      )}

      {/* LIVE ON-AIR BOOTH PROMPTER (Full, un-truncated song titles for mic talkover) */}
      {activeTrack && (
        <div className="p-3 bg-gradient-to-r from-[#DFBB7D]/20 via-[#1A1D24] to-[#16181D] border-2 border-[#DFBB7D] rounded-lg shadow-[0_0_15px_rgba(223,187,125,0.15)] space-y-2">
          <div className="flex items-center justify-between text-[11px] font-mono">
            <div className="flex items-center gap-1.5 px-2 py-0.5 bg-[#E84855] text-white font-black tracking-wider uppercase rounded animate-pulse">
              <Radio className="w-3.5 h-3.5" />
              <span>LIVE ON-AIR PROMPTER</span>
            </div>
            <span className="text-[#DFBB7D] font-bold">
              Track {activeTrackIdx + 1} of {sets.length}
            </span>
          </div>
          <div>
            <div className="text-[10px] text-[#DFBB7D] font-mono font-bold uppercase tracking-wider">
              CURRENTLY PLAYING (READ FULL TITLE):
            </div>
            <div className="text-base sm:text-lg font-black text-[#F5C842] leading-tight break-words mt-0.5">
              {formatTrackTitle(activeTrack.title)}
            </div>
            <div className="text-xs font-mono text-[#DFBB7D] mt-1 flex flex-wrap items-center gap-2">
              <span className="font-bold text-white">{activeTrack.dj_name || "GOODLIFE Resident"}</span>
              {activeTrack.genre && <span className="text-white/50">· {activeTrack.genre}</span>}
              <span className="text-white/50">· {formatSecs(activeTrack.duration_sec)}</span>
            </div>
          </div>
          {nextTrack && (
            <div className="pt-2 border-t border-white/10 flex items-start gap-1.5 text-xs font-mono">
              <span className="text-[#DFBB7D] font-black shrink-0">⏭️ UP NEXT:</span>
              <span className="text-white font-bold break-words">
                {formatTrackTitle(nextTrack.title)}
                {nextTrack.dj_name ? ` · ${nextTrack.dj_name}` : ""}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Search Filter + Full Queue Drawer Launcher */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <label htmlFor="rundown-search-box" className="sr-only">Search Rundown</label>
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-white/50" />
          <input
            id="rundown-search-box"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Quick search or cue track…"
            aria-label="Search rundown"
            className="w-full bg-[#1A1D24] text-white font-mono text-xs pl-9 pr-3 py-2 border border-white/20 focus:border-[#DFBB7D] focus:outline-none rounded"
          />
        </div>
        <button
          type="button"
          onClick={() => {
            setDrawerSearchQuery(searchQuery);
            setDrawerOpen(true);
          }}
          className="px-3 py-2 bg-[#DFBB7D]/15 hover:bg-[#DFBB7D] text-[#DFBB7D] hover:text-[#16181D] border border-[#DFBB7D]/50 rounded font-mono text-[11px] font-black uppercase shrink-0 transition-all cursor-pointer flex items-center gap-1.5 shadow-sm"
          title="Open Full Broadcast Queue Drawer"
        >
          <ListMusic className="w-3.5 h-3.5" />
          <span>Full Queue ({sets.length})</span>
        </button>
      </div>

      {/* Backdrop for open overflow menu */}
      {openMenuTrackId !== null && (
        <div
          className="fixed inset-0 z-10"
          onClick={() => setOpenMenuTrackId(null)}
        />
      )}

      {/* Focused On-Air Window (Zero nested scroll trap on mobile/desktop) */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-wider text-white/50 px-0.5">
          <span>
            {searchQuery.trim()
              ? `Search Matches (${filteredSets.length})`
              : `Coming Up Next (${Math.min(4, Math.max(0, sets.length - 1))} in view)`}
          </span>
          {!searchQuery.trim() && sets.length > 5 && (
            <button
              type="button"
              onClick={() => {
                setDrawerSearchQuery("");
                setDrawerOpen(true);
              }}
              className="text-[#DFBB7D] hover:underline font-bold cursor-pointer"
            >
              View all {sets.length} tracks →
            </button>
          )}
        </div>

        {loading && sets.length === 0 ? (
          <div className="p-6 text-center text-white/40 font-mono text-xs">
            Loading broadcast rundown...
          </div>
        ) : focusedWindowTracks.length === 0 ? (
          <div className="p-6 text-center text-white/40 font-mono text-xs">
            {searchQuery.trim() ? "No tracks found matching query." : "Waiting for upcoming queue tracks."}
          </div>
        ) : (
          focusedWindowTracks.map((entry) => {
            const track = "track" in entry ? entry.track : entry;
            const queuePos = "queuePosition" in entry ? entry.queuePosition : sets.findIndex((s) => s.id === track.id) + 1;
            const idx = sets.findIndex((s) => s.id === track.id);
            const isPlaying = track.id === activeSetId;
            return (
              <div
                key={track.id}
                ref={isPlaying ? activeTrackRef : undefined}
                className={`p-2.5 border transition-all flex items-center justify-between relative ${
                  isPlaying
                    ? "bg-[#DFBB7D]/15 border-[#DFBB7D] shadow-[2px_2px_0px_#DFBB7D]"
                    : "bg-white/5 border-white/10 hover:border-white/20"
                }`}
              >
                {/* Left: Position & Two-Line Title Info */}
                <div className="flex items-center space-x-3 min-w-0 flex-1">
                  <span className={`font-mono text-xs font-bold w-6 text-center shrink-0 ${
                    isPlaying ? "text-[#F5C842] font-black text-sm" : "text-white/40"
                  }`}>
                    {isPlaying ? "▶" : `#${queuePos}`}
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="font-mono text-xs sm:text-sm font-bold text-white break-words leading-snug">
                      {formatTrackTitle(track.title)}
                    </div>
                    <div className="text-[11px] font-mono text-[#DFBB7D] truncate mt-0.5 flex items-center gap-1.5">
                      <span>{track.dj_name || "Resident Selector"}</span>
                      {track.genre && <span className="text-white/40">· {track.genre}</span>}
                      <span className="text-white/40 sm:hidden">· {formatSecs(track.duration_sec)}</span>
                    </div>
                  </div>
                </div>

                {/* Right: Actions (Big 40px Play/Skip Button + Duration + Overflow Menu) */}
                <div className="flex items-center space-x-2 shrink-0 ml-3">
                  <span className="font-mono text-xs text-white/50 hidden sm:inline">
                    {formatSecs(track.duration_sec)}
                  </span>

                  <button
                    onClick={() => handlePlayNow(track.id, track.title)}
                    title={`Skip immediately to ${track.title}`}
                    aria-label={`Play ${track.title} now`}
                    className={`w-10 h-10 min-w-[40px] flex items-center justify-center rounded transition-all active:scale-95 ${
                      isPlaying
                        ? "bg-[#F5C842] text-[#16181D] shadow-[0_0_10px_#F5C842]"
                        : "bg-[#DFBB7D] hover:bg-[#F5C842] text-[#16181D]"
                    }`}
                  >
                    <Play className="w-4 h-4 fill-current ml-0.5" />
                  </button>

                  <button
                    onClick={() => setOpenMenuTrackId(openMenuTrackId === track.id ? null : track.id)}
                    title="Track options (Move earlier, move later, remove)"
                    aria-label="Track options"
                    className="w-10 h-10 min-w-[40px] flex items-center justify-center bg-white/10 hover:bg-white/20 text-white rounded transition-colors active:scale-95"
                  >
                    <MoreVertical className="w-4 h-4" />
                  </button>
                </div>

                {/* Overflow Popover Menu */}
                {openMenuTrackId === track.id && (
                  <div className="absolute right-2 top-12 z-20 bg-[#16181D] border-2 border-[#DFBB7D] rounded-lg p-1.5 shadow-2xl flex flex-col space-y-1 min-w-[175px] animate-in fade-in zoom-in-95 duration-100 font-mono text-xs">
                    {onEditTrack && (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            onEditTrack(track);
                            setOpenMenuTrackId(null);
                          }}
                          className="flex items-center space-x-2 px-2.5 py-2 hover:bg-white/10 text-[#DFBB7D] hover:text-white rounded text-left transition-colors font-bold"
                        >
                          <Sliders className="w-3.5 h-3.5 text-[#DFBB7D]" />
                          <span>Edit Track Properties</span>
                        </button>
                        <div className="border-t border-white/10 my-0.5" />
                      </>
                    )}
                    <button
                      onClick={() => {
                        handleReorder(track.id, "up");
                        setOpenMenuTrackId(null);
                      }}
                      disabled={idx <= 0}
                      className="flex items-center space-x-2 px-2.5 py-2 hover:bg-white/10 text-white disabled:opacity-30 rounded text-left transition-colors"
                    >
                      <ArrowUp className="w-3.5 h-3.5 text-[#DFBB7D]" />
                      <span>Move Earlier</span>
                    </button>
                    <button
                      onClick={() => {
                        handleReorder(track.id, "down");
                        setOpenMenuTrackId(null);
                      }}
                      disabled={idx === -1 || idx === sets.length - 1}
                      className="flex items-center space-x-2 px-2.5 py-2 hover:bg-white/10 text-white disabled:opacity-30 rounded text-left transition-colors"
                    >
                      <ArrowDown className="w-3.5 h-3.5 text-[#DFBB7D]" />
                      <span>Move Later</span>
                    </button>
                    <div className="border-t border-white/10 my-0.5" />
                    <button
                      onClick={() => {
                        handleDelete(track.id, track.title);
                        setOpenMenuTrackId(null);
                      }}
                      className="flex items-center space-x-2 px-2.5 py-2 hover:bg-red-500/20 text-red-400 rounded text-left transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Remove from Air</span>
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}

        {sets.length > 0 && (
          <button
            type="button"
            onClick={() => {
              setDrawerSearchQuery("");
              setDrawerOpen(true);
            }}
            className="w-full py-2.5 px-3 bg-white/5 hover:bg-white/10 border border-dashed border-[#DFBB7D]/40 hover:border-[#DFBB7D] text-[#DFBB7D] font-mono text-xs font-bold uppercase tracking-wider rounded flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <ListMusic className="w-4 h-4" />
            <span>Browse Full Queue & Skip ({sets.length} Tracks)</span>
          </button>
        )}
      </div>

      {/* Full Queue Search & Skip Drawer / Modal */}
      {drawerOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4"
          onClick={() => setDrawerOpen(false)}
        >
          <div
            className="bg-[#16181D] border-2 border-[#DFBB7D] w-full sm:max-w-2xl max-h-[88vh] sm:rounded-xl rounded-t-2xl flex flex-col overflow-hidden shadow-[0_0_40px_rgba(0,0,0,0.85)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-white/15 flex items-center justify-between gap-2 shrink-0 bg-[#1A1D24]">
              <div>
                <h4 className="font-mono text-sm font-black uppercase text-white flex items-center gap-2">
                  <ListMusic className="w-4 h-4 text-[#DFBB7D]" />
                  <span>Full Broadcast Queue ({sets.length})</span>
                </h4>
                <p className="text-[11px] font-mono text-[#DFBB7D]">
                  {playlistName || "GOODLIFE Master Rotation"} · Tap ▶ to cue any track live
                </p>
              </div>
              <div className="flex items-center gap-2">
                {activeSetId && (
                  <button
                    type="button"
                    onClick={() => scrollToActiveInDrawer(true)}
                    className="px-2.5 py-1.5 bg-[#DFBB7D]/15 hover:bg-[#DFBB7D] text-[#DFBB7D] hover:text-[#16181D] border border-[#DFBB7D]/50 rounded font-mono text-[11px] font-bold uppercase cursor-pointer"
                  >
                    🎯 On-Air
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setDrawerOpen(false)}
                  className="p-1.5 text-white/70 hover:text-white bg-white/10 rounded cursor-pointer"
                  aria-label="Close full queue"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="p-3 border-b border-white/10 bg-[#121316] shrink-0">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-white/50" />
                <input
                  type="text"
                  autoFocus
                  value={drawerSearchQuery}
                  onChange={(e) => setDrawerSearchQuery(e.target.value)}
                  placeholder="Filter full queue by title, artist, or genre..."
                  className="w-full bg-[#1A1D24] text-white font-mono text-xs pl-9 pr-3 py-2.5 border border-white/20 focus:border-[#DFBB7D] focus:outline-none rounded"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {drawerFilteredSets.length === 0 ? (
                <div className="p-8 text-center text-white/40 font-mono text-xs">
                  No tracks match &ldquo;{drawerSearchQuery}&rdquo;.
                </div>
              ) : (
                drawerFilteredSets.map((track) => {
                  const fullIdx = sets.findIndex((s) => s.id === track.id);
                  const isPlaying = track.id === activeSetId;
                  return (
                    <div
                      key={track.id}
                      ref={isPlaying ? drawerActiveRef : undefined}
                      className={`p-2.5 border rounded flex items-center justify-between gap-2 ${
                        isPlaying
                          ? "bg-[#DFBB7D]/15 border-[#DFBB7D] shadow-[2px_2px_0px_#DFBB7D]"
                          : "bg-white/5 border-white/10 hover:border-white/25"
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <span
                          className={`font-mono text-xs font-bold w-7 text-center shrink-0 ${
                            isPlaying ? "text-[#F5C842] font-black" : "text-white/45"
                          }`}
                        >
                          {isPlaying ? "▶" : `#${fullIdx + 1}`}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="font-mono text-xs font-bold text-white break-words leading-snug">
                            {formatTrackTitle(track.title)}
                          </div>
                          <div className="text-[11px] font-mono text-[#DFBB7D] truncate mt-0.5">
                            {track.dj_name || "Resident Selector"}
                            {track.genre ? ` · ${track.genre}` : ""} · {formatSecs(track.duration_sec)}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {onEditTrack && (
                          <button
                            type="button"
                            onClick={() => onEditTrack(track)}
                            title="Edit track properties"
                            className="p-2 bg-white/5 hover:bg-[#DFBB7D]/20 text-white/70 hover:text-[#DFBB7D] rounded transition-colors cursor-pointer"
                          >
                            <Sliders className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleReorder(track.id, "up")}
                          disabled={fullIdx <= 0}
                          title="Move Earlier"
                          className="p-2 bg-white/5 hover:bg-white/15 text-white/70 hover:text-white disabled:opacity-25 rounded"
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleReorder(track.id, "down")}
                          disabled={fullIdx === -1 || fullIdx === sets.length - 1}
                          title="Move Later"
                          className="p-2 bg-white/5 hover:bg-white/15 text-white/70 hover:text-white disabled:opacity-25 rounded"
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handlePlayNow(track.id, track.title)}
                          title={`Play ${track.title} now`}
                          className={`px-3 py-2 rounded font-mono text-xs font-black uppercase flex items-center gap-1 cursor-pointer ${
                            isPlaying
                              ? "bg-[#F5C842] text-[#16181D]"
                              : "bg-[#DFBB7D] hover:bg-[#F5C842] text-[#16181D]"
                          }`}
                        >
                          <Play className="w-3.5 h-3.5 fill-current" />
                          <span>{isPlaying ? "LIVE" : "PLAY"}</span>
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
