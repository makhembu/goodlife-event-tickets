"use client";

import React, { useState, useEffect } from "react";
import { Event } from "@/lib/supabase-db-types";
import { ChevronDown, Calendar, Archive } from "lucide-react";

interface EventSelectorProps {
  selectedEventId: number | null; // null = all events
  onSelect: (eventId: number | null) => void;
}

export default function EventSelector({ selectedEventId, onSelect }: EventSelectorProps) {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    fetch("/api/events")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setEvents(data);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const activeEvent = events.find((e) => e.is_active);
  const archivedEvents = events.filter((e) => !e.is_active);

  const getSelectedLabel = () => {
    if (selectedEventId === null) return "All Events";
    const event = events.find((e) => e.id === selectedEventId);
    if (!event) return "Select Event";
    return `${event.title} - ${event.subtitle}`;
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm font-mono text-[var(--brand-navy)]/60">
        <div className="animate-spin border-2 border-[var(--brand-navy)] border-t-transparent w-4 h-4" />
        Loading events...
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-4 py-2 border-4 border-[var(--brand-navy)] bg-[var(--brand-off-white)] text-[var(--brand-navy)] font-mono text-sm uppercase tracking-wider hover:bg-[var(--brand-accent)]/10 transition-colors"
      >
        <Calendar className="w-4 h-4" />
        <span className="truncate max-w-[200px]">{getSelectedLabel()}</span>
        <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {isOpen && (
        <div className="absolute z-50 mt-2 w-80 border-4 border-[var(--brand-navy)] bg-[var(--brand-off-white)] shadow-(--shadow-brut-xl-accent)">
          {/* All Events option */}
          <button
            onClick={() => {
              onSelect(null);
              setIsOpen(false);
            }}
            className={`w-full px-4 py-3 text-left font-mono text-sm uppercase tracking-wider border-b-2 border-[var(--brand-navy)] transition-colors ${
              selectedEventId === null
                ? "bg-[var(--brand-navy)] text-[var(--brand-off-white)]"
                : "hover:bg-[var(--brand-accent)]/10"
            }`}
          >
            All Events
          </button>

          {/* Active Event */}
          {activeEvent && (
            <button
              onClick={() => {
                onSelect(activeEvent.id);
                setIsOpen(false);
              }}
              className={`w-full px-4 py-3 text-left font-mono text-sm border-b-2 border-[var(--brand-navy)] transition-colors ${
                selectedEventId === activeEvent.id
                  ? "bg-[var(--brand-navy)] text-[var(--brand-off-white)]"
                  : "hover:bg-[var(--brand-accent)]/10"
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 bg-green-500 rounded-full" />
                <div>
                  <div className="font-bold">{activeEvent.title}</div>
                  <div className="text-xs opacity-70">{activeEvent.subtitle}</div>
                </div>
              </div>
            </button>
          )}

          {/* Archived Events */}
          {archivedEvents.length > 0 && (
            <div className="border-t-2 border-[var(--brand-navy)]">
              <div className="px-4 py-2 text-xs font-bold uppercase tracking-wider text-[var(--brand-navy)]/60 flex items-center gap-2">
                <Archive className="w-3 h-3" />
                Past Events
              </div>
              {archivedEvents.map((event) => (
                <button
                  key={event.id}
                  onClick={() => {
                    onSelect(event.id);
                    setIsOpen(false);
                  }}
                  className={`w-full px-4 py-3 text-left font-mono text-sm border-b border-[var(--brand-navy)]/20 transition-colors ${
                    selectedEventId === event.id
                      ? "bg-[var(--brand-navy)] text-[var(--brand-off-white)]"
                      : "hover:bg-[var(--brand-accent)]/10"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 bg-gray-400 rounded-full" />
                    <div>
                      <div className="font-bold">{event.title}</div>
                      <div className="text-xs opacity-70">{event.subtitle}</div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
