"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Clock, Trash2, FastForward, AlertCircle, RefreshCw, ChevronUp, ChevronDown, Music, Volume2 } from "lucide-react";

export interface ScheduledItem {
  id: number;
  target_type: "track" | "drop";
  target_id?: string;
  title: string;
  artist_or_persona?: string;
  audio_url: string;
  cover_url?: string;
  duration_sec?: number;
  trigger_type: "clock_soft" | "clock_duck" | "song_cue" | "next_transition";
  scheduled_for?: string;
  cue_offset_sec?: number;
  parent_track_id?: string;
  recurrence: string;
  status: string;
  created_at: string;
  remaining_sec?: number;
}

export interface ScheduledCueDockProps {
  onForcePlayNow?: (item: ScheduledItem) => void;
  className?: string;
}

export default function ScheduledCueDock({ onForcePlayNow, className = "" }: ScheduledCueDockProps) {
  const [schedules, setSchedules] = useState<ScheduledItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<number>(Date.now());
  const [actionInProgress, setActionInProgress] = useState<number | null>(null);

  const fetchSchedules = useCallback(async () => {
    try {
      const res = await fetch("/api/radio/schedules", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data.schedules)) {
        setSchedules(data.schedules);
        setLastUpdated(Date.now());
      }
    } catch (err) {
      console.warn("[ScheduledCueDock] Fetch error:", err);
    }
  }, []);

  // Poll every 10 seconds for updated countdowns
  useEffect(() => {
    fetchSchedules();
    const interval = setInterval(fetchSchedules, 10000);
    return () => clearInterval(interval);
  }, [fetchSchedules]);

  // Handle immediate cancellation / removal
  const handleCancel = async (id: number) => {
    setActionInProgress(id);
    try {
      const res = await fetch(`/api/radio/schedules/${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setSchedules((prev) => prev.filter((s) => s.id !== id));
      }
    } catch (err) {
      console.error("[ScheduledCueDock] Cancel error:", err);
    } finally {
      setActionInProgress(null);
    }
  };

  // Handle postpone (+15 mins)
  const handlePostpone = async (id: number) => {
    setActionInProgress(id);
    try {
      const res = await fetch(`/api/radio/schedules/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "postpone", postpone_minutes: 15 }),
      });
      if (res.ok) {
        fetchSchedules();
      }
    } catch (err) {
      console.error("[ScheduledCueDock] Postpone error:", err);
    } finally {
      setActionInProgress(null);
    }
  };

  // Helper to format remaining time
  const formatRemaining = (targetTime?: string, remSec?: number) => {
    if (!targetTime) return "On Cue / Next";
    const diffSec = remSec !== undefined ? remSec : Math.floor((new Date(targetTime).getTime() - Date.now()) / 1000);
    if (diffSec <= 0) return "Due Now (Soft Queue)";
    const hrs = Math.floor(diffSec / 3600);
    const mins = Math.floor((diffSec % 3600) / 60);
    const secs = diffSec % 60;
    if (hrs > 0) return `in ${hrs}h ${mins}m`;
    if (mins > 0) return `in ${mins}m ${secs}s`;
    return `in ${secs}s`;
  };

  if (schedules.length === 0) {
    return null; // Inert when no items are scheduled
  }

  return (
    <div className={`bg-[#121316] border-2 border-[#F5C842]/40 font-mono shadow-[4px_4px_0px_#000] text-white ${className}`}>
      {/* Dock Bar / Collapsible Header */}
      <div
        onClick={() => setIsExpanded(!isExpanded)}
        className="p-2.5 px-3 bg-[#16181D] hover:bg-[#1C1F26] cursor-pointer flex items-center justify-between border-b border-white/10 select-none"
      >
        <div className="flex items-center space-x-2">
          <div className="w-2.5 h-2.5 rounded-full bg-[#F5C842] animate-pulse" />
          <span className="font-bold uppercase tracking-wider text-xs text-[#F5C842]">
            Scheduled Run of Show ({schedules.length})
          </span>
          <span className="text-[10px] text-white/50 hidden sm:inline">
            Next: {schedules[0].title} ({formatRemaining(schedules[0].scheduled_for, schedules[0].remaining_sec)})
          </span>
        </div>
        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              fetchSchedules();
            }}
            className="p-1 text-white/40 hover:text-white"
            title="Refresh Schedules"
          >
            <RefreshCw className="w-3 h-3" />
          </button>
          {isExpanded ? <ChevronDown className="w-4 h-4 text-white/60" /> : <ChevronUp className="w-4 h-4 text-white/60" />}
        </div>
      </div>

      {/* Expanded Scheduled List */}
      {isExpanded && (
        <div className="p-2 divide-y divide-white/10 max-h-64 overflow-y-auto">
          {schedules.map((item) => (
            <div key={item.id} className="py-2 px-1 flex items-center justify-between gap-3 text-xs">
              <div className="flex items-center space-x-2.5 min-w-0">
                <div
                  className={`w-7 h-7 shrink-0 border flex items-center justify-center ${
                    item.target_type === "track"
                      ? "bg-[#DFBB7D]/10 border-[#DFBB7D]/40 text-[#DFBB7D]"
                      : "bg-[#E84855]/10 border-[#E84855]/40 text-[#E84855]"
                  }`}
                >
                  {item.target_type === "track" ? <Music className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                </div>
                <div className="min-w-0">
                  <p className="font-bold truncate text-white text-[11px] leading-tight">{item.title}</p>
                  <div className="flex items-center space-x-2 text-[10px] text-white/50 mt-0.5">
                    <span className="text-[#F5C842] font-semibold">
                      {formatRemaining(item.scheduled_for, item.remaining_sec)}
                    </span>
                    <span>•</span>
                    <span className="uppercase text-[9px] tracking-wider px-1 bg-white/10 text-white/80">
                      {item.trigger_type.replace("_", " ")}
                    </span>
                    {item.recurrence !== "once" && (
                      <span className="text-[#DFBB7D] text-[9px] uppercase">({item.recurrence})</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center space-x-1.5 shrink-0">
                {onForcePlayNow && (
                  <button
                    type="button"
                    onClick={() => onForcePlayNow(item)}
                    title="Force Play Right Now"
                    className="p-1 px-1.5 bg-[#DFBB7D] hover:bg-[#F5C842] text-black font-bold text-[10px] flex items-center space-x-1"
                  >
                    <FastForward className="w-3 h-3" />
                    <span className="hidden sm:inline">AIR NOW</span>
                  </button>
                )}
                {item.trigger_type.startsWith("clock") && (
                  <button
                    type="button"
                    onClick={() => handlePostpone(item.id)}
                    disabled={actionInProgress === item.id}
                    title="Postpone by 15 minutes"
                    className="p-1 px-1.5 bg-white/10 hover:bg-white/20 text-white/80 text-[10px]"
                  >
                    +15M
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => handleCancel(item.id)}
                  disabled={actionInProgress === item.id}
                  title="Remove from Schedule"
                  className="p-1 px-1.5 bg-red-950/60 hover:bg-red-900 border border-red-800 text-red-200 text-[10px] flex items-center space-x-1"
                >
                  <Trash2 className="w-3 h-3" />
                  <span className="hidden sm:inline">REMOVE</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
