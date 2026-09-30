"use client";

import React, { useState, useEffect } from "react";
import { Event } from "@/lib/supabase-db-types";
import { ChevronDown, Calendar, Archive, Plus, Layers, Flame } from "lucide-react";
import CreateEventModal from "@/components/admin/CreateEventModal";
import { canonicalStatus, isHiddenFromSite } from "@/lib/event-availability";

interface EventSelectorProps {
  selectedEventId: number | null; // null = all events
  onSelect: (eventId: number | null) => void;
  onEventCreated?: (newEvent: Event) => void;
}

const statusOf = (e: Event) => canonicalStatus(e.status);
const isArchived = (e: Event) => isHiddenFromSite(e);
const isClosed = (e: Event) => statusOf(e) === "closed";

/**
 * Buckets are mutually exclusive on purpose.
 *
 * They used to be `status === 'live' || is_active` / `status === 'scheduled'` /
 * everything else. `is_active` is a legacy flag that stays `true` on events
 * which finished months ago, so a concluded edition showed up under a pulsing
 * green "LIVE NOW" dot, and an event that was both `scheduled` and `is_active`
 * was rendered in two groups at once. The dropdown is how an admin scopes
 * metrics, so an event appearing twice reads as two events.
 *
 * `status` is the only field that means anything here, with one exception: a
 * MINI FESTIVAL is a recurring series, so a `scheduled` mini is not "waiting
 * for a countdown" - it is a series that is currently running. It gets its own
 * group, and the recurring series never sort into the dead-end "past" pile on
 * their own.
 */
