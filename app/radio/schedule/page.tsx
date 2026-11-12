"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { ArrowLeft, Clock, Calendar, Radio, Globe, CalendarPlus, ChevronRight } from "lucide-react";

interface SlotData {
  id: number;
  show_id: number;
  starts_at: string;
  ends_at: string;
  status: string;
  notes?: string | null;
  show: {
    id: number;
    title: string;
    slug: string;
    description?: string;
    genre: string;
    cover_image_url?: string;
  };
  presenter: {
    id: number;
    dj_name: string;
    slug: string;
    avatar_url?: string;
  };
  substitute_presenter?: {
    id: number;
    dj_name: string;
    slug: string;
    avatar_url?: string;
  } | null;
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function SchedulePage() {
  const [slots, setSlots] = useState<SlotData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [useLocalTime, setUseLocalTime] = useState(false);
  const [activeDayIndex, setActiveDayIndex] = useState<number>(0);

  useEffect(() => {
    async function loadSchedule() {
      try {
        setLoading(true);
        const res = await fetch("/api/radio/schedule");
        if (!res.ok) throw new Error("Failed to load schedule");
        const data = await res.json();
        setSlots(data.slots || []);
      } catch (err: any) {
        setError(err.message || "Failed to load timetable");
      } finally {
        setLoading(false);
      }
    }
    loadSchedule();
  }, []);

  // Set initial day tab to today (0-6)
  useEffect(() => {
    const today = new Date();
    // Monday is index 0
    const day = (today.getUTCDay() + 6) % 7;
    setActiveDayIndex(day);
  }, []);

  // Time formatting helper
  const formatTime = (isoString: string) => {
    const d = new Date(isoString);
    if (useLocalTime) {
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }
    return d.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Africa/Nairobi",
    });
  };

  const formatDate = (isoString: string) => {
    const d = new Date(isoString);
    if (useLocalTime) {
      return d.toLocaleDateString([], { month: "short", day: "numeric" });
    }
    return d.toLocaleDateString([], {
      month: "short",
      day: "numeric",
      timeZone: "Africa/Nairobi",
    });
  };

  // Group slots by weekday (Monday = 0 ... Sunday = 6)
  const slotsByDay = useMemo(() => {
    const groups: SlotData[][] = Array.from({ length: 7 }, () => []);
    const now = Date.now();

    slots.forEach((slot) => {
      const d = new Date(slot.starts_at);
      // In Africa/Nairobi by default, or viewer local
      let dayOfWeek: number;
      if (useLocalTime) {
        dayOfWeek = (d.getDay() + 6) % 7;
      } else {
        // Add 3 hours for Nairobi
        const nairobiDate = new Date(d.getTime() + 3 * 3600 * 1000);
        dayOfWeek = (nairobiDate.getUTCDay() + 6) % 7;
      }
      groups[dayOfWeek].push(slot);
    });

    return groups;
  }, [slots, useLocalTime]);

  const nowMs = Date.now();

  return (
    <div className="min-h-screen bg-brand-off-white text-brand-navy font-mono pb-24 selection:bg-brand-accent selection:text-brand-navy">
      {/* Top Banner */}
      <header className="border-b-4 border-brand-navy bg-brand-navy text-brand-off-white px-4 py-4 sm:px-8">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link
              href="/radio"
              className="p-2 border-2 border-brand-accent text-brand-accent hover:bg-brand-accent hover:text-brand-navy transition-colors"
              title="Back to Radio Player"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <span className="text-[10px] font-black uppercase tracking-widest text-brand-accent flex items-center gap-1.5">
                <Radio className="w-3.5 h-3.5 animate-pulse" /> GOODLIFE RADIO 254
              </span>
              <h1 className="text-2xl sm:text-3xl font-display font-black uppercase tracking-tight text-white">
                STATION TIMETABLE
              </h1>
            </div>
          </div>

          {/* Timezone Toggle */}
          <div className="flex items-center gap-2 self-start sm:self-auto bg-brand-off-white/10 p-1.5 border border-brand-accent/40 rounded">
            <Globe className="w-4 h-4 text-brand-accent" />
            <span className="text-xs font-bold uppercase text-brand-off-white/90">Timezone:</span>
            <button
              onClick={() => setUseLocalTime(false)}
              className={`px-2.5 py-1 text-xs font-bold uppercase rounded transition-all ${
                !useLocalTime
                  ? "bg-brand-accent text-brand-navy shadow-sm"
                  : "text-brand-off-white/70 hover:text-white"
              }`}
            >
              Nairobi (EAT)
            </button>
            <button
              onClick={() => setUseLocalTime(true)}
              className={`px-2.5 py-1 text-xs font-bold uppercase rounded transition-all ${
                useLocalTime
                  ? "bg-brand-accent text-brand-navy shadow-sm"
                  : "text-brand-off-white/70 hover:text-white"
              }`}
            >
              My Local Time
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-4 py-8 sm:px-8">
        {/* Day Switcher Tabs */}
        <div className="flex overflow-x-auto pb-2 mb-8 border-b-2 border-brand-navy gap-2 sm:gap-4 no-scrollbar">
          {WEEKDAYS.map((dayName, idx) => {
            const count = slotsByDay[idx]?.length || 0;
            const isSelected = activeDayIndex === idx;
            return (
              <button
                key={dayName}
                onClick={() => setActiveDayIndex(idx)}
                className={`px-4 py-2.5 font-display text-lg uppercase tracking-wider border-2 border-brand-navy shrink-0 cursor-pointer transition-all ${
                  isSelected
                    ? "bg-brand-navy text-brand-off-white shadow-[3px_3px_0px_#C8A54A] -translate-y-0.5"
                    : "bg-white text-brand-navy hover:bg-brand-off-white"
                }`}
              >
                <span>{dayName}</span>
                <span
                  className={`ml-2 text-xs font-mono px-1.5 py-0.5 rounded ${
                    isSelected ? "bg-brand-accent text-brand-navy" : "bg-neutral-200 text-neutral-700"
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Content area */}
        {loading ? (
          <div className="py-20 text-center font-mono font-bold text-lg text-brand-navy animate-pulse">
            LOADING STATION SCHEDULE...
          </div>
        ) : error ? (
          <div className="p-6 bg-red-100 border-3 border-red-800 text-red-900 rounded font-mono">
            {error}
          </div>
        ) : slotsByDay[activeDayIndex]?.length === 0 ? (
          <div className="py-16 text-center border-3 border-dashed border-brand-navy/30 bg-white p-8 rounded-lg">
            <Clock className="w-10 h-10 mx-auto text-brand-navy/40 mb-3" />
            <h3 className="font-display text-xl uppercase tracking-wide text-brand-navy">
              No live shows scheduled for {WEEKDAYS[activeDayIndex]}
            </h3>
            <p className="text-xs text-neutral-600 mt-1">
              Continuous 24/7 AutoDJ curated playlists will broadcast during this period.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {slotsByDay[activeDayIndex].map((slot) => {
              const startMs = new Date(slot.starts_at).getTime();
              const endMs = new Date(slot.ends_at).getTime();
              const isCurrentlyOnAir = nowMs >= startMs && nowMs < endMs;

              return (
                <div
                  key={slot.id}
                  className={`border-3 border-brand-navy p-5 bg-white relative transition-all ${
                    isCurrentlyOnAir
                      ? "ring-4 ring-brand-accent shadow-[5px_5px_0px_#142B4C] bg-amber-50/40"
                      : "shadow-[3px_3px_0px_#142B4C]"
                  }`}
                >
                  {isCurrentlyOnAir && (
                    <div className="absolute top-3 right-3 flex items-center gap-1.5 bg-red-600 text-white font-mono text-[10px] font-black uppercase px-2.5 py-1 border border-brand-navy rounded shadow-sm animate-pulse">
                      <span className="w-2 h-2 rounded-full bg-white animate-ping" />
                      ON AIR NOW
                    </div>
                  )}

                  {/* Air time */}
                  <div className="flex items-center gap-2 text-xs font-bold text-brand-navy/70 mb-3">
                    <Clock className="w-4 h-4 text-brand-accent" />
                    <span>
                      {formatTime(slot.starts_at)} – {formatTime(slot.ends_at)}
                    </span>
                    <span className="text-neutral-400">·</span>
                    <span>{formatDate(slot.starts_at)}</span>
                  </div>

                  {/* Show info */}
                  <div className="flex gap-4 items-start">
                    <div className="w-16 h-16 sm:w-20 sm:h-20 bg-brand-navy/10 border-2 border-brand-navy shrink-0 overflow-hidden">
                      {slot.show.cover_image_url ? (
                        <img
                          src={slot.show.cover_image_url}
                          alt={slot.show.title}
                          className="w-full h-full object-cover"
                        />
                      ) : slot.presenter.avatar_url ? (
                        <img
                          src={slot.presenter.avatar_url}
                          alt={slot.presenter.dj_name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-brand-navy text-brand-accent font-display text-2xl font-black">
                          {slot.show.title.slice(0, 1)}
                        </div>
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="bg-brand-accent text-brand-navy text-[10px] font-black uppercase px-2 py-0.5 border border-brand-navy/30">
                          {slot.show.genre || "Afro-House"}
                        </span>
                        {slot.substitute_presenter && (
                          <span className="bg-amber-200 text-amber-900 text-[10px] font-bold uppercase px-1.5 py-0.5 border border-amber-400">
                            Cover Host
                          </span>
                        )}
                      </div>

                      <Link
                        href={`/radio/shows/${slot.show.slug}`}
                        className="font-display text-xl sm:text-2xl font-black uppercase tracking-tight text-brand-navy hover:text-brand-accent transition-colors block truncate"
                      >
                        {slot.show.title}
                      </Link>

                      <div className="text-xs text-neutral-700 mt-1 flex items-center gap-1.5">
                        <span>Hosted by:</span>
                        <Link
                          href={`/radio/presenters/${slot.presenter.slug}`}
                          className="font-bold underline hover:text-brand-accent"
                        >
                          {slot.substitute_presenter
                            ? slot.substitute_presenter.dj_name
                            : slot.presenter.dj_name}
                        </Link>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="mt-4 pt-3 border-t-2 border-brand-navy/10 flex items-center justify-between gap-2">
                    <a
                      href={`/api/radio/shows/${slot.show.slug}/calendar.ics`}
                      download
                      className="text-[11px] font-bold uppercase text-brand-navy/80 hover:text-brand-navy flex items-center gap-1 bg-neutral-100 hover:bg-neutral-200 px-2.5 py-1 border border-brand-navy/20 rounded transition-colors"
                    >
                      <CalendarPlus className="w-3.5 h-3.5 text-brand-accent" />
                      Add to Calendar
                    </a>

                    <Link
                      href={`/radio/shows/${slot.show.slug}`}
                      className="text-xs font-bold uppercase text-brand-navy hover:text-brand-accent flex items-center gap-1"
                    >
                      Show Details <ChevronRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
