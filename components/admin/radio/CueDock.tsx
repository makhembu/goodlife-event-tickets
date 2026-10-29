"use client";

import React, { useState, useEffect, useRef } from "react";
import { Headphones, Play, Pause, Radio, ArrowRight, Check, Edit3, X, Sparkles } from "lucide-react";

export interface CueDropItem {
  id: string;
  title: string;
  script: string;
  audioUrl: string;
  persona?: string;
  duration?: number;
}

export interface CueDockProps {
  cueItem: CueDropItem | null;
  onClearCue: () => void;
  onFireOnAir: (item: CueDropItem) => void;
  onAssignToPad: (item: CueDropItem, padIndex: number) => void;
  onUpdateScript?: (newScript: string) => Promise<void>;
}

export default function CueDock({
  cueItem,
  onClearCue,
  onFireOnAir,
  onAssignToPad,
  onUpdateScript,
}: CueDockProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editedScript, setEditedScript] = useState("");
  const [selectedPad, setSelectedPad] = useState<number>(7); // Pad 8 (0-indexed 7)
  const [isRegenerating, setIsRegenerating] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (cueItem) {
      setEditedScript(cueItem.script);
      setIsPlaying(false);
    }
  }, [cueItem]);

  const handleTogglePreview = () => {
    if (!cueItem?.audioUrl) return;
    if (!audioRef.current) {
      audioRef.current = new Audio(cueItem.audioUrl);
      audioRef.current.onended = () => setIsPlaying(false);
    } else if (audioRef.current.src !== cueItem.audioUrl) {
      audioRef.current.src = cueItem.audioUrl;
    }

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
    }
  };

  const handleSaveAndReGenerate = async () => {
    if (!onUpdateScript || !editedScript.trim()) return;
    setIsRegenerating(true);
    try {
      await onUpdateScript(editedScript.trim());
      setIsEditing(false);
    } finally {
      setIsRegenerating(false);
    }
  };

  if (!cueItem) {
    return (
      <div className="bg-[#16181D]/5 border-2 border-dashed border-[#16181D]/20 p-4 rounded flex items-center justify-between text-[#16181D]/60 font-mono text-xs">
        <div className="flex items-center space-x-2">
          <Headphones className="w-4 h-4 text-[#DFBB7D]" />
          <span>CUE DOCK (PFL) STANDBY · Audition drops privately before airing</span>
        </div>
        <span className="text-[11px] text-[#16181D]/40">Generate or record a drop to load</span>
      </div>
    );
  }

  return (
    <div className="bg-[#16181D] text-[#FBF9F6] border-2 border-[#DFBB7D] p-4 shadow-[4px_4px_0px_#16181D] space-y-3">
      {/* Top Header */}
      <div className="flex items-center justify-between border-b border-white/10 pb-2">
        <div className="flex items-center space-x-2">
          <div className="p-1 bg-[#DFBB7D] text-[#16181D]">
            <Headphones className="w-4 h-4" />
          </div>
          <div>
            <h4 className="font-mono text-xs font-bold text-[#DFBB7D] uppercase tracking-wider">
              CUE DOCK · PRIVATE PRE-FADE LISTEN (PFL)
            </h4>
            <p className="text-[11px] text-white/70 truncate max-w-md">
              {cueItem.title} {cueItem.persona ? `· ${cueItem.persona}` : ""}
            </p>
          </div>
        </div>

        <button
          onClick={onClearCue}
          title="Dismiss Cue Item"
          className="text-white/50 hover:text-white p-1"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Script Text or Inline Edit */}
      {isEditing ? (
        <div className="space-y-2">
          <textarea
            value={editedScript}
            onChange={(e) => setEditedScript(e.target.value)}
            rows={2}
            className="w-full bg-[#1A1D24] text-white font-mono text-xs p-2 border border-[#DFBB7D] focus:outline-none resize-none"
            placeholder="Tweak phonetics or wording..."
          />
          <div className="flex items-center justify-end space-x-2">
            <button
              onClick={() => setIsEditing(false)}
              className="px-2 py-1 text-xs text-white/60 hover:text-white font-mono"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveAndReGenerate}
              disabled={isRegenerating}
              className="px-3 py-1 bg-[#DFBB7D] text-[#16181D] font-mono text-xs font-bold hover:bg-[#F5C842] flex items-center space-x-1"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>{isRegenerating ? "Re-synthesizing..." : "Re-generate Audio"}</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-white/5 p-2 border border-white/10 flex items-start justify-between">
          <p className="text-xs font-mono text-white/90 italic pr-2">
            &ldquo;{cueItem.script}&rdquo;
          </p>
          {onUpdateScript && (
            <button
              onClick={() => setIsEditing(true)}
              title="Tweak script / pronunciation"
              className="text-[#DFBB7D] hover:text-white shrink-0 p-1"
            >
              <Edit3 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      {/* Bottom Controls Strip */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1 font-mono text-xs">
        {/* Private Play/Pause */}
        <button
          onClick={handleTogglePreview}
          className={`px-3 py-1.5 border font-bold flex items-center space-x-1.5 transition-colors ${
            isPlaying
              ? "bg-[#F5C842] text-[#16181D] border-[#F5C842]"
              : "bg-white/10 text-white border-white/20 hover:border-white"
          }`}
        >
          {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
          <span>{isPlaying ? "PAUSE PREVIEW" : "PREVIEW IN EAR"}</span>
        </button>

        {/* Load to Pad Selector */}
        <div className="flex items-center space-x-1 bg-white/5 px-2 py-1 border border-white/10">
          <span className="text-white/60 text-[11px]">PAD:</span>
          <select
            value={selectedPad}
            onChange={(e) => setSelectedPad(parseInt(e.target.value))}
            className="bg-transparent text-[#DFBB7D] font-bold text-xs focus:outline-none"
          >
            {[...Array(8)].map((_, i) => (
              <option key={i} value={i} className="bg-[#16181D] text-white">
                Pad {i + 1}
              </option>
            ))}
          </select>
          <button
            onClick={() => onAssignToPad(cueItem, selectedPad)}
            title="Assign to Cartwall Pad"
            className="ml-1 text-white hover:text-[#DFBB7D] px-1 font-bold"
          >
            LOAD
          </button>
        </div>

        {/* Fire on Air Immediately */}
        <button
          onClick={() => onFireOnAir(cueItem)}
          className="px-4 py-1.5 bg-[#E84855] hover:bg-red-600 text-white font-bold border border-white/20 flex items-center space-x-1.5 shadow-[2px_2px_0px_#DFBB7D]"
        >
          <Radio className="w-3.5 h-3.5 animate-pulse" />
          <span>FIRE ON AIR (DUCK -12dB)</span>
        </button>
      </div>
    </div>
  );
}
