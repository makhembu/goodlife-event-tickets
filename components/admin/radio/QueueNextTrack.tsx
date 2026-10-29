"use client";

import React, { useState } from "react";
import { Sparkles, ArrowRight, CheckCircle2, AlertCircle, RefreshCw, Music2, Radio, Zap } from "lucide-react";
import { formatTrackTitle } from "@/lib/radio/media-helpers";

export default function QueueNextTrack() {
  const [trackUrl, setTrackUrl] = useState("");
  const [voicePreference, setVoicePreference] = useState<"male" | "female">("male");
  const [includeIntroDrop, setIncludeIntroDrop] = useState(true);
  const [loading, setLoading] = useState(false);
  const [actionType, setActionType] = useState<"queue" | "play_now">("queue");
  const [result, setResult] = useState<{
    artist: string;
    title: string;
    drop_script: string;
    queued: boolean;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleAction = async (action: "queue" | "play_now") => {
    if (!trackUrl.trim()) return;

    setActionType(action);
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch("/api/admin/radio/queue-next", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: trackUrl.trim(),
          voice_preference: voicePreference,
          include_intro_drop: includeIntroDrop,
          play_now: action === "play_now",
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `Server error (${res.status})`);
      }

      setResult({
        artist: data.artist || "Goodlife Ingest",
        title: data.title || "Track Added",
        drop_script: data.drop_script || "",
        queued: Boolean(data.queued_as_up_next),
      });
      setTrackUrl("");
    } catch (err: any) {
      setError(err.message || "Failed to insert track into queue.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-[#16181D] text-[#FBF9F6] border-2 border-[#16181D] p-4 shadow-[4px_4px_0px_#DFBB7D] space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 pb-3">
        <div className="flex items-center space-x-2">
          <div className="p-1.5 bg-[#DFBB7D] text-[#16181D] font-bold">
            <Zap className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-mono text-sm font-bold tracking-wider uppercase text-white">
              QUICK INSERT TRACK · ON THE FLY
            </h3>
            <p className="text-[11px] font-mono text-[#DFBB7D]">
              Paste YouTube or audio link · Auto-master Sheng intro · Queue or Cut
            </p>
          </div>
        </div>
      </div>

      {/* Messages */}
      {error && (
        <div className="p-2.5 bg-[#E84855]/20 border border-[#E84855] text-red-200 font-mono text-xs flex items-center justify-between">
          <div className="flex items-center space-x-1.5">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-white/60 hover:text-white">
            ×
          </button>
        </div>
      )}

      {result && (
        <div className="p-3 bg-[#10B981]/20 border border-[#10B981] text-emerald-200 font-mono text-xs space-y-1.5">
          <div className="flex items-center space-x-1.5 font-bold">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>✓ Track successfully ingested!</span>
          </div>
          <div className="bg-black/30 p-2 border border-emerald-500/30 text-[11px]">
            <p><span className="text-emerald-400 font-bold">Track:</span> {result.artist} - {formatTrackTitle(result.title)}</p>
            {result.drop_script && (
              <p className="text-white/80 mt-1 italic">&ldquo;{result.drop_script}&rdquo;</p>
            )}
          </div>
        </div>
      )}

      {/* Input Form */}
      <div className="space-y-3 font-mono text-xs">
        <div>
          <label className="block text-[11px] text-white/60 uppercase tracking-wider mb-1">
            Media URL (YouTube, SoundCloud, or Direct Audio):
          </label>
          <div className="flex items-center space-x-2">
            <input
              type="url"
              value={trackUrl}
              onChange={(e) => setTrackUrl(e.target.value)}
              placeholder="https://www.youtube.com/watch?v=..."
              className="flex-1 bg-[#1A1D24] text-white p-2.5 border border-white/20 focus:border-[#DFBB7D] focus:outline-none"
            />
          </div>
        </div>

        {/* Options Row */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[11px]">
          <label className="flex items-center space-x-2 cursor-pointer select-none text-white/80">
            <input
              type="checkbox"
              checked={includeIntroDrop}
              onChange={(e) => setIncludeIntroDrop(e.target.checked)}
              className="accent-[#DFBB7D] w-3.5 h-3.5"
            />
            <span>Auto-generate Sheng Intro Drop (-12dB Ducking)</span>
          </label>

          <div className="flex items-center space-x-1 text-white/60">
            <span>Voice:</span>
            <button
              type="button"
              onClick={() => setVoicePreference("male")}
              className={`px-2 py-0.5 border ${
                voicePreference === "male"
                  ? "bg-[#DFBB7D] text-[#16181D] font-bold border-[#DFBB7D]"
                  : "bg-white/5 text-white/60 border-white/10"
              }`}
            >
              Male (Shax)
            </button>
            <button
              type="button"
              onClick={() => setVoicePreference("female")}
              className={`px-2 py-0.5 border ${
                voicePreference === "female"
                  ? "bg-[#DFBB7D] text-[#16181D] font-bold border-[#DFBB7D]"
                  : "bg-white/5 text-white/60 border-white/10"
              }`}
            >
              Female (Amina)
            </button>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center justify-end gap-2.5 pt-2">
          <button
            type="button"
            onClick={() => handleAction("queue")}
            disabled={loading || !trackUrl.trim()}
            className="px-4 py-2 bg-[#DFBB7D] hover:bg-[#F5C842] text-[#16181D] font-bold border border-[#16181D] flex items-center space-x-1.5 shadow-[2px_2px_0px_#16181D]"
          >
            <Music2 className="w-3.5 h-3.5" />
            <span>{loading && actionType === "queue" ? "INGESTING..." : "▶ QUEUE AS UP NEXT"}</span>
          </button>

          <button
            type="button"
            onClick={() => handleAction("play_now")}
            disabled={loading || !trackUrl.trim()}
            className="px-4 py-2 bg-[#E84855] hover:bg-red-600 text-white font-bold border border-white/20 flex items-center space-x-1.5 shadow-[2px_2px_0px_#DFBB7D]"
          >
            <Radio className="w-3.5 h-3.5 animate-pulse" />
            <span>{loading && actionType === "play_now" ? "INGESTING..." : "⚡ PLAY NOW (CROSSFADE)"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
