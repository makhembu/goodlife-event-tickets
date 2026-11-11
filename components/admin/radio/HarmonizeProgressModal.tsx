"use client";

import React, { useState, useRef } from "react";
import {
  Sparkles,
  X,
  Play,
  Pause,
  CheckCircle2,
  AlertCircle,
  Zap,
  Music2,
  Loader2,
} from "lucide-react";

interface HarmonizeProgressModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialUnindexedCount: number;
  onComplete: () => void;
}

interface AnalyzedItem {
  id: number;
  title: string;
  dj_name: string;
  bpm?: number;
  musical_key?: string;
}

export default function HarmonizeProgressModal({
  isOpen,
  onClose,
  initialUnindexedCount,
  onComplete,
}: HarmonizeProgressModalProps) {
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [processedCount, setProcessedCount] = useState(0);
  const [remainingCount, setRemainingCount] = useState(initialUnindexedCount);
  const [currentTrackTitle, setCurrentTrackTitle] = useState<string | null>(null);
  const [recentAnalyzed, setRecentAnalyzed] = useState<AnalyzedItem[]>([]);
  const [isDone, setIsDone] = useState(false);

  const pauseRef = useRef(false);
  const runningRef = useRef(false);

  if (!isOpen) return null;

  const total = processedCount + remainingCount;
  const progressPercent = total > 0 ? Math.min(100, Math.round((processedCount / total) * 100)) : 0;

  const startOrResumeHarmonizing = async () => {
    pauseRef.current = false;
    runningRef.current = true;
    setIsRunning(true);
    setIsPaused(false);

    let currentRemaining = remainingCount;
    let localProcessed = processedCount;

    while (runningRef.current && !pauseRef.current && currentRemaining > 0) {
      try {
        const res = await fetch("/api/admin/radio/library/harmonize-batch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ limit: 8 }),
        });

        if (!res.ok) {
          throw new Error(`Batch failed with status ${res.status}`);
        }

        const data = await res.json();
        if (!data.success) {
          throw new Error(data.error || "Batch harmonization failed");
        }

        if (data.done || !data.batch || data.batch.length === 0) {
          setIsDone(true);
          setRemainingCount(0);
          break;
        }

        const batch: AnalyzedItem[] = data.batch;
        localProcessed += batch.length;
        currentRemaining = data.remaining;

        setProcessedCount(localProcessed);
        setRemainingCount(currentRemaining);
        setCurrentTrackTitle(batch[batch.length - 1]?.title || null);
        setRecentAnalyzed((prev) => [...batch, ...prev].slice(0, 8));

        if (data.done || currentRemaining <= 0) {
          setIsDone(true);
          break;
        }
      } catch (err) {
        console.error("Harmonization loop error:", err);
        break;
      }
    }

    runningRef.current = false;
    setIsRunning(false);
    onComplete();
  };

  const handlePause = () => {
    pauseRef.current = true;
    runningRef.current = false;
    setIsPaused(true);
    setIsRunning(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-[#16181D] border-2 border-[#DFBB7D] rounded-2xl w-full max-w-xl shadow-[8px_8px_0px_#000] overflow-hidden flex flex-col font-mono">
        {/* Header */}
        <div className="p-5 border-b border-white/10 flex items-center justify-between bg-[#1A1D24]">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#DFBB7D]/10 border border-[#DFBB7D]/30 flex items-center justify-center text-[#DFBB7D]">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-black uppercase text-white tracking-wider flex items-center gap-2">
                Harmonic Camelot & BPM Indexer
                <span className="text-[10px] px-2 py-0.5 rounded bg-[#DFBB7D] text-[#16181D] font-bold">
                  AUDIO INTELLIGENCE
                </span>
              </h3>
              <p className="text-xs text-white/50">
                Detects musical keys (Camelot wheel) and tempo across festival audio files
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              handlePause();
              onClose();
            }}
            className="p-1.5 rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5">
          {/* Progress Counters Card */}
          <div className="p-4 bg-black/40 rounded-xl border border-white/10 space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="text-white/60">Indexing Progress:</span>
              <span className="font-bold text-[#DFBB7D]">
                {processedCount} of {total} indexed ({progressPercent}%)
              </span>
            </div>

            {/* Progress Bar */}
            <div className="w-full h-3 bg-white/10 rounded-full overflow-hidden p-0.5 border border-white/10">
              <div
                className="h-full bg-gradient-to-r from-[#DFBB7D] to-[#F2CE8A] rounded-full transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>

            <div className="flex items-center justify-between text-[11px] text-white/50">
              <span>Remaining: <strong className="text-white">{remainingCount}</strong> tracks</span>
              <span>{isRunning ? "⚡ Ingesting audio & analyzing..." : isPaused ? "⏸ Paused" : isDone ? "✓ Complete" : "Ready"}</span>
            </div>
          </div>

          {/* Current track indicator */}
          {isRunning && currentTrackTitle && (
            <div className="p-3 rounded-xl bg-[#DFBB7D]/10 border border-[#DFBB7D]/30 flex items-center gap-2.5 text-xs text-[#DFBB7D]">
              <Loader2 className="w-4 h-4 animate-spin shrink-0" />
              <div className="truncate">
                <span className="text-white/50">Analyzing:</span>{" "}
                <span className="font-bold text-white">{currentTrackTitle}</span>
              </div>
            </div>
          )}

          {/* Activity Log */}
          <div className="space-y-1.5">
            <div className="text-[10px] uppercase font-bold text-white/40 tracking-wider">
              Recently Harmonized Tracks
            </div>
            <div className="max-h-36 overflow-y-auto rounded-xl bg-[#121316] border border-white/10 divide-y divide-white/5 text-xs">
              {recentAnalyzed.length === 0 ? (
                <div className="p-4 text-center text-white/40 text-[11px]">
                  Click "Start Indexing" to begin harmonizing unindexed festival tracks.
                </div>
              ) : (
                recentAnalyzed.map((t) => (
                  <div key={t.id} className="p-2 flex items-center justify-between">
                    <div className="truncate flex-1 pr-2">
                      <span className="text-white font-bold">{t.title}</span>
                      <span className="text-white/40 ml-2">by {t.dj_name}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 text-[11px]">
                      <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30">
                        {t.musical_key || "8A"}
                      </span>
                      <span className="text-[#DFBB7D]">{t.bpm || 120} BPM</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-[#1A1D24] border-t border-white/10 flex items-center justify-between">
          <button
            type="button"
            onClick={() => {
              handlePause();
              onClose();
            }}
            className="px-4 py-2 text-xs font-bold text-white/60 hover:text-white"
          >
            {isDone ? "Done" : "Close"}
          </button>

          <div className="flex items-center gap-2">
            {isRunning ? (
              <button
                type="button"
                onClick={handlePause}
                className="px-4 py-2 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 rounded-xl text-xs font-bold uppercase flex items-center gap-1.5 transition-all"
              >
                <Pause className="w-3.5 h-3.5" />
                Pause
              </button>
            ) : (
              <button
                type="button"
                onClick={startOrResumeHarmonizing}
                disabled={remainingCount === 0}
                className="px-5 py-2.5 bg-[#DFBB7D] hover:bg-[#F2CE8A] text-[#16181D] rounded-xl text-xs font-black uppercase flex items-center gap-2 shadow-[2px_2px_0px_#000] transition-all disabled:opacity-50"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                {isPaused ? "Resume Indexing" : "Start Indexing"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
