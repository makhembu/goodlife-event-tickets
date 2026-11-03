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
} from "lucide-react";
import { formatTrackTitle } from "@/lib/radio/media-helpers";

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

export default function OnAirRundown() {
  const [sets, setSets] = useState<PlaylistTrack[]>([]);
  const [playlistName, setPlaylistName] = useState<string | null>(null);
  const [activeSetId, setActiveSetId] = useState<number | null>(null);
  const [broadcastMode, setBroadcastMode] = useState<"autodj" | "mania">("autodj");
  const [loading, setLoading] = useState(true);
  const [operatingId, setOperatingId] = useState<number | null>(null);
  const [modeSwitching, setModeSwitching] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [notification, setNotification] = useState<string | null>(null);
  const [openMenuTrackId, setOpenMenuTrackId] = useState<number | null>(null);

  const activeTrackRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll to center the currently playing track when it loads or changes
  useEffect(() => {
    if (!activeSetId) return;
    const timer = setTimeout(() => {
      if (activeTrackRef.current) {
        activeTrackRef.current.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      }
    }, 180);
    return () => clearTimeout(timer);
  }, [activeSetId, sets]);

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
    try {
      const res = await fetch("/api/admin/radio/playlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "play_now", setId }),
      });
      if (res.ok) {
        setActiveSetId(setId);
        setBroadcastMode("mania");
        notify(`🔥 ON AIR: "${trackTitle}" is now live!`);
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

      {/* Search Filter */}
      <div className="relative">
        <label htmlFor="rundown-search-box" className="sr-only">Search Rundown</label>
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-white/50" />
        <input
          id="rundown-search-box"
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search rundown…"
          aria-label="Search rundown"
          className="w-full bg-[#1A1D24] text-white font-mono text-xs pl-9 pr-3 py-2 border border-white/20 focus:border-[#DFBB7D] focus:outline-none rounded"
        />
      </div>

      {/* Backdrop for open overflow menu */}
      {openMenuTrackId !== null && (
        <div
          className="fixed inset-0 z-10"
          onClick={() => setOpenMenuTrackId(null)}
        />
      )}

      {/* Track List */}
      <div ref={containerRef} className="space-y-2 overflow-y-auto max-h-[420px] pr-1 scroll-smooth">
        {loading && sets.length === 0 ? (
          <div className="p-6 text-center text-white/40 font-mono text-xs">
            Loading broadcast rundown...
          </div>
        ) : filteredSets.length === 0 ? (
          <div className="p-6 text-center text-white/40 font-mono text-xs">
            No tracks found matching query.
          </div>
        ) : (
          filteredSets.map((track, idx) => {
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
                    {isPlaying ? "▶" : `#${idx + 1}`}
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="font-mono text-xs sm:text-sm font-bold text-white line-clamp-2 leading-snug">
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

                  {/* 40px Play / Skip Immediately Button */}
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

                  {/* Overflow '⋯' Menu Trigger */}
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
                  <div className="absolute right-2 top-12 z-20 bg-[#16181D] border-2 border-[#DFBB7D] rounded-lg p-1.5 shadow-2xl flex flex-col space-y-1 min-w-[160px] animate-in fade-in zoom-in-95 duration-100 font-mono text-xs">
                    <button
                      onClick={() => {
                        handleReorder(track.id, "up");
                        setOpenMenuTrackId(null);
                      }}
                      disabled={idx === 0}
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
                      disabled={idx === filteredSets.length - 1}
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
      </div>
    </div>
  );
}
