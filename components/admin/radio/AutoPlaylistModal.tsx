"use client";

import React, { useState } from "react";
import {
  Sparkles,
  X,
  Compass,
  Radio,
  Music2,
  Zap,
  Moon,
  Sun,
  Flame,
  CheckCircle2,
  Sliders,
} from "lucide-react";
import {
  AutoPlaylistVibe,
  VIBE_DEFINITIONS,
  VibeDefinition,
} from "@/lib/radio/harmonic-graph";

interface AutoPlaylistModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPlaylistCreated: (newPlaylistId: number) => void;
  showBanner: (msg: string, type: "success" | "error") => void;
}

export default function AutoPlaylistModal({
  isOpen,
  onClose,
  onPlaylistCreated,
  showBanner,
}: AutoPlaylistModalProps) {
  const [selectedVibe, setSelectedVibe] = useState<AutoPlaylistVibe>("late_night");
  const [customName, setCustomName] = useState(VIBE_DEFINITIONS.late_night.name);
  const [customDesc, setCustomDesc] = useState(VIBE_DEFINITIONS.late_night.description);
  const [trackCount, setTrackCount] = useState<number>(15);
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSelectVibe = (vibeKey: AutoPlaylistVibe) => {
    setSelectedVibe(vibeKey);
    const def = VIBE_DEFINITIONS[vibeKey];
    setCustomName(def.name);
    setCustomDesc(def.description);
  };

  const handleGenerate = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/radio/playlists/auto-create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vibe: selectedVibe,
          name: customName.trim(),
          description: customDesc.trim(),
          track_count: trackCount,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success && data.playlist) {
        showBanner(
          `✨ Created "${data.playlist.name}" with ${data.trackCount || data.playlist.track_count} harmonically aligned tracks!`,
          "success"
        );
        onPlaylistCreated(data.playlist.id);
        onClose();
      } else {
        showBanner(data.error || "Failed to generate auto-playlist", "error");
      }
    } catch {
      showBanner("Network error while generating auto-playlist", "error");
    } finally {
      setLoading(false);
    }
  };

  const getVibeIcon = (vibe: AutoPlaylistVibe) => {
    switch (vibe) {
      case "late_night":
        return <Moon className="w-5 h-5 text-indigo-400" />;
      case "morning_rise":
        return <Sun className="w-5 h-5 text-amber-300" />;
      case "club_peak":
        return <Flame className="w-5 h-5 text-amber-400" />;
      case "sundowner":
        return <Sun className="w-5 h-5 text-orange-400" />;
      case "amapiano_groove":
        return <Music2 className="w-5 h-5 text-[#DFBB7D]" />;
      case "afro_energy":
        return <Zap className="w-5 h-5 text-emerald-400" />;
      default:
        return <Sparkles className="w-5 h-5 text-[#DFBB7D]" />;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-[#16181D] border-2 border-white/20 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-[8px_8px_0px_#000] overflow-hidden">
        {/* Modal Header */}
        <div className="p-5 border-b border-white/10 flex items-center justify-between bg-[#1A1D24]">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#DFBB7D]/10 border border-[#DFBB7D]/30 flex items-center justify-center text-[#DFBB7D]">
              <Compass className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-mono text-sm font-black uppercase text-white tracking-wider flex items-center gap-2">
                Auto-Playlist Vibe Creator
                <span className="text-[10px] px-2 py-0.5 rounded bg-[#DFBB7D] text-[#16181D] font-mono font-bold">
                  CAMELOT GRAPH
                </span>
              </h3>
              <p className="text-xs text-white/50 font-mono">
                Algorithmic Camelot Wheel traversal & BPM harmonization across festival tracks
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-6 overflow-y-auto">
          {/* Vibe Presets Selector */}
          <div>
            <label className="text-xs font-mono font-bold uppercase text-white/80 block mb-2.5">
              1. Choose Target Vibe Preset
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {(Object.keys(VIBE_DEFINITIONS) as AutoPlaylistVibe[]).map((key) => {
                const def = VIBE_DEFINITIONS[key];
                const isSelected = selectedVibe === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => handleSelectVibe(key)}
                    className={`p-3.5 rounded-xl border-2 text-left transition-all flex flex-col justify-between ${
                      isSelected
                        ? "bg-[#1E222B] border-[#DFBB7D] shadow-[3px_3px_0px_#DFBB7D]"
                        : "bg-[#181B22] border-white/10 hover:border-white/30 hover:bg-[#1E222B]"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2">
                        {getVibeIcon(key)}
                        <span className="font-mono text-xs font-black text-white uppercase">
                          {def.name}
                        </span>
                      </div>
                      {isSelected && (
                        <CheckCircle2 className="w-4 h-4 text-[#DFBB7D] shrink-0" />
                      )}
                    </div>
                    <p className="text-[11px] text-white/60 line-clamp-2 mb-2">
                      {def.description}
                    </p>
                    <div className="flex items-center gap-2 text-[10px] font-mono text-white/40">
                      <span>BPM {def.minBpm}-{def.maxBpm}</span>
                      <span>•</span>
                      <span className="capitalize">{def.energyCurve} Curve</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Configuration Form */}
          <div className="space-y-4 pt-2 border-t border-white/10">
            <div>
              <label className="text-xs font-mono font-bold uppercase text-white/80 block mb-1">
                Playlist Name
              </label>
              <input
                type="text"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder="e.g. Late Night Drive 254"
                className="w-full bg-[#181B22] border border-white/20 rounded-xl px-3 py-2 text-xs font-mono text-white placeholder-white/40 focus:outline-none focus:border-[#DFBB7D]"
              />
            </div>

            <div>
              <label className="text-xs font-mono font-bold uppercase text-white/80 block mb-1">
                Description / Airwave Note
              </label>
              <textarea
                value={customDesc}
                onChange={(e) => setCustomDesc(e.target.value)}
                rows={2}
                className="w-full bg-[#181B22] border border-white/20 rounded-xl px-3 py-2 text-xs font-mono text-white placeholder-white/40 focus:outline-none focus:border-[#DFBB7D] resize-none"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-mono font-bold uppercase text-white/80">
                  Target Track Count: <span className="text-[#DFBB7D]">{trackCount} Tracks</span>
                </label>
                <span className="text-[11px] font-mono text-white/50">
                  (~{Math.round((trackCount * 3.5))} mins of music)
                </span>
              </div>
              <input
                type="range"
                min="6"
                max="30"
                step="1"
                value={trackCount}
                onChange={(e) => setTrackCount(parseInt(e.target.value, 10))}
                className="w-full accent-[#DFBB7D] cursor-pointer"
              />
            </div>
          </div>

          {/* Info callout */}
          <div className="p-3.5 rounded-xl bg-white/5 border border-white/10 text-[11px] font-mono text-white/70 flex items-start gap-2.5">
            <Radio className="w-4 h-4 text-[#DFBB7D] shrink-0 mt-0.5" />
            <div>
              <span className="font-bold text-white">Non-Destructive Coexistence: </span>
              This auto-creates a new curated playlist without disrupting your existing 7 playlists or the live airwave schedule. You can test it in the playlist deck and switch it on air whenever ready.
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-white/10 bg-[#1A1D24] flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 rounded-xl text-xs font-mono font-bold text-white/70 hover:text-white hover:bg-white/10 transition-all"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={loading || !customName.trim()}
            className="px-5 py-2.5 bg-[#DFBB7D] hover:bg-[#F2CE8A] text-[#16181D] text-xs font-mono font-black uppercase rounded-xl flex items-center gap-2 transition-all shadow-[2px_2px_0px_#000] disabled:opacity-50"
          >
            <Sparkles className="w-4 h-4" />
            {loading ? "Harmonizing Camelot Tracks..." : "Generate Harmonized Playlist"}
          </button>
        </div>
      </div>
    </div>
  );
}
