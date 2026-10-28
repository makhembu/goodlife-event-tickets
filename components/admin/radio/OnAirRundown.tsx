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
} from "lucide-react";

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
        setActiveSetId(data.active_set_id || null);
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
            ? "⚡ MANIA MODE ENGAGED: DJ Manual Control Active!"
            : "🤖 AUTODJ ROTATION ENGAGED: Playout cycling automatically."
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
    <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-5 shadow-2xl flex flex-col h-full space-y-4">
      {/* Notification Toast */}
      {notification && (
        <div className="flex items-center gap-2 p-2.5 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 font-mono text-xs animate-in fade-in slide-in-from-top-1">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
          <span className="truncate">{notification}</span>
        </div>
      )}

      {/* Rundown Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800/80 pb-3">
        <div className="flex items-center gap-2.5">
          <Layers className="w-4 h-4 text-cyan-400" />
          <div>
            <h3 className="font-mono text-xs font-black tracking-widest uppercase text-white">
              FESTIVAL PLAYLIST &amp; RUNDOWN
            </h3>
            <p className="font-mono text-[10px] text-zinc-500">
              {sets.length} Tracks In Active Rotation
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Mode Switchers: AUTODJ vs MANIA */}
          <div className="flex items-center p-1 rounded-lg bg-zinc-900 border border-zinc-800">
            <button
              onClick={() => handleToggleMode("autodj")}
              disabled={modeSwitching}
              className={`px-2.5 py-1 rounded font-mono text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                broadcastMode === "autodj"
                  ? "bg-emerald-500 text-zinc-950 shadow-md"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              AUTODJ
            </button>
            <button
              onClick={() => handleToggleMode("mania")}
              disabled={modeSwitching}
              className={`px-2.5 py-1 rounded font-mono text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1 ${
                broadcastMode === "mania"
                  ? "bg-amber-400 text-zinc-950 shadow-md animate-pulse"
                  : "text-zinc-400 hover:text-amber-400"
              }`}
            >
              <Zap className="w-3 h-3 fill-current" />
              MANIA (DJ)
            </button>
          </div>

          <button
            onClick={fetchPlaylist}
            disabled={loading}
            className="p-1.5 rounded-lg border border-zinc-800 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors cursor-pointer"
            title="Refresh Playlist"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-cyan-400" : ""}`} />
          </button>
        </div>
      </div>

      {/* Mode Status Banner */}
      <div
        className={`p-2.5 rounded-lg border font-mono text-xs flex items-center justify-between transition-colors ${
          broadcastMode === "mania"
            ? "bg-amber-950/40 border-amber-600/60 text-amber-300"
            : "bg-emerald-950/30 border-emerald-800/40 text-emerald-400"
        }`}
      >
        <div className="flex items-center gap-2">
          {broadcastMode === "mania" ? (
            <Zap className="w-4 h-4 text-amber-400 fill-current animate-bounce" />
          ) : (
            <Radio className="w-4 h-4 text-emerald-400 animate-pulse" />
          )}
          <span className="font-bold uppercase tracking-wider">
            {broadcastMode === "mania"
              ? "MANIA MODE ENGAGED · MANUAL DJ CONTROL"
              : "AUTODJ ACTIVE · 24/7 AUTO ROTATION"}
          </span>
        </div>
        <span className="text-[10px] opacity-75">
          {broadcastMode === "mania" ? "Click [FIRE] on any track" : "Cycles smoothly"}
        </span>
      </div>

      {/* Search Input */}
      <div className="relative">
        <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Filter tracks by title or artist..."
          className="w-full bg-zinc-900/90 border border-zinc-800 rounded-lg pl-8 pr-3 py-1.5 font-mono text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-cyan-500"
        />
      </div>

      {/* Playlist Table */}
      <div className="flex-1 overflow-y-auto space-y-2 max-h-[460px] pr-1">
        {filteredSets.length === 0 ? (
          <div className="text-center py-12 px-4 rounded-xl border border-dashed border-zinc-800/80 bg-zinc-900/30">
            <Layers className="w-8 h-8 text-zinc-700 mx-auto mb-2" />
            <p className="font-mono text-xs font-bold text-zinc-400 uppercase">
              No tracks found
            </p>
          </div>
        ) : (
          filteredSets.map((track, idx) => {
            const isOnAir = activeSetId === track.id;
            const isOperating = operatingId === track.id;

            return (
              <div
                key={track.id}
                className={`flex items-center justify-between p-2.5 rounded-lg border transition-all ${
                  isOnAir
                    ? "bg-emerald-950/40 border-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.2)]"
                    : "bg-zinc-900/70 border-zinc-800/80 hover:border-zinc-700"
                }`}
              >
                {/* Track Info */}
                <div className="flex items-center gap-3 overflow-hidden min-w-0 flex-1">
                  <span className="font-mono font-bold text-xs text-zinc-500 w-6 flex-shrink-0">
                    #{idx + 1}
                  </span>

                  {/* Thumbnail */}
                  <img
                    src={track.cover_url || "/flyer.png"}
                    alt={track.title}
                    className="w-9 h-9 rounded object-cover flex-shrink-0 border border-zinc-800"
                  />

                  <div className="truncate min-w-0">
                    <div className="flex items-center gap-2">
                      <p
                        className={`font-mono text-xs font-bold truncate ${
                          isOnAir ? "text-emerald-300" : "text-zinc-100"
                        }`}
                      >
                        {track.title}
                      </p>
                      {isOnAir && (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase font-mono bg-emerald-500 text-zinc-950 flex-shrink-0 animate-pulse">
                          ON AIR
                        </span>
                      )}
                    </div>
                    <p className="font-mono text-[10px] text-zinc-400 truncate">
                      {track.dj_name || "Goodlife Resident"}
                      {track.duration_sec ? ` · ${formatSecs(track.duration_sec)}` : ""}
                    </p>
                  </div>
                </div>

                {/* DJ Control Actions */}
                <div className="flex items-center gap-1.5 ml-2 flex-shrink-0">
                  {/* Fire On Air / Play Now Button */}
                  <button
                    onClick={() => handlePlayNow(track.id, track.title)}
                    disabled={isOnAir || isOperating}
                    className={`px-2.5 py-1 rounded font-mono text-[10px] font-black uppercase flex items-center gap-1 transition-all cursor-pointer ${
                      isOnAir
                        ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 cursor-default"
                        : "bg-amber-400 hover:bg-amber-300 text-zinc-950 shadow hover:shadow-amber-400/20 active:scale-95"
                    }`}
                    title={isOnAir ? "Currently on air" : "Cue directly on air (engages Mania)"}
                  >
                    <Play className="w-3 h-3 fill-current" />
                    {isOnAir ? "LIVE" : "FIRE"}
                  </button>

                  {/* Move Up */}
                  <button
                    onClick={() => handleReorder(track.id, "up")}
                    disabled={idx === 0 || isOperating}
                    className="p-1 rounded bg-zinc-950 border border-zinc-800 text-zinc-400 hover:text-white disabled:opacity-30 transition-colors cursor-pointer"
                    title="Move up in rotation"
                  >
                    <ArrowUp className="w-3 h-3" />
                  </button>

                  {/* Move Down */}
                  <button
                    onClick={() => handleReorder(track.id, "down")}
                    disabled={idx === sets.length - 1 || isOperating}
                    className="p-1 rounded bg-zinc-950 border border-zinc-800 text-zinc-400 hover:text-white disabled:opacity-30 transition-colors cursor-pointer"
                    title="Move down in rotation"
                  >
                    <ArrowDown className="w-3 h-3" />
                  </button>

                  {/* Delete / Remove */}
                  <button
                    onClick={() => handleDelete(track.id, track.title)}
                    disabled={isOperating}
                    className="p-1 rounded bg-zinc-950 border border-zinc-800 text-zinc-500 hover:text-red-400 hover:border-red-900/40 transition-colors cursor-pointer"
                    title="Remove from playlist"
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