export default function EventSelector({ selectedEventId, onSelect, onEventCreated }: EventSelectorProps) {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const fetchEvents = () => {
    fetch("/api/events")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setEvents(data);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchEvents();
  }, []);

  const liveEvents = events.filter((e) => !isArchived(e) && statusOf(e) === "live");
  const seriesEvents = events.filter(
    (e) => !isArchived(e) && !isClosed(e) && e.category === "mini" && statusOf(e) !== "live"
  );
  const upcomingEvents = events.filter(
    (e) => !isArchived(e) && !isClosed(e) && e.category !== "mini" && statusOf(e) === "scheduled"
  );
  // Anything active that is not live, not a series and not explicitly scheduled
  // (e.g. an event whose status was never set). Kept out of the other buckets
  // so it stays visible somewhere rather than silently vanishing from the list.
  const unlabelledEvents = events.filter(
    (e) => !isArchived(e) && !isClosed(e) && statusOf(e) !== "live" && statusOf(e) !== "scheduled" && e.category !== "mini"
  );
  const pastEvents = events.filter((e) => !isArchived(e) && isClosed(e));
  const archivedEvents = events.filter(isArchived);

  const getSelectedLabel = () => {
    if (selectedEventId === null) return "All Events (Universal)";
    const event = events.find((e) => e.id === selectedEventId);
    if (!event) return "Select Event";
    return `${event.title} - ${event.subtitle}`;
  };

  const handleCreated = (newEvent: Event) => {
    setEvents(prev => [newEvent, ...prev]);
    onSelect(newEvent.id);
    if (onEventCreated) onEventCreated(newEvent);
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm font-mono text-[var(--brand-navy)]/60">
        <div className="animate-spin border-2 border-[var(--brand-navy)] border-t-transparent w-4 h-4" />
        Loading editions...
      </div>
    );
  }

  const itemClass = (id: number) =>
    `w-full px-3 py-2 text-left font-mono text-xs border-b border-[var(--brand-navy)]/20 transition-colors cursor-pointer ${
      selectedEventId === id
        ? "bg-[var(--brand-navy)] text-[var(--brand-off-white)]"
        : "hover:bg-[var(--brand-accent)]/10 text-brand-navy"
    }`;

  const groupHeader = (children: React.ReactNode) => (
    <div className="px-3 py-1.5 bg-brand-navy/10 text-[10px] font-bold uppercase text-brand-navy flex items-center gap-1 border-b border-brand-navy/20">
      {children}
    </div>
  );

  const row = (event: Event, badge: React.ReactNode, muted = false) => (
    <button
      key={event.id}
      onClick={() => {
        onSelect(event.id);
        setIsOpen(false);
      }}
      className={itemClass(event.id)}
    >
      <div className="flex items-center justify-between gap-1">
        <div className={`font-bold truncate ${muted ? "opacity-75" : ""}`}>
          {event.category === "mini" ? "🌿 " : "⭐ "}
          {event.title}
        </div>
        {badge}
      </div>
      <div className={`text-[10px] truncate ${muted ? "opacity-60" : "opacity-70"}`}>
        {event.subtitle || event.venue}
      </div>
    </button>
  );

  return (
    <>
      <div className="relative inline-flex items-center gap-2">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-2 px-3 py-2 border-4 border-[var(--brand-navy)] bg-[var(--brand-off-white)] text-[var(--brand-navy)] font-mono text-xs uppercase tracking-wider hover:bg-[var(--brand-accent)]/10 transition-colors shadow-(--shadow-brut-xs) cursor-pointer"
        >
          <Calendar className="w-4 h-4 text-brand-navy" />
          <span className="truncate max-w-[210px] font-bold">{getSelectedLabel()}</span>
          <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? "rotate-180" : ""}`} />
        </button>

        <button
          onClick={() => setShowCreateModal(true)}
          className="p-2 border-4 border-brand-navy bg-brand-accent text-brand-navy hover:bg-brand-navy hover:text-brand-off-white transition-colors shadow-(--shadow-brut-xs) cursor-pointer"
          title="Create New Event / Mini-Session"
        >
          <Plus className="w-4 h-4" />
        </button>

        {isOpen && (
          <div className="absolute top-full left-0 z-50 mt-1 w-80 max-h-[80vh] overflow-y-auto border-4 border-[var(--brand-navy)] bg-[var(--brand-off-white)] shadow-(--shadow-brut-xl-accent)">
            {/* All Events option */}
            <button
              onClick={() => {
                onSelect(null);
                setIsOpen(false);
              }}
              className={`w-full px-4 py-2.5 text-left font-mono text-xs uppercase tracking-wider border-b-2 border-[var(--brand-navy)] transition-colors cursor-pointer ${
                selectedEventId === null
                  ? "bg-[var(--brand-navy)] text-[var(--brand-off-white)]"
                  : "hover:bg-[var(--brand-accent)]/10 text-brand-navy"
              }`}
            >
              All Events (Global Metrics)
            </button>

            {/* LIVE NOW */}
            {liveEvents.length > 0 && (
              <div>
                {groupHeader(
                  <>
                    <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" /> LIVE NOW
                  </>
                )}
                {liveEvents.map((event) =>
                  row(
                    event,
                    <span className="text-[9px] px-1 py-0.2 uppercase border font-mono bg-green-100 text-green-900 border-green-600">
                      {event.category === "mini" ? "SERIES" : "FLAGSHIP"}
                    </span>
                  )
                )}
              </div>
            )}

            {/* RECURRING MINI SERIES — sellable most weeks, never "counting down" */}
            {seriesEvents.length > 0 && (
              <div>
                {groupHeader(
                  <>
                    <Flame className="w-3 h-3" /> MINI SESSIONS
                  </>
                )}
                {seriesEvents.map((event) =>
                  row(
                    event,
                    <span className="text-[9px] px-1 py-0.2 uppercase border font-mono bg-lime-100 text-lime-900 border-lime-600">
                      SERIES
                    </span>
                  )
                )}
              </div>
            )}

            {/* UPCOMING FLAGSHIP EDITIONS */}
            {upcomingEvents.length > 0 && (
              <div>
                {groupHeader(
                  <>
                    <span className="w-2 h-2 rounded-full bg-yellow-500" /> UPCOMING EDITIONS
                  </>
                )}
                {upcomingEvents.map((event) =>
                  row(
                    event,
                    <span className="text-[9px] px-1 py-0.2 uppercase border font-mono bg-yellow-100 text-yellow-900 border-yellow-600">
                      SOON
                    </span>
                  )
                )}
              </div>
            )}

            {/* UNLABELLED — active but `status` was never set */}
            {unlabelledEvents.length > 0 && (
              <div>
                {groupHeader(
                  <>
                    <Layers className="w-3 h-3" /> UNLABELLED
                  </>
                )}
                {unlabelledEvents.map((event) =>
                  row(
                    event,
                    <span className="text-[9px] px-1 py-0.2 uppercase border font-mono bg-slate-200 text-slate-700 border-slate-500">
                      NO STATUS
                    </span>
                  )
                )}
              </div>
            )}

            {/* CONCLUDED */}
            {pastEvents.length > 0 && (
              <div>
                {groupHeader(
                  <>
                    <Archive className="w-3 h-3" /> CONCLUDED
                  </>
                )}
                {pastEvents.map((event) =>
                  row(
                    event,
                    <span className="text-[9px] px-1 py-0.2 uppercase border font-mono bg-gray-200 text-gray-700">
                      CLOSED
                    </span>,
                    true
                  )
                )}
              </div>
            )}

            {/* ARCHIVED — hidden from the public site entirely */}
            {archivedEvents.length > 0 && (
              <div>
                {groupHeader(
                  <>
                    <Archive className="w-3 h-3" /> ARCHIVED (HIDDEN FROM SITE)
                  </>
                )}
                {archivedEvents.map((event) =>
                  row(
                    event,
                    <span className="text-[9px] px-1 py-0.2 uppercase border font-mono bg-neutral-800 text-neutral-200 border-neutral-600">
                      ARCHIVED
                    </span>,
                    true
                  )
                )}
              </div>
            )}

            {/* Add New Event inside dropdown footer */}
            <div className="p-2 border-t-2 border-brand-navy bg-brand-off-white">
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  setShowCreateModal(true);
                }}
                className="w-full py-1.5 px-3 border-2 border-dashed border-brand-navy text-xs font-bold uppercase bg-brand-accent/20 hover:bg-brand-accent text-brand-navy flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" /> + CREATE NEW EDITION
              </button>
            </div>
          </div>
        )}
      </div>

      <CreateEventModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onEventCreated={handleCreated}
      />
    </>
  );
}
