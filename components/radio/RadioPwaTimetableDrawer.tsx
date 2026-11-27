"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { Calendar, Clock, Globe, X, Radio, RefreshCw } from "lucide-react";

interface SlotData {
  id: number;
  starts_at: string;
  ends_at: string;
  status: string;
  show?: {
    id: number;
    title: string;
    genre?: string;
  };
  presenter?: {
    id: number;
    dj_name: string;
  };
  substitute_presenter?: {
    id: number;
    dj_name: string;
  } | null;
}

interface RadioPwaTimetableDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

const WEEKDAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"] as const;

function getTodayEatDayIndex(): number {
  const eatNow = new Date(Date.now() + 3 * 3600 * 1000);
  return (eatNow.getUTCDay() + 6) % 7;
}

export default function RadioPwaTimetableDrawer({
  isOpen,
  onClose,
}: RadioPwaTimetableDrawerProps) {
  const [slots, setSlots] = useState<SlotData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [useLocalTime, setUseLocalTime] = useState(false);
  const [activeDayIndex, setActiveDayIndex] = useState<number>(getTodayEatDayIndex);
  const hasFetchedRef = useRef(false);

  const loadSchedule = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/radio/schedule");
      if (!res.ok) throw new Error("Could not load timetable");
      const data = await res.json();
      setSlots(Array.isArray(data.slots) ? data.slots : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load timetable");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen && !hasFetchedRef.current) {
      hasFetchedRef.current = true;
      loadSchedule();
    }
  }, [isOpen, loadSchedule]);

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    if (useLocalTime) {
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
    }
    return d.toLocaleTimeString("en-KE", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "Africa/Nairobi",
    });
  };

  const slotsByDay = useMemo(() => {
    const groups: SlotData[][] = Array.from({ length: 7 }, () => []);
    slots.forEach((slot) => {
      const d = new Date(slot.starts_at);
      const dayIdx = useLocalTime
        ? (d.getDay() + 6) % 7
        : (new Date(d.getTime() + 3 * 3600 * 1000).getUTCDay() + 6) % 7;
      if (dayIdx >= 0 && dayIdx < 7) {
        groups[dayIdx].push(slot);
      }
    });
    return groups;
  }, [slots, useLocalTime]);

  if (!isOpen) return null;

  const daySlots = slotsByDay[activeDayIndex] || [];
  const nowMs = Date.now();
  const tzLabel = useLocalTime ? "LOCAL" : "EAT";

  return (
    <div
      className="absolute inset-0 z-40 bg-[#16181D]/60 flex items-end md:items-center md:justify-center md:p-6"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Station Timetable"
    >
      <div
        className="w-full md:max-w-2xl bg-[#F3ECE1] border-t-4 md:border-4 border-[#16181D] max-h-[82dvh] flex flex-col md:shadow-[0_20px_60px_rgba(0,0,0,0.8)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drawer Header */}
        <div className="bg-[#FBF9F6] border-b-4 border-[#16181D] px-4 py-3 flex items-center justify-between gap-2 shrink-0">
          <div className="min-w-0">
            <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-[#7A5A1F] flex items-center gap-1.5">
              <Calendar className="w-3 h-3" />
              <span>WEEKLY SCHEDULE ({tzLabel})</span>
            </span>
            <h3 className="font-display text-2xl leading-none uppercase tracking-wide mt-0.5">
              STATION TIMETABLE
            </h3>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setUseLocalTime((v) => !v)}
              className="px-2.5 py-1.5 bg-[#F3ECE1] hover:bg-[#DFBB7D] border-2 border-[#16181D] font-mono text-[10px] font-bold uppercase flex items-center gap-1 cursor-pointer transition-colors"
              title="Switch between East Africa Time and your local timezone"
            >
              <Globe className="w-3 h-3" />
              <span>{tzLabel}</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-2.5 py-1.5 bg-[#FBF9F6] hover:bg-[#F5C842] border-2 border-[#16181D] font-mono text-[10px] font-bold uppercase flex items-center gap-1 cursor-pointer transition-colors"
            >
              <X className="w-3.5 h-3.5" />
              <span>CLOSE</span>
            </button>
          </div>
        </div>

        {/* Weekday Selector Strip */}
        <div className="bg-[#FBF9F6] border-b-3 border-[#16181D] px-3 py-2 grid grid-cols-7 gap-1.5 shrink-0">
          {WEEKDAYS.map((day, idx) => {
            const isSelected = idx === activeDayIndex;
            const hasShows = (slotsByDay[idx]?.length || 0) > 0;
            return (
              <button
                key={day}
                type="button"
                onClick={() => setActiveDayIndex(idx)}
                className={`py-1.5 border-2 border-[#16181D] font-mono text-[10px] font-bold uppercase flex flex-col items-center justify-center gap-0.5 cursor-pointer transition-colors ${
                  isSelected
                    ? "bg-[#F5C842] text-[#16181D] shadow-[2px_2px_0_#16181D]"
                    : "bg-[#F3ECE1] text-[#16181D] hover:bg-[#DFBB7D]"
                }`}
              >
                <span>{day}</span>
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    hasShows ? (isSelected ? "bg-[#16181D]" : "bg-[#E84855]") : "bg-transparent"
                  }`}
                />
              </button>
            );
          })}
        </div>

        {/* Schedule List */}
        <div className="flex-1 overflow-y-auto p-3.5 space-y-2.5 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          {loading ? (
            <div className="space-y-2.5">
              {[1, 2, 3].map((n) => (
                <div
                  key={n}
                  className="h-20 bg-[#FBF9F6] border-3 border-[#16181D] animate-pulse motion-reduce:animate-none"
                />
              ))}
            </div>
          ) : error ? (
            <div className="bg-[#FADBD8] border-3 border-[#16181D] p-3.5 flex items-center justify-between gap-3">
              <span className="font-mono text-xs font-bold text-[#16181D]">{error}</span>
              <button
                type="button"
                onClick={loadSchedule}
                className="px-3 py-1.5 bg-[#FBF9F6] border-2 border-[#16181D] font-mono text-[11px] font-bold uppercase flex items-center gap-1 cursor-pointer shrink-0"
              >
                <RefreshCw className="w-3 h-3" />
                <span>RETRY</span>
              </button>
            </div>
          ) : daySlots.length === 0 ? (
            <div className="bg-[#FBF9F6] border-3 border-[#16181D] shadow-[3px_3px_0_#16181D] p-4 text-center space-y-1.5">
              <Radio className="w-5 h-5 mx-auto text-[#7A5A1F]" />
              <p className="font-display text-xl uppercase tracking-wide">
                24/7 GOODLIFE AUTOPLAY
              </p>
              <p className="font-mono text-[11px] text-[#2A2C33]">
                No live hosted shows scheduled for {WEEKDAYS[activeDayIndex]} — nonstop Afrobeats &amp; Amapiano mixes all day.
              </p>
            </div>
          ) : (
            daySlots.map((slot) => {
              const startMs = new Date(slot.starts_at).getTime();
              const endMs = new Date(slot.ends_at).getTime();
              const isLiveNow = nowMs >= startMs && nowMs <= endMs;
              const hostName =
                slot.substitute_presenter?.dj_name ||
                slot.presenter?.dj_name ||
                "GOODLIFE DJ";

              return (
                <div
                  key={slot.id}
                  className={`border-3 border-[#16181D] shadow-[3px_3px_0_#16181D] p-3 flex flex-col gap-1.5 ${
                    isLiveNow ? "bg-[#F5C842]" : "bg-[#FBF9F6]"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[11px] font-bold uppercase flex items-center gap-1.5 text-[#16181D]">
                      <Clock className="w-3 h-3" />
                      <span>
                        {formatTime(slot.starts_at)} — {formatTime(slot.ends_at)} {tzLabel}
                      </span>
                    </span>
                    {isLiveNow ? (
                      <span className="px-2 py-0.5 bg-[#E84855] text-white border-2 border-[#16181D] font-mono text-[10px] font-bold uppercase flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                        <span>LIVE NOW</span>
                      </span>
                    ) : slot.show?.genre ? (
                      <span className="px-2 py-0.5 bg-[#F3ECE1] border border-[#16181D] font-mono text-[10px] font-bold uppercase">
                        {slot.show.genre}
                      </span>
                    ) : null}
                  </div>

                  <div className="font-display text-xl leading-none uppercase tracking-wide">
                    {slot.show?.title || "GOODLIFE LIVE SESSION"}
                  </div>

                  <div className="font-mono text-[11px] font-bold text-[#2A2C33] uppercase">
                    HOST: {hostName}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
