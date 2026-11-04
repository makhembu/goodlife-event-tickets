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
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-[#16181D] text-[#FBF9F6] border-2 border-[#16181D] p-4 shadow-[4px_4px_0px_#DFBB7D]">
        <div>
          <h2 className="text-base font-bold font-mono uppercase tracking-wider text-white flex items-center gap-2">
            <RadioTower className="w-5 h-5 text-[#DFBB7D]" />
            Event Radio Overrides & Confirmed Lineup
          </h2>
          <p className="text-xs text-[#DFBB7D] font-mono mt-0.5">
            Control on-air event hours, GPS coordinates, spoken ticket URL, and confirmed lineup acts.
          </p>
        </div>
        <button
          onClick={fetchOverrides}
          disabled={loading}
          className="px-3.5 py-1.5 bg-[#1A1D24] hover:bg-white/10 text-white border border-white/20 text-xs font-mono font-bold uppercase flex items-center gap-1.5 transition-all cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-[#DFBB7D]" : ""}`} />
          Refresh
        </button>
      </div>

      {feedback && (
        <div className={`p-3 font-mono text-xs flex items-center gap-2 border ${
          feedback.type === "success" ? "bg-emerald-950/80 text-emerald-300 border-emerald-600" : "bg-red-950/80 text-red-300 border-red-600"
        }`}>
          {feedback.type === "success" ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {feedback.text}
        </div>
      )}

      {loading ? (
        <div className="p-8 text-center text-white/50 font-mono text-xs">Loading event settings...</div>
      ) : events.length === 0 ? (
        <div className="p-8 text-center text-white/60 font-mono text-xs">No events found in database.</div>
      ) : (
        <div className="space-y-6 font-mono">
          {events.map((ev) => (
            <div key={ev.id} className="bg-[#16181D] text-[#FBF9F6] border-2 border-[#16181D] p-5 shadow-[4px_4px_0px_#DFBB7D] space-y-4">
              {/* Event Title Header */}
              <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 border-b border-white/10 pb-3">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-white text-base font-sans">{ev.title}</span>
                    <span className="px-2 py-0.5 bg-black/40 text-white/80 border border-white/20 text-[11px] font-mono">
                      #{ev.id} · {ev.category}
                    </span>
                    <span className={`px-2 py-0.5 text-[11px] font-bold uppercase border ${
                      ev.status === "live" ? "bg-emerald-600 text-white border-emerald-500" : "bg-white/10 text-white/60 border-white/20"
                    }`}>
                      {ev.status}
                    </span>
                  </div>
                  <p className="text-xs text-[#DFBB7D] mt-1 flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 text-red-400" />
                    {ev.venue || "No venue set"}
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 text-xs text-white/80 cursor-pointer font-bold">
                    <input
                      type="checkbox"
                      checked={ev.radio_promote ?? true}
                      onChange={(e) => handleFieldChange(ev.id, "radio_promote", e.target.checked)}
                      className="accent-[#DFBB7D] w-4 h-4"
                    />
                    Air on Radio
                  </label>

                  <button
                    onClick={() => handleSave(ev)}
                    disabled={savingId === ev.id}
                    className="px-4 py-1.5 bg-[#DFBB7D] hover:bg-[#F5C842] text-[#16181D] font-bold text-xs uppercase border border-[#16181D] shadow-[2px_2px_0px_#16181D] flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer"
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
                  <label className="block text-white/70 mb-1 font-bold">Gates Open At (EAT)</label>
                  <input
                    type="text"
                    placeholder="e.g. 2026-11-07 12:00:00+03"
                    value={ev.gates_open_at || ""}
                    onChange={(e) => handleFieldChange(ev.id, "gates_open_at", e.target.value)}
                    className="w-full bg-[#1A1D24] border border-white/20 p-2 text-white font-mono text-xs focus:outline-none focus:border-[#DFBB7D]"
                  />
                  <p className="text-[10px] text-white/50 mt-0.5">Used for hour countdowns ("gates open at noon")</p>
                </div>

                {/* Spoken Ticket URL */}
                <div>
                  <label className="block text-white/70 mb-1 font-bold flex items-center gap-1">
                    <Globe className="w-3.5 h-3.5 text-[#DFBB7D]" />
                    Spoken Ticket Phrase
                  </label>
                  <input
                    type="text"
                    placeholder="tickets on the Goodlife website"
                    value={ev.spoken_ticket_url || ""}
                    onChange={(e) => handleFieldChange(ev.id, "spoken_ticket_url", e.target.value)}
                    className="w-full bg-[#1A1D24] border border-white/20 p-2 text-white text-xs focus:outline-none focus:border-[#DFBB7D]"
                  />
                  <p className="text-[10px] text-white/50 mt-0.5">Never .co.ke! e.g. "tickets on the Goodlife website"</p>
                </div>

                {/* Radio Priority */}
                <div>
                  <label className="block text-white/70 mb-1 font-bold">Radio Airplay Priority</label>
                  <input
                    type="number"
                    value={ev.radio_priority ?? 0}
                    onChange={(e) => handleFieldChange(ev.id, "radio_priority", parseInt(e.target.value, 10) || 0)}
                    className="w-full bg-[#1A1D24] border border-white/20 p-2 text-white text-xs focus:outline-none focus:border-[#DFBB7D]"
                  />
                  <p className="text-[10px] text-white/50 mt-0.5">Higher number receives more drop rotation</p>
                </div>
              </div>

              {/* Lineup Section */}
              <div className="bg-[#121316] border border-white/10 p-3 space-y-2">
                <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-2">
                  <span className="font-bold text-white text-xs flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-[#DFBB7D]" />
                    Lineup Acts (Comma-separated)
                  </span>
                  <label className="flex items-center gap-1.5 text-xs text-[#DFBB7D] cursor-pointer font-bold">
                    <input
                      type="checkbox"
                      checked={Boolean(ev.lineup_confirmed)}
                      onChange={(e) => handleFieldChange(ev.id, "lineup_confirmed", e.target.checked)}
                      className="accent-[#DFBB7D] w-4 h-4"
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
                  className="w-full bg-[#1A1D24] border border-white/20 p-2 text-white text-xs focus:outline-none focus:border-[#DFBB7D]"
                />
                <p className="text-[10px] text-white/50">
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
