"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { Sparkles, MapPin, Calendar, Ticket, ChevronDown, ChevronUp, X } from "lucide-react";
import { resolveEventFlyer } from "@/lib/event-flyer";
import { isEventSellable } from "@/lib/event-availability";
import { computeKenyaCountdown, isEventCardVisible } from "@/lib/radio/event-card";
import { Event as EventType } from "@/lib/supabase-db-types";

interface UpcomingEventCardProps {
  event?: EventType | null;
  compact?: boolean;
  className?: string;
}

export default function UpcomingEventCard({
  event: initialEvent,
  compact = false,
  className = "",
}: UpcomingEventCardProps) {
  const [event, setEvent] = useState<EventType | null>(initialEvent || null);
  const [countdown, setCountdown] = useState<ReturnType<typeof computeKenyaCountdown>>(null);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    if (initialEvent) {
      setEvent(initialEvent);
      setCountdown(computeKenyaCountdown(initialEvent.event_date));
      return;
    }

    let isCancelled = false;
    async function fetchActiveEvent() {
      try {
        const res = await fetch("/api/events/active");
        if (res.ok) {
          const data = await res.json();
          if (!isCancelled && data && data.id) {
            setEvent(data);
            setCountdown(computeKenyaCountdown(data.event_date));
          }
        }
      } catch {}
    }

    fetchActiveEvent();
    return () => {
      isCancelled = true;
    };
  }, [initialEvent]);

  useEffect(() => {
    if (!event?.event_date) return;
    const interval = setInterval(() => {
      setCountdown(computeKenyaCountdown(event.event_date));
    }, 60000);
    return () => clearInterval(interval);
  }, [event?.event_date]);

  if (!event || !isEventCardVisible(event)) {
    return null;
  }

  const isSellable = isEventSellable(event);

  // 1. COMPACT MODE (Designed for GlobalRadioBar embedding)
  if (compact) {
    return (
      <div className={`font-mono text-xs ${className}`}>
        {!isExpanded ? (
          <div className="flex items-center justify-between gap-2 bg-brand-accent/15 border border-brand-accent/40 text-brand-off-white px-3 py-1 rounded-sm">
            <div className="flex items-center gap-2 truncate">
              <span className="w-2 h-2 rounded-full bg-brand-accent animate-ping shrink-0" />
              <span className="truncate">
                <strong className="text-brand-accent uppercase font-black">NEXT FESTIVAL:</strong>{" "}
                <span className="text-white font-bold">{event.title}</span>
                {countdown && (
                  <span className="text-brand-off-white/70 ml-2">
                    ({countdown.isPassed ? "TODAY" : `${countdown.days}d ${countdown.hours}h left`})
                  </span>
                )}
              </span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <Link
                href={`/?event=${event.id}`}
                className="px-2 py-0.5 bg-brand-accent text-brand-navy font-bold uppercase text-[10px] hover:bg-brand-off-white transition-colors"
              >
                {isSellable ? "Passes" : "Details"}
              </Link>
              <button
                type="button"
                onClick={() => setIsExpanded(true)}
                aria-label="Expand event details"
                className="p-1 hover:text-brand-accent text-brand-off-white/80 cursor-pointer"
                title="Expand event details"
              >
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-brand-navy border-2 border-brand-accent p-3 rounded-md shadow-(--shadow-brut-md) space-y-2.5 text-brand-off-white relative animate-in fade-in slide-in-from-bottom-2 duration-150">
            <button
              type="button"
              onClick={() => setIsExpanded(false)}
              className="absolute top-2 right-2 text-brand-off-white/70 hover:text-white cursor-pointer"
              aria-label="Collapse event view"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex gap-3 items-center">
              <div className="w-12 h-16 rounded border border-brand-accent overflow-hidden shrink-0 bg-black">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={resolveEventFlyer(event)}
                  alt=""
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="bg-brand-accent text-brand-navy text-[9px] font-black uppercase px-1.5 rounded-xs">
                    {isSellable ? "TICKETS LIVE" : "SCHEDULED"}
                  </span>
                  {countdown && (
                    <span className="text-[10px] text-brand-off-white/80">
                      {countdown.isPassed ? "TODAY" : `${countdown.days}d ${countdown.hours}h left`}
                    </span>
                  )}
                </div>
                <h4 className="font-display text-sm uppercase tracking-wide truncate text-white leading-tight mt-0.5">
                  {event.title}
                </h4>
                {event.venue && (
                  <p className="text-[10px] text-brand-off-white/70 truncate flex items-center gap-1">
                    <MapPin className="w-3 h-3 shrink-0" />
                    <span>{event.venue}</span>
                  </p>
                )}
              </div>
            </div>

            <div className="flex gap-2">
              <Link
                href={`/?event=${event.id}`}
                className="flex-1 py-1.5 px-3 bg-brand-accent hover:bg-brand-accent-vivid text-brand-navy font-display text-sm tracking-wider uppercase text-center font-bold border border-brand-navy transition-all flex items-center justify-center gap-1.5"
              >
                <Ticket className="w-3.5 h-3.5" />
                <span>{isSellable ? "GET FESTIVAL PASSES" : "VIEW DETAILS"}</span>
              </Link>
            </div>
          </div>
        )}
      </div>
    );
  }

  // 2. STANDARD FULL CARD (Used on /radio page)
  return (
    <div
      className={`border-4 border-brand-navy bg-brand-off-white shadow-(--shadow-brut-md) rounded-xl p-5 space-y-4 ${className}`}
    >
      <div className="flex items-center justify-between border-b-2 border-brand-navy/15 pb-2">
        <span className="font-mono text-xs font-bold uppercase tracking-wider text-brand-navy/80 flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-brand-accent fill-brand-accent" />
          <span>NEXT FESTIVAL EDITION</span>
        </span>
        {isSellable ? (
          <span className="font-mono text-xs font-bold bg-brand-accent text-brand-navy px-2.5 py-0.5 rounded border border-brand-navy/20">
            TICKETS LIVE
          </span>
        ) : (
          <span className="font-mono text-xs font-bold bg-neutral-200 text-brand-navy/70 px-2.5 py-0.5 rounded border border-brand-navy/20">
            SALES CLOSED
          </span>
        )}
      </div>

      <div className="flex gap-3.5 items-center">
        {/* Event Poster Thumbnail */}
        <div className="w-20 h-28 rounded border-2 border-brand-navy overflow-hidden bg-brand-navy shrink-0 shadow-(--shadow-brut-xs)">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={resolveEventFlyer(event)}
            alt=""
            className="w-full h-full object-cover"
          />
        </div>

        {/* Event Details */}
        <div className="min-w-0 flex-1 space-y-1.5">
          <h4 className="font-display text-xl sm:text-2xl uppercase tracking-wide text-brand-navy leading-tight">
            {event.title}
          </h4>

          {event.venue && (
            <p className="font-mono text-xs sm:text-sm text-brand-navy/80 flex items-center gap-1.5">
              <MapPin className="w-4 h-4 text-brand-navy/60 shrink-0" />
              <span className="truncate">{event.venue}</span>
            </p>
          )}

          {event.event_date && (
            <p className="font-mono text-xs sm:text-sm text-brand-navy/80 flex items-center gap-1.5">
              <Calendar className="w-4 h-4 text-brand-navy/60 shrink-0" />
              <span>
                {new Date(event.event_date).toLocaleDateString("en-KE", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                  timeZone: "Africa/Nairobi",
                })}
              </span>
            </p>
          )}
        </div>
      </div>

      {/* Real Nairobi Countdown / Event Day Display */}
      <div className="p-3 bg-white border-2 border-brand-navy rounded font-mono text-center">
        <span className="text-xs uppercase font-bold text-brand-navy/70 block mb-1">
          {countdown?.isPassed
            ? "TODAY (KENYA TIME)"
            : "COUNTDOWN TO EVENT DATE (KENYA TIME)"}
        </span>
        {countdown?.isPassed ? (
          <div className="flex justify-center items-center py-0.5 font-display text-2xl sm:text-3xl text-brand-navy tracking-widest leading-none">
            <span>EVENT DAY</span>
          </div>
        ) : (
          <div className="flex justify-center items-center gap-2 font-display text-2xl sm:text-3xl text-brand-navy leading-none">
            <span>{countdown?.days ?? 0}D</span>
            <span className="text-brand-navy/30">:</span>
            <span>{countdown?.hours ?? 0}H</span>
            <span className="text-brand-navy/30">:</span>
            <span>{countdown?.minutes ?? 0}M</span>
          </div>
        )}
      </div>

      {/* Pass Purchase CTA */}
      <Link
        href={`/?event=${event.id}`}
        className="w-full py-3 px-4 bg-brand-accent hover:bg-brand-accent-vivid text-brand-navy font-display text-lg tracking-wider uppercase border-2 border-brand-navy shadow-(--shadow-brut-xs) hover:translate-x-0.5 hover:-translate-y-0.5 transition-all flex items-center justify-center gap-2 font-bold cursor-pointer"
      >
        <Ticket className="w-4 h-4" />
        <span>{isSellable ? "GET FESTIVAL PASSES" : "VIEW EVENT DETAILS"}</span>
      </Link>
    </div>
  );
}
