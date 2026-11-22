"use client";

import React, { useState } from "react";
import { Clock, Calendar, AlertCircle, X, Check, Volume2, Music, Radio, Repeat } from "lucide-react";

export interface ScheduleItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetType: "track" | "drop";
  targetId?: string | number;
  title: string;
  artistOrPersona?: string;
  audioUrl: string;
  coverUrl?: string;
  durationSec?: number;
  currentTrackId?: string;
  currentTrackTitle?: string;
  onScheduledSuccess?: (schedule: any) => void;
}

export default function ScheduleItemModal({
  isOpen,
  onClose,
  targetType,
  targetId,
  title,
  artistOrPersona,
  audioUrl,
  coverUrl,
  durationSec,
  currentTrackId,
  currentTrackTitle,
  onScheduledSuccess,
}: ScheduleItemModalProps) {
  const [triggerType, setTriggerType] = useState<"clock_soft" | "clock_duck" | "song_cue" | "next_transition">(
    targetType === "track" ? "clock_soft" : "clock_duck"
  );
  const [presetHours, setPresetHours] = useState<number | null>(4);
  const [customDateTime, setCustomDateTime] = useState<string>("");
  const [cueOffsetSec, setCueOffsetSec] = useState<number>(15);
  const [cueMode, setCueMode] = useState<"intro" | "outro">("outro");
  const [recurrence, setRecurrence] = useState<"once" | "hourly" | "daily" | "weekly">("once");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  // Calculate target preview time
  const getComputedTargetTime = (): Date | null => {
    if (triggerType === "next_transition" || triggerType === "song_cue") return null;
    if (presetHours !== null) {
      return new Date(Date.now() + presetHours * 3600 * 1000);
    }
    if (customDateTime) {
      const d = new Date(customDateTime);
      return isNaN(d.getTime()) ? null : d;
    }
    return null;
  };

  const computedTarget = getComputedTargetTime();

  const handlePresetSelect = (hrs: number) => {
    setPresetHours(hrs);
    setCustomDateTime("");
  };

  const handleCustomDateTimeChange = (val: string) => {
    setCustomDateTime(val);
    setPresetHours(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      let targetTimeIso: string | null = null;
      if (triggerType === "clock_soft" || triggerType === "clock_duck") {
        const targetDate = computedTarget;
        if (!targetDate || targetDate.getTime() <= Date.now()) {
          setError("Please select a valid future time.");
          setLoading(false);
          return;
        }
        targetTimeIso = targetDate.toISOString();
      }

      const res = await fetch("/api/radio/schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target_type: targetType,
          target_id: targetId ? String(targetId) : null,
          title,
          artist_or_persona: artistOrPersona,
          audio_url: audioUrl,
          cover_url: coverUrl,
          duration_sec: durationSec || 0,
          trigger_type: triggerType,
          scheduled_for: targetTimeIso,
          cue_offset_sec: triggerType === "song_cue" ? (cueMode === "outro" ? -Math.abs(cueOffsetSec) : Math.abs(cueOffsetSec)) : null,
          parent_track_id: triggerType === "song_cue" ? (currentTrackId || null) : null,
          recurrence,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Failed to schedule item");
      }

      if (onScheduledSuccess) {
        onScheduledSuccess(data.schedule);
      }
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to schedule item");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#121316] border-2 border-white/20 text-white w-full max-w-lg shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10 bg-[#16181D]">
          <div className="flex items-center space-x-2">
            <Clock className="w-5 h-5 text-[#F5C842]" />
            <h2 className="font-mono font-bold uppercase tracking-wider text-sm">
              Schedule {targetType === "track" ? "Song" : "Soundboard Drop"}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-white/60 hover:text-white hover:bg-white/10 rounded transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="p-5 overflow-y-auto space-y-5 font-mono text-xs">
          {/* Item Preview Card */}
          <div className="p-3 bg-white/5 border border-white/10 flex items-center space-x-3">
            <div className="w-10 h-10 bg-[#16181D] border border-white/20 flex items-center justify-center shrink-0">
              {targetType === "track" ? (
                <Music className="w-5 h-5 text-[#DFBB7D]" />
              ) : (
                <Volume2 className="w-5 h-5 text-[#E84855]" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-bold text-white truncate text-sm">{title}</p>
              {artistOrPersona && <p className="text-white/60 text-xs truncate">{artistOrPersona}</p>}
            </div>
          </div>

          {/* Trigger Type Selection */}
          <div className="space-y-2">
            <label className="text-white/70 block uppercase font-bold text-[11px]">
              How should this trigger?
            </label>
            <div className="grid grid-cols-2 gap-2">
              {targetType === "track" ? (
                <>
                  <button
                    type="button"
                    onClick={() => setTriggerType("clock_soft")}
                    className={`p-2.5 border text-left flex flex-col justify-between ${
                      triggerType === "clock_soft"
                        ? "bg-[#DFBB7D] text-black border-white font-bold"
                        : "bg-white/5 border-white/10 text-white/70 hover:bg-white/10"
                    }`}
                  >
                    <span className="font-bold">Clock Time (Soft Queue)</span>
                    <span className="text-[10px] opacity-80 mt-1">Waits for current song to end, then crossfades in</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setTriggerType("next_transition")}
                    className={`p-2.5 border text-left flex flex-col justify-between ${
                      triggerType === "next_transition"
                        ? "bg-[#DFBB7D] text-black border-white font-bold"
                        : "bg-white/5 border-white/10 text-white/70 hover:bg-white/10"
                    }`}
                  >
                    <span className="font-bold">Next Track Up</span>
                    <span className="text-[10px] opacity-80 mt-1">Queues at position 0 right now</span>
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setTriggerType("clock_duck")}
                    className={`p-2.5 border text-left flex flex-col justify-between ${
                      triggerType === "clock_duck"
                        ? "bg-[#E84855] text-white border-white font-bold"
                        : "bg-white/5 border-white/10 text-white/70 hover:bg-white/10"
                    }`}
                  >
                    <span className="font-bold">Clock Time (Ducked)</span>
                    <span className="text-[10px] opacity-80 mt-1">Ducks music to ~25% and airs over live track</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setTriggerType("next_transition")}
                    className={`p-2.5 border text-left flex flex-col justify-between ${
                      triggerType === "next_transition"
                        ? "bg-[#E84855] text-white border-white font-bold"
                        : "bg-white/5 border-white/10 text-white/70 hover:bg-white/10"
                    }`}
                  >
                    <span className="font-bold">Next Song Transition</span>
                    <span className="text-[10px] opacity-80 mt-1">Fires in the talkover bed during next track change</span>
                  </button>
                </>
              )}
            </div>
            {targetType === "drop" && (
              <button
                type="button"
                onClick={() => setTriggerType("song_cue")}
                className={`w-full p-2.5 border text-left flex flex-col mt-2 ${
                  triggerType === "song_cue"
                    ? "bg-[#E84855] text-white border-white font-bold"
                    : "bg-white/5 border-white/10 text-white/70 hover:bg-white/10"
                }`}
              >
                <span className="font-bold">Attach to Specific Song Cue</span>
                <span className="text-[10px] opacity-80 mt-0.5">
                  Fires automatically inside {currentTrackTitle ? `"${currentTrackTitle}"` : "the active track"}
                </span>
              </button>
            )}
          </div>

          {/* Clock Time Presets */}
          {(triggerType === "clock_soft" || triggerType === "clock_duck") && (
            <div className="space-y-3 p-3 bg-black/40 border border-white/10">
              <label className="text-white/70 block uppercase font-bold text-[11px]">
                Quick Presets:
              </label>
              <div className="grid grid-cols-4 gap-2">
                {[
                  { label: "+30m", val: 0.5 },
                  { label: "+1h", val: 1 },
                  { label: "+2h", val: 2 },
                  { label: "+4h", val: 4 },
                ].map((p) => (
                  <button
                    key={p.val}
                    type="button"
                    onClick={() => handlePresetSelect(p.val)}
                    className={`py-2 px-1 text-center font-bold border transition-colors ${
                      presetHours === p.val
                        ? "bg-[#F5C842] text-black border-white shadow-[2px_2px_0px_#fff]"
                        : "bg-white/5 border-white/10 text-white hover:bg-white/10"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              {/* Custom Date Time */}
              <div className="pt-2">
                <label className="text-white/50 block text-[10px] uppercase mb-1">
                  Or Custom Time (Nairobi EAT / Local):
                </label>
                <div className="flex items-center space-x-2">
                  <Calendar className="w-4 h-4 text-white/40 shrink-0" />
                  <input
                    type="datetime-local"
                    value={customDateTime}
                    onChange={(e) => handleCustomDateTimeChange(e.target.value)}
                    className="flex-1 bg-black/60 border border-white/20 p-2 text-white focus:border-[#F5C842] outline-none"
                  />
                </div>
              </div>

              {/* Recurrence Option */}
              <div className="pt-2 border-t border-white/10 flex items-center justify-between">
                <div className="flex items-center space-x-1.5 text-white/70">
                  <Repeat className="w-3.5 h-3.5 text-[#F5C842]" />
                  <span className="text-[11px] font-bold uppercase">Repeat:</span>
                </div>
                <select
                  value={recurrence}
                  onChange={(e) => setRecurrence(e.target.value as any)}
                  className="bg-black border border-white/20 p-1 px-2 text-white text-[11px] outline-none"
                >
                  <option value="once">Once Only</option>
                  <option value="hourly">Every Hour</option>
                  <option value="daily">Every Day</option>
                  <option value="weekly">Every Week</option>
                </select>
              </div>
            </div>
          )}

          {/* Song Cue Settings */}
          {triggerType === "song_cue" && (
            <div className="space-y-3 p-3 bg-black/40 border border-white/10">
              <label className="text-white/70 block uppercase font-bold text-[11px]">
                Cue Marker Offset:
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setCueMode("outro")}
                  className={`p-2 border text-center font-bold ${
                    cueMode === "outro"
                      ? "bg-[#E84855] text-white border-white"
                      : "bg-white/5 border-white/10 text-white/60"
                  }`}
                >
                  During Outro Window (-15s)
                </button>
                <button
                  type="button"
                  onClick={() => setCueMode("intro")}
                  className={`p-2 border text-center font-bold ${
                    cueMode === "intro"
                      ? "bg-[#E84855] text-white border-white"
                      : "bg-white/5 border-white/10 text-white/60"
                  }`}
                >
                  During Song Intro (+X sec)
                </button>
              </div>
              <div className="flex items-center space-x-2 pt-2">
                <span className="text-white/60 text-[11px]">Seconds offset:</span>
                <input
                  type="number"
                  min="1"
                  max="300"
                  value={cueOffsetSec}
                  onChange={(e) => setCueOffsetSec(parseInt(e.target.value || "0", 10))}
                  className="w-20 bg-black/60 border border-white/20 p-1 px-2 text-white text-center outline-none"
                />
                <span className="text-white/40 text-[10px]">
                  {cueMode === "outro" ? "seconds before song ends" : "seconds after song begins"}
                </span>
              </div>
            </div>
          )}

          {/* Computed Target Preview Box */}
          {computedTarget && (
            <div className="p-3 bg-[#16181D] border-l-2 border-[#F5C842] text-[11px]">
              <p className="text-white/60 font-bold uppercase">Estimated Air Target:</p>
              <p className="text-[#F5C842] font-bold mt-0.5">
                {computedTarget.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })} EAT ·{" "}
                {computedTarget.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
              </p>
              <p className="text-white/50 text-[10px] mt-0.5">
                {targetType === "track"
                  ? "Non-destructive: Will crossfade in after current song naturally completes."
                  : "Music bed will duck automatically to ~25%."}
              </p>
            </div>
          )}

          {error && (
            <div className="p-2.5 bg-red-950/60 border border-red-500 text-red-200 flex items-center space-x-2 text-[11px]">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Modal Footer */}
          <div className="flex items-center justify-end space-x-3 pt-3 border-t border-white/10">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 border border-white/20 hover:bg-white/10 text-white/80 font-bold"
            >
              CANCEL
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2 bg-[#F5C842] hover:bg-amber-400 text-black font-bold border border-black flex items-center space-x-2 shadow-[2px_2px_0px_#fff]"
            >
              {loading ? (
                <span>SCHEDULING...</span>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  <span>CONFIRM SCHEDULE</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
