"use client";

import React, { useState, useEffect } from "react";
import { RadioTower, Save, CheckCircle2, AlertCircle, RefreshCw, Calendar, MapPin, Users, Globe } from "lucide-react";

interface EventOverrideItem {
  id: number;
  title: string;
  venue: string;
  event_date: string;
  status: string;
  category: string;
  lineup: string[] | null;
  lineup_confirmed: boolean | null;
  radio_promote: boolean | null;
  radio_priority: number | null;
  starts_at: string | null;
  gates_open_at: string | null;
  ends_at: string | null;
  promo_blurb: string | null;
  venue_coords: { lat: number; lng: number } | null;
  spoken_ticket_url: string | null;
}

export default function RadioOverridesEditor() {
  const [events, setEvents] = useState<EventOverrideItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<{ text: string; type: "success" | "error" } | null>(null);

  const showFeedback = (text: string, type: "success" | "error") => {
    setFeedback({ text, type });
    setTimeout(() => setFeedback(null), 4000);
  };

  const fetchOverrides = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/admin/radio/overrides");
      if (res.ok) {
        const data = await res.json();
        setEvents(data.events || []);
      }
    } catch (err: any) {
      showFeedback("Failed to load event overrides: " + err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOverrides();
  }, []);

  const handleFieldChange = (id: number, field: string, value: any) => {
    setEvents((prev) =>
      prev.map((e) => {
        if (e.id === id) {
          return { ...e, [field]: value };
        }
        return e;
      })
    );
  };

  const handleSave = async (event: EventOverrideItem) => {
    setSavingId(event.id);
    try {
      const res = await fetch("/api/admin/radio/overrides", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event_id: event.id,
          radio_promote: event.radio_promote ?? true,
          radio_priority: Number(event.radio_priority) || 0,
          starts_at: event.starts_at || null,
          gates_open_at: event.gates_open_at || null,
          ends_at: event.ends_at || null,
          promo_blurb: event.promo_blurb || null,
          venue_coords: event.venue_coords || null,
          spoken_ticket_url: event.spoken_ticket_url || null,
          lineup: Array.isArray(event.lineup) ? event.lineup : [],
          lineup_confirmed: Boolean(event.lineup_confirmed),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save overrides");
      }

      showFeedback(`✓ Saved radio settings & lineup for "${event.title}"`, "success");
    } catch (err: any) {
      showFeedback("Save error: " + err.message, "error");
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center bg-zinc-900 border border-zinc-800 p-4 rounded-xl">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <RadioTower className="w-5 h-5 text-amber-400" />
            Event Radio Overrides & Confirmed Lineup
          </h2>
          <p className="text-xs text-zinc-400">
            Control on-air event hours, GPS coordinates, spoken ticket URL, and confirmed lineup acts.
          </p>
        </div>
        <button
          onClick={fetchOverrides}
          disabled={loading}
          className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {feedback && (
        <div className={`p-3 rounded-lg text-xs flex items-center gap-2 ${
          feedback.type === "success" ? "bg-emerald-950/60 text-emerald-300 border border-emerald-800" : "bg-red-950/60 text-red-300 border border-red-800"
        }`}>
          {feedback.type === "success" ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {feedback.text}
        </div>
      )}

      {loading ? (
        <div className="p-8 text-center text-zinc-500 text-xs">Loading event settings...</div>
      ) : events.length === 0 ? (
        <div className="p-8 text-center text-zinc-500 text-xs">No events found in database.</div>
      ) : (
        <div className="space-y-6">
          {events.map((ev) => (
            <div key={ev.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
              {/* Event Title Header */}
              <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 border-b border-zinc-800 pb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-white text-base">{ev.title}</span>
                    <span className="px-2 py-0.5 bg-zinc-800 text-zinc-300 rounded text-[11px] font-mono">
                      #{ev.id} · {ev.category}
                    </span>
                    <span className={`px-2 py-0.5 rounded text-[11px] font-medium ${
                      ev.status === "live" ? "bg-emerald-950 text-emerald-400 border border-emerald-800" : "bg-zinc-800 text-zinc-400"
                    }`}>
                      {ev.status}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-400 mt-1 flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 text-zinc-500" />
                    {ev.venue || "No venue set"}
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={ev.radio_promote ?? true}
                      onChange={(e) => handleFieldChange(ev.id, "radio_promote", e.target.checked)}
                      className="rounded bg-zinc-800 border-zinc-700 text-amber-500 focus:ring-0"
                    />
                    Air on Radio
                  </label>

                  <button
                    onClick={() => handleSave(ev)}
                    disabled={savingId === ev.id}
                    className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-black font-semibold rounded-lg text-xs flex items-center gap-1.5 transition-colors shadow-md shadow-amber-500/20"
                  >
                    <Save className="w-3.5 h-3.5" />
                    {savingId === ev.id ? "Saving..." : "Save Overrides"}
                  </button>
                </div>
              </div>

              {/* Form Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                {/* Gates Open At */}
                <div>
                  <label className="block text-zinc-400 mb-1 font-medium">Gates Open At (EAT)</label>
                  <input
                    type="text"
                    placeholder="e.g. 2026-11-07 12:00:00+03"
                    value={ev.gates_open_at || ""}
                    onChange={(e) => handleFieldChange(ev.id, "gates_open_at", e.target.value)}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-2 text-white font-mono text-xs focus:outline-none focus:border-amber-500"
                  />
                  <p className="text-[10px] text-zinc-500 mt-0.5">Used for hour-level countdowns ("gates open at noon")</p>
                </div>

                {/* Spoken Ticket URL */}
                <div>
                  <label className="block text-zinc-400 mb-1 font-medium flex items-center gap-1">
                    <Globe className="w-3.5 h-3.5 text-zinc-500" />
                    Spoken Ticket Phrase
                  </label>
                  <input
                    type="text"
                    placeholder="tickets on the Goodlife website"
                    value={ev.spoken_ticket_url || ""}
                    onChange={(e) => handleFieldChange(ev.id, "spoken_ticket_url", e.target.value)}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-2 text-white text-xs focus:outline-none focus:border-amber-500"
                  />
                  <p className="text-[10px] text-zinc-500 mt-0.5">Never .co.ke! e.g. "tickets on the Goodlife website"</p>
                </div>

                {/* Radio Priority */}
                <div>
                  <label className="block text-zinc-400 mb-1 font-medium">Radio Airplay Priority</label>
                  <input
                    type="number"
                    value={ev.radio_priority ?? 0}
                    onChange={(e) => handleFieldChange(ev.id, "radio_priority", parseInt(e.target.value, 10) || 0)}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-2 text-white text-xs focus:outline-none focus:border-amber-500"
                  />
                  <p className="text-[10px] text-zinc-500 mt-0.5">Higher number receives more drop rotation</p>
                </div>
              </div>

              {/* Lineup Section */}
              <div className="bg-zinc-950/60 border border-zinc-800/80 rounded-lg p-3 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="font-semibold text-zinc-200 text-xs flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-amber-400" />
                    Lineup Acts (Comma-separated)
                  </span>
                  <label className="flex items-center gap-1.5 text-xs text-amber-400 cursor-pointer font-medium">
                    <input
                      type="checkbox"
                      checked={Boolean(ev.lineup_confirmed)}
                      onChange={(e) => handleFieldChange(ev.id, "lineup_confirmed", e.target.checked)}
                      className="rounded bg-zinc-800 border-zinc-700 text-amber-500 focus:ring-0"
                    />
                    Lineup Confirmed (Required before acts are spoken on air)
                  </label>
                </div>

                <input
                  type="text"
                  placeholder="e.g. DJ Shax, MC Cheche, Amina, Wigman"
                  value={Array.isArray(ev.lineup) ? ev.lineup.join(", ") : ""}
                  onChange={(e) => {
                    const acts = e.target.value.split(",").map((s) => s.trim()).filter(Boolean);
                    handleFieldChange(ev.id, "lineup", acts);
                  }}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-2 text-white text-xs focus:outline-none focus:border-amber-500"
                />
                <p className="text-[10px] text-zinc-500">
                  Invariant: Drops will NEVER announce unconfirmed acts unless "Lineup Confirmed" is checked.
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
