"use client";

import React, { useState, useEffect } from "react";
import { Event } from "@/lib/supabase-db-types";
import { ChevronDown, Calendar, Archive, Plus, Layers, Flame } from "lucide-react";
import CreateEventModal from "@/components/admin/CreateEventModal";

interface EventSelectorProps {
  selectedEventId: number | null; // null = all events
  onSelect: (eventId: number | null) => void;
  onEventCreated?: (newEvent: Event) => void;
}

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

  const liveEvents = events.filter((e) => e.status === 'live' || e.is_active);
  const scheduledEvents = events.filter((e) => e.status === 'scheduled');
  const pastEvents = events.filter((e) => e.status === 'closed' || e.status === 'archived' || (!e.is_active && e.status !== 'scheduled' && e.status !== 'live'));

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

            {/* Live Events Group */}
            {liveEvents.length > 0 && (
              <div>
                <div className="px-3 py-1.5 bg-brand-navy/10 text-[10px] font-bold uppercase text-brand-navy flex items-center gap-1 border-b border-brand-navy/20">
                  <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" /> LIVE NOW
                </div>
                {liveEvents.map((event) => (
                  <button
                    key={event.id}
                    onClick={() => {
                      onSelect(event.id);
                      setIsOpen(false);
                    }}
                    className={`w-full px-3 py-2 text-left font-mono text-xs border-b border-[var(--brand-navy)]/20 transition-colors cursor-pointer ${
                      selectedEventId === event.id
                        ? "bg-[var(--brand-navy)] text-[var(--brand-off-white)]"
                        : "hover:bg-[var(--brand-accent)]/10 text-brand-navy"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <div className="font-bold truncate">
                        {event.category === 'mini' ? '🌿 ' : '⭐ '}
                        {event.title}
                      </div>
                      <span className="text-[9px] px-1 py-0.2 uppercase border font-mono bg-green-100 text-green-900 border-green-600">
                        {event.category?.toUpperCase() || "EVENT"}
                      </span>
                    </div>
                    <div className="text-[10px] opacity-70 truncate">{event.subtitle || event.venue}</div>
                  </button>
                ))}
              </div>
            )}

            {/* Scheduled Events Group */}
            {scheduledEvents.length > 0 && (
              <div>
                <div className="px-3 py-1.5 bg-brand-accent/20 text-[10px] font-bold uppercase text-brand-navy flex items-center gap-1 border-b border-brand-navy/20">
                  <span className="w-2 h-2 rounded-full bg-yellow-500" /> SCHEDULED / COUNTDOWN
                </div>
                {scheduledEvents.map((event) => (
                  <button
                    key={event.id}
                    onClick={() => {
                      onSelect(event.id);
                      setIsOpen(false);
                    }}
                    className={`w-full px-3 py-2 text-left font-mono text-xs border-b border-[var(--brand-navy)]/20 transition-colors cursor-pointer ${
                      selectedEventId === event.id
                        ? "bg-[var(--brand-navy)] text-[var(--brand-off-white)]"
                        : "hover:bg-[var(--brand-accent)]/10 text-brand-navy"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <div className="font-bold truncate">{event.title}</div>
                      <span className="text-[9px] px-1 py-0.2 uppercase border font-mono bg-yellow-100 text-yellow-900 border-yellow-600">
                        COUNTDOWN
                      </span>
                    </div>
                    <div className="text-[10px] opacity-70 truncate">{event.subtitle || event.venue}</div>
                  </button>
                ))}
              </div>
            )}

            {/* Past Events */}
            {pastEvents.length > 0 && (
              <div>
                <div className="px-3 py-1.5 bg-gray-100 text-[10px] font-bold uppercase text-brand-navy/60 flex items-center gap-1 border-b border-brand-navy/20">
                  <Archive className="w-3 h-3" /> PAST / CONCLUDED
                </div>
                {pastEvents.map((event) => (
                  <button
                    key={event.id}
                    onClick={() => {
                      onSelect(event.id);
                      setIsOpen(false);
                    }}
                    className={`w-full px-3 py-2 text-left font-mono text-xs border-b border-[var(--brand-navy)]/20 transition-colors cursor-pointer ${
                      selectedEventId === event.id
                        ? "bg-[var(--brand-navy)] text-[var(--brand-off-white)]"
                        : "hover:bg-[var(--brand-accent)]/10 text-brand-navy"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <div className="font-bold truncate opacity-75">{event.title}</div>
                      <span className="text-[9px] px-1 py-0.2 uppercase border font-mono bg-gray-200 text-gray-700">
                        ARCHIVED
                      </span>
                    </div>
                    <div className="text-[10px] opacity-60 truncate">{event.subtitle}</div>
                  </button>
                ))}
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
