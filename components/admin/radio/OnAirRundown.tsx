"use client";

import React, { useState, useEffect, useMemo } from "react";
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
  const [activeSetId, setActiveSetId] = useState<number | null>(null);
  const [broadcastMode, setBroadcastMode] = useState<"autodj" | "mania">("autodj");
  const [loading, setLoading] = useState(true);
  const [operatingId, setOperatingId] = useState<number | null>(null);
  const [modeSwitching, setModeSwitching] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [notification, setNotification] = useState<string | null>(null);

  const notify = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 3500);
  };

  const fetchPlaylist = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/admin/radio/playlist");
      if (res.ok) {
        const data = await res.json();
        setSets(Array.isArray(data.sets) ? data.sets : []);
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
    fetchPlaylist();
    const interval = setInterval(fetchPlaylist, 6000);
    return () => clearInterval(interval);
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
            <h3 className="font-mono text-sm font-bold tracking-wider uppercase text-white">
              ON-AIR RUNDOWN · ROTATION TIMELINE
            </h3>
            <p className="text-[11px] font-mono text-[#DFBB7D]">
              {sets.length} Tracks in schedule · Real-time playout timeline
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
        <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-white/40" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Filter rotation by artist or song title..."
          className="w-full bg-[#1A1D24] text-white font-mono text-xs pl-8 pr-3 py-1.5 border border-white/10 focus:border-[#DFBB7D] focus:outline-none"
        />
      </div>

      {/* Track List */}
      <div className="space-y-1.5 overflow-y-auto max-h-[380px] pr-1">
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
                className={`p-2 border transition-all flex items-center justify-between ${
                  isPlaying
                    ? "bg-[#DFBB7D]/10 border-[#DFBB7D] shadow-[2px_2px_0px_#DFBB7D]"
                    : "bg-white/5 border-white/10 hover:border-white/20"
                }`}
              >
                {/* Left: Position & Info */}
                <div className="flex items-center space-x-2.5 min-w-0">
                  <span className={`font-mono text-xs font-bold w-6 text-center ${
                    isPlaying ? "text-[#F5C842]" : "text-white/40"
                  }`}>
                    {isPlaying ? "▶" : `#${idx + 1}`}
                  </span>

                  <div className="truncate">
                    <div className="font-mono text-xs font-bold text-white truncate">
                      {formatTrackTitle(track.title)}
                    </div>
                    <div className="text-[10px] font-mono text-[#DFBB7D] truncate">
                      {track.dj_name || "Resident Selector"}
                      {track.genre ? ` · ${track.genre}` : ""}
                    </div>
                  </div>
                </div>

                {/* Right: Actions */}
                <div className="flex items-center space-x-1.5 shrink-0 ml-2">
                  <span className="font-mono text-[11px] text-white/50 mr-1">
                    {formatSecs(track.duration_sec)}
                  </span>

                  {/* Skip to this track */}
                  <button
                    onClick={() => handlePlayNow(track.id, track.title)}
                    title="Skip immediately to this track"
                    className="p-1 bg-white/10 hover:bg-[#DFBB7D] hover:text-[#16181D] text-white border border-white/20"
                  >
                    <Play className="w-3 h-3 fill-current" />
                  </button>

                  {/* Up / Down Reorder */}
                  <button
                    onClick={() => handleReorder(track.id, "up")}
                    disabled={idx === 0}
                    title="Move Track Earlier"
                    className="p-1 text-white/50 hover:text-white disabled:opacity-20"
                  >
                    <ArrowUp className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => handleReorder(track.id, "down")}
                    disabled={idx === filteredSets.length - 1}
                    title="Move Track Later"
                    className="p-1 text-white/50 hover:text-white disabled:opacity-20"
                  >
                    <ArrowDown className="w-3 h-3" />
                  </button>

                  {/* Remove */}
                  <button
                    onClick={() => handleDelete(track.id, track.title)}
                    title="Remove from playlist"
                    className="p-1 text-white/30 hover:text-[#E84855]"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
