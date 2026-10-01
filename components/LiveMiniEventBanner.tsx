import React from "react";
import Link from "next/link";
import { Smartphone } from "lucide-react";
import { Event } from "@/lib/supabase-db-types";
import {
  formatOccurrence,
  isOccurrenceDay,
  resolveNextOccurrence,
} from "@/lib/event-availability";

/**
 * Promo for whichever mini festivals are currently sellable.
 *
 * WHY THIS IS A SHARED COMPONENT
 * ------------------------------
 * It used to live inside `ClosedEventClientPage`, which meant the mini-festival
 * promo was rendered ONLY on pages that were not selling anything. That is
 * backwards: a customer whose flagship tickets are not on sale yet sees nothing
 * but the coming-soon page, so that page is precisely where the one thing they
 * *can* buy should be advertised. It is now rendered on all three public pages.
 */
export default function LiveMiniEventBanner({ events }: { events?: Event[] }) {
  const list = (events ?? []).filter(Boolean);
  if (list.length === 0) return null;

  const now = new Date();

  return (
    <div className="space-y-4">
      {list.map((mini) => {
        // The banner used to hardcode "IS LIVE NOW" and "PASSES & FREE RSVP
        // AVAILABLE" for anything sellable. For a weekly series that is sellable
        // every week except its session day, that claimed the festival was on
        // today when the next session might be six days away. Say what is
        // actually true instead.
        const occurrenceDay = isOccurrenceDay(mini, now);
        const nextOccurrence = resolveNextOccurrence(mini, now);

        const scheduleLine = mini.custom_schedule_text
          ? mini.custom_schedule_text
          : nextOccurrence
          ? `NEXT SESSION: ${formatOccurrence(nextOccurrence).toUpperCase()}`
          : mini.recurrence_pattern && mini.recurrence_pattern !== "none"
          ? `EVERY ${mini.recurrence_day?.toUpperCase()} | ${mini.recurrence_time}`
          : "GOODLIFE MINI SESSIONS";

        return (
          <section
            key={mini.id}
            className="border-2 md:border-[3px] border-brand-navy bg-brand-accent p-3 md:p-4 shadow-(--shadow-brut-md) flex flex-col md:flex-row items-center justify-between gap-3 animate-in fade-in duration-300"
          >
            <div className="space-y-1 text-center md:text-left">
              <div className="flex flex-wrap items-center justify-center md:justify-start gap-1.5">
                <span className="px-2 py-0.5 border-2 border-brand-navy bg-brand-navy text-brand-off-white text-[9px] font-mono font-bold uppercase tracking-wider">
                  {occurrenceDay ? "ON TODAY" : "PASSES ON SALE"}
                </span>
                <span className="px-2 py-0.5 border border-brand-navy/60 bg-brand-off-white text-brand-navy text-[9px] font-mono font-bold uppercase">
                  {scheduleLine}
                </span>
              </div>
              <h3 className="font-display text-xl md:text-2xl uppercase tracking-wider text-brand-navy">
                {mini.title} IS BOOKABLE NOW
              </h3>
              <p className="font-mono text-[10px] md:text-xs uppercase text-brand-navy/80 font-bold">
                {mini.venue} • PASSES ON SALE — EARLY RSVP KES 50 OFF
              </p>
            </div>
            <Link
              href={`/?event=${mini.id}`}
              className="w-full md:w-auto text-center border-2 md:border-[3px] border-brand-navy bg-brand-navy text-brand-accent px-4 py-2 md:py-2.5 font-display text-base md:text-lg uppercase tracking-wider hover:bg-brand-off-white hover:text-brand-navy transition-all shadow-(--shadow-brut-sm) active:translate-x-[2px] active:translate-y-[2px] whitespace-nowrap"
            >
              <span className="inline-flex items-center gap-1.5">
                <Smartphone className="w-3.5 h-3.5" /> GET PASSES &amp; RSVP →
              </span>
            </Link>
          </section>
        );
      })}
    </div>
  );
}