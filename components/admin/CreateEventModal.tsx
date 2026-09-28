"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, Sparkles, Calendar, Layers, Tent, MapPin, Tag } from "lucide-react";
import { Event } from "@/lib/supabase-db-types";

interface CreateEventModalProps {
  isOpen: boolean;
  onClose: () => void;
  onEventCreated: (event: Event) => void;
}

export default function CreateEventModal({ isOpen, onClose, onEventCreated }: CreateEventModalProps) {
  const [category, setCategory] = useState<"flagship" | "mini">("flagship");
  const [title, setTitle] = useState("GOODLIFE 5");
  const [subtitle, setSubtitle] = useState("MARARA CAMP, THIKA | OCT 31");
  const [tag, setTag] = useState("SMWHR INC / MARARA CAMP");
  const [venue, setVenue] = useState("MARARA CAMP, THIKA");
  const [tillNumber, setTillNumber] = useState("5761205");
  const [flyerUrl, setFlyerUrl] = useState("/flyer.png");
  const [eventDate, setEventDate] = useState("");
  const [status, setStatus] = useState<"live" | "scheduled">("scheduled");
  const [salesOpenDate, setSalesOpenDate] = useState("");
  const [salesCloseDate, setSalesCloseDate] = useState("");
  const [recapVideoUrl, setRecapVideoUrl] = useState("");
  const [maxTentInventory, setMaxTentInventory] = useState(30);
  const [maxSharedBeds, setMaxSharedBeds] = useState(12);
  const [recurrencePattern, setRecurrencePattern] = useState<"none" | "weekly" | "biweekly" | "monthly">("none");
  const [recurrenceDay, setRecurrenceDay] = useState("sunday");
  const [recurrenceTime, setRecurrenceTime] = useState("14:00");
  const [customScheduleText, setCustomScheduleText] = useState("");
  const [regulations, setRegulations] = useState(
    "Camp gate opens strictly at noon. Carry your PDF ticket or phone download for scanning. No outside drinks at Marara. Entry is strictly 18+ with original ID verification."
  );

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleCategorySwitch = (cat: "flagship" | "mini") => {
    setCategory(cat);
    if (cat === "mini") {
      setTitle("SUNDAY PARK & CHILL #13");
      setSubtitle("THE HUB GARDEN | EVERY SUNDAY");
      setTag("GOODLIFE MINI SESSIONS");
      setVenue("THE HUB GARDEN, NAIROBI");
      setMaxTentInventory(0);
      setMaxSharedBeds(0);
      setRecurrencePattern("weekly");
      setRecurrenceDay("sunday");
      setRecurrenceTime("14:00");
      setCustomScheduleText("EVERY SUNDAY | 2:00 PM TILL LATE");
      setRegulations("Gates open at 2:00 PM. Chill acoustic vibes, food trucks, and craft beverages. Carry your valid pass.");
    } else {
      setTitle("GOODLIFE 5");
      setSubtitle("MARARA CAMP, THIKA | OCT 31");
      setTag("SMWHR INC / MARARA CAMP");
      setVenue("MARARA CAMP, THIKA");
      setMaxTentInventory(30);
      setMaxSharedBeds(12);
      setRecurrencePattern("none");
      setCustomScheduleText("");
      setRegulations("Camp gate opens strictly at noon. Carry your PDF ticket or phone download for scanning. No outside drinks at Marara. Entry is strictly 18+ with original ID verification.");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError("Please provide an event title.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const payload = {
        title,
        subtitle,
        tag,
        venue,
        till_number: tillNumber,
        flyer_url: flyerUrl,
        logo_url: "",
        regulations,
        ticker_text: category === "mini" ? "SUNDAY CHILL VIBES ✦ ACOUSTIC SESSIONS ✦ FOOD & COCKTAILS ✦ " : "NO ENTRY WITHOUT VALIDATION ✦ STRICTLY 18+ ✦ ",
        event_date: eventDate ? new Date(eventDate).toISOString() : null,
        status,
        category,
        recurrence_pattern: recurrencePattern,
        recurrence_day: recurrenceDay,
        recurrence_time: recurrenceTime,
        custom_schedule_text: customScheduleText,
        sales_open_date: salesOpenDate ? new Date(salesOpenDate).toISOString() : null,
        sales_close_date: salesCloseDate ? new Date(salesCloseDate).toISOString() : null,
        recap_video_url: recapVideoUrl,
        max_tent_inventory: Number(maxTentInventory),
        max_shared_beds: Number(maxSharedBeds),
        is_active: status === "live"
      };

      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create event");
      }

      const newEvent = await res.json();
      onEventCreated(newEvent);
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to create event");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-navy/90 p-3 md:p-6 backdrop-blur-xs font-mono">
      <div className="relative w-full max-w-2xl max-h-[92vh] border-4 border-brand-navy bg-brand-off-white shadow-(--shadow-brut-2xl) flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b-4 border-brand-navy bg-brand-accent p-3.5 shrink-0">
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-brand-navy" />
            <h3 className="font-display text-lg md:text-xl uppercase text-brand-navy">
              CREATE EVENT OR MINI-SESSION
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 border-2 border-brand-navy bg-brand-navy text-brand-off-white hover:bg-brand-off-white hover:text-brand-navy transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-4 md:p-6 overflow-y-auto space-y-4 flex-1">
          {error && (
            <div className="p-3 bg-red-100 border-2 border-red-500 text-red-900 text-xs font-bold uppercase">
              {error}
            </div>
          )}

          {/* Category Selector Tabs */}
          <div>
            <label className="text-xs font-bold uppercase text-brand-navy block mb-1.5">
              EVENT FORMAT / PRESET:
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleCategorySwitch("flagship")}
                className={`py-2 px-3 border-2 border-brand-navy text-xs font-bold uppercase flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  category === "flagship"
                    ? "bg-brand-navy text-brand-off-white shadow-(--shadow-brut-xs)"
                    : "bg-white text-brand-navy/70 hover:bg-brand-bg"
                }`}
              >
                <span>⭐</span> MAJOR FESTIVAL (FLAGSHIP)
              </button>
              <button
                type="button"
                onClick={() => handleCategorySwitch("mini")}
                className={`py-2 px-3 border-2 border-brand-navy text-xs font-bold uppercase flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  category === "mini"
                    ? "bg-brand-navy text-brand-off-white shadow-(--shadow-brut-xs)"
                    : "bg-white text-brand-navy/70 hover:bg-brand-bg"
                }`}
              >
                <span>🌿</span> WEEKLY MINI-EVENT (PARK & CHILL)
              </button>
            </div>
          </div>

          {/* Title & Subtitle */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold uppercase text-brand-navy block mb-1">
                EVENT TITLE *
              </label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="E.g. GOODLIFE 5"
                className="w-full p-2 border-2 border-brand-navy bg-white text-xs font-bold uppercase focus:outline-none"
              />
            </div>
            <div>
              <label className="text-xs font-bold uppercase text-brand-navy block mb-1">
                SUBTITLE / DATE LINE
              </label>
              <input
                type="text"
                value={subtitle}
                onChange={(e) => setSubtitle(e.target.value)}
                placeholder="E.g. MARARA CAMP | OCT 31"
                className="w-full p-2 border-2 border-brand-navy bg-white text-xs font-bold uppercase focus:outline-none"
              />
            </div>
          </div>

          {/* Venue & Tag */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold uppercase text-brand-navy block mb-1">
                VENUE LOCATION
              </label>
              <input
                type="text"
                value={venue}
                onChange={(e) => setVenue(e.target.value)}
                className="w-full p-2 border-2 border-brand-navy bg-white text-xs font-bold uppercase focus:outline-none"
              />
            </div>
            <div>
              <label className="text-xs font-bold uppercase text-brand-navy block mb-1">
                CATEGORY TAG
              </label>
              <input
                type="text"
                value={tag}
                onChange={(e) => setTag(e.target.value)}
                className="w-full p-2 border-2 border-brand-navy bg-white text-xs font-bold uppercase focus:outline-none"
              />
            </div>
          </div>

          {/* Status & Event Date */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-bold uppercase text-brand-navy block mb-1">
                STATUS
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as any)}
                className="w-full p-2 border-2 border-brand-navy bg-white text-xs font-bold uppercase focus:outline-none"
              >
                <option value="scheduled">SCHEDULED (COUNTDOWN)</option>
                <option value="live">LIVE (CHECKOUT OPEN)</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-bold uppercase text-brand-navy block mb-1">
                EVENT DATE
              </label>
              <input
                type="date"
                value={eventDate}
                onChange={(e) => setEventDate(e.target.value)}
                className="w-full p-2 border-2 border-brand-navy bg-white text-xs font-bold uppercase focus:outline-none"
              />
            </div>
            <div>
              <label className="text-xs font-bold uppercase text-brand-navy block mb-1">
                PAYMENT TILL
              </label>
              <input
                type="text"
                value={tillNumber}
                onChange={(e) => setTillNumber(e.target.value)}
                className="w-full p-2 border-2 border-brand-navy bg-white text-xs font-bold uppercase focus:outline-none"
              />
            </div>
          </div>

          {/* Recurrence & Custom Schedule (Mini Events) */}
          {category === "mini" && (
            <div className="p-3 bg-brand-accent/15 border-2 border-brand-navy space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-bold uppercase text-brand-navy">
                  🔁 MINI-EVENT SCHEDULE CONFIGURATION:
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                <div>
                  <label className="text-[10px] font-bold uppercase text-brand-navy block mb-1">
                    RECURRENCE PATTERN
                  </label>
                  <select
                    value={recurrencePattern}
                    onChange={(e) => {
                      const pat = e.target.value as any;
                      setRecurrencePattern(pat);
                      if (pat === "weekly") {
                        setCustomScheduleText(`EVERY ${recurrenceDay.toUpperCase()} | ${recurrenceTime} TILL LATE`);
                      } else if (pat === "biweekly") {
                        setCustomScheduleText(`EVERY 2 WEEKS (${recurrenceDay.toUpperCase()}) | ${recurrenceTime}`);
                      } else if (pat === "monthly") {
                        setCustomScheduleText(`MONTHLY (${recurrenceDay.toUpperCase()}) | ${recurrenceTime}`);
                      } else {
                        setCustomScheduleText("");
                      }
                    }}
                    className="w-full p-1.5 border border-brand-navy bg-white text-xs font-bold uppercase focus:outline-none"
                  >
                    {/*
                      Only the patterns that lib/event-availability.ts can
                      actually schedule are offered. BI-WEEKLY and MONTHLY used
                      to be selectable here, but nothing implemented them: they
                      were stored and then ignored, so the schedule shown to
                      customers ("EVERY 2 WEEKS", "MONTHLY") would not match
                      when sales actually opened or closed. They need an
                      anchor week and an ordinal respectively, neither of which
                      is recorded in the schema. Rather than leave options that
                      silently lie, they are gone from the picker - use WEEKLY,
                      or one row per session.
                    */}
                    <option value="weekly">WEEKLY (EVERY WEEK)</option>
                    <option value="none">ONE-OFF / CUSTOM DATE ONLY</option>
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-bold uppercase text-brand-navy block mb-1">
                    DAY OF WEEK
                  </label>
                  <select
                    value={recurrenceDay}
                    disabled={recurrencePattern === "none"}
                    onChange={(e) => {
                      const day = e.target.value;
                      setRecurrenceDay(day);
                      if (recurrencePattern === "weekly") {
                        setCustomScheduleText(`EVERY ${day.toUpperCase()} | ${recurrenceTime} TILL LATE`);
                      } else if (recurrencePattern === "monthly") {
                        setCustomScheduleText(`MONTHLY (${day.toUpperCase()}) | ${recurrenceTime}`);
                      }
                    }}
                    className="w-full p-1.5 border border-brand-navy bg-white text-xs font-bold uppercase focus:outline-none disabled:opacity-50"
                  >
                    <option value="sunday">SUNDAY</option>
                    <option value="saturday">SATURDAY</option>
                    <option value="friday">FRIDAY</option>
                    <option value="thursday">THURSDAY</option>
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-bold uppercase text-brand-navy block mb-1">
                    START TIME
                  </label>
                  <input
                    type="text"
                    value={recurrenceTime}
                    placeholder="14:00"
                    onChange={(e) => {
                      setRecurrenceTime(e.target.value);
                      if (recurrencePattern !== "none") {
                        setCustomScheduleText(`EVERY ${recurrenceDay.toUpperCase()} | ${e.target.value} TILL LATE`);
                      }
                    }}
                    className="w-full p-1.5 border border-brand-navy bg-white text-xs font-bold focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase text-brand-navy block mb-1">
                  PUBLIC SCHEDULE DISPLAY TEXT:
                </label>
                <input
                  type="text"
                  value={customScheduleText}
                  onChange={(e) => setCustomScheduleText(e.target.value)}
                  placeholder="e.g. EVERY SUNDAY | 2:00 PM TILL LATE"
                  className="w-full p-1.5 border border-brand-navy bg-white text-xs font-bold uppercase focus:outline-none"
                />
              </div>
            </div>
          )}

          {/* Sales Window (ISO Scheduling Engine) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3 bg-brand-navy/5 border border-brand-navy/20">
            <div>
              <label className="text-[11px] font-bold uppercase text-brand-navy block mb-1">
                SALES OPEN DATE (OPTIONAL)
              </label>
              <input
                type="datetime-local"
                value={salesOpenDate}
                onChange={(e) => setSalesOpenDate(e.target.value)}
                className="w-full p-1.5 border border-brand-navy bg-white text-xs font-mono focus:outline-none"
              />
              <span className="text-[10px] text-brand-navy/60">Auto unlocks checkout when reached</span>
            </div>
            <div>
              <label className="text-[11px] font-bold uppercase text-brand-navy block mb-1">
                SALES CLOSE DATE (OPTIONAL)
              </label>
              <input
                type="datetime-local"
                value={salesCloseDate}
                onChange={(e) => setSalesCloseDate(e.target.value)}
                className="w-full p-1.5 border border-brand-navy bg-white text-xs font-mono focus:outline-none"
              />
              <span className="text-[10px] text-brand-navy/60">Auto cuts off online sales before gate</span>
            </div>
          </div>

          {/* Camping Inventories (For Flagship) */}
          {category === "flagship" && (
            <div className="grid grid-cols-2 gap-3 p-3 bg-brand-accent/10 border-2 border-brand-navy">
              <div>
                <label className="text-xs font-bold uppercase text-brand-navy block mb-1">
                  MAX PRIVATE TENTS
                </label>
                <input
                  type="number"
                  min="0"
                  value={maxTentInventory}
                  onChange={(e) => setMaxTentInventory(Number(e.target.value))}
                  className="w-full p-2 border-2 border-brand-navy bg-white text-xs font-bold focus:outline-none"
                />
              </div>
              <div>
                <label className="text-xs font-bold uppercase text-brand-navy block mb-1">
                  MAX SHARED DORM BEDS
                </label>
                <input
                  type="number"
                  min="0"
                  value={maxSharedBeds}
                  onChange={(e) => setMaxSharedBeds(Number(e.target.value))}
                  className="w-full p-2 border-2 border-brand-navy bg-white text-xs font-bold focus:outline-none"
                />
              </div>
            </div>
          )}

          {/* Flyer & Video URL */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold uppercase text-brand-navy block mb-1">
                FLYER IMAGE PATH
              </label>
              <input
                type="text"
                value={flyerUrl}
                onChange={(e) => setFlyerUrl(e.target.value)}
                className="w-full p-2 border-2 border-brand-navy bg-white text-xs font-mono focus:outline-none"
              />
            </div>
            <div>
              <label className="text-xs font-bold uppercase text-brand-navy block mb-1">
                RECAP VIDEO URL
              </label>
              <input
                type="text"
                value={recapVideoUrl}
                onChange={(e) => setRecapVideoUrl(e.target.value)}
                placeholder="/promo.mp4"
                className="w-full p-2 border-2 border-brand-navy bg-white text-xs font-mono focus:outline-none"
              />
            </div>
          </div>

          {/* Regulations */}
          <div>
            <label className="text-xs font-bold uppercase text-brand-navy block mb-1">
              HOUSE RULES & VENUE REGULATIONS
            </label>
            <textarea
              rows={3}
              value={regulations}
              onChange={(e) => setRegulations(e.target.value)}
              className="w-full p-2 border-2 border-brand-navy bg-white text-xs font-mono focus:outline-none"
            />
          </div>

          {/* Submit */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 border-4 border-brand-navy bg-brand-accent text-brand-navy font-display text-xl uppercase hover:bg-brand-navy hover:text-brand-off-white transition-colors cursor-pointer shadow-(--shadow-brut-xs)"
            >
              {loading ? "INITIALIZING EVENT..." : "CREATE & SEED EVENT TIERS →"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
