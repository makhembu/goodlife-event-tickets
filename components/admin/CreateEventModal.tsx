"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, Sparkles, Calendar, Layers, Tent, MapPin, Tag } from "lucide-react";
import { Event } from "@/lib/supabase-db-types";
import PosterUploader from "@/components/admin/PosterUploader";

/** Must stay in sync with the patterns lib/event-availability.ts schedules. */
type RecurrencePattern = "none" | "daily" | "weekly" | "biweekly";

/**
 * The default customer-facing schedule label for a recurrence triple.
 *
 * This is derived in ONE place on purpose. It used to be built by three
 * separate onChange handlers, and they disagreed: the day-of-week handler only
 * knew about `weekly`, so choosing BI-WEEKLY and then changing the day left the
 * label reading "EVERY 2 WEEKS (SUNDAY)" while the stored `recurrence_day` was
 * saturday - a label that lied about when sales would actually close. The time
 * handler was worse, firing for any non-`none` pattern and so writing
 * "EVERY SUNDAY | ..." onto a `daily` event.
 *
 * The label is only ever a *default*: the field stays freely editable, so an
 * admin can still write their own wording.
 */
function deriveScheduleText(pattern: RecurrencePattern, day: string, time: string): string {
  const d = day.toUpperCase();
  switch (pattern) {
    case "daily": return `EVERY DAY | ${time} TILL LATE`;
    case "weekly": return `EVERY ${d} | ${time} TILL LATE`;
    case "biweekly": return `EVERY 2 WEEKS (${d}) | ${time}`;
    default: return "";
  }
}

interface CreateEventModalProps {
  isOpen: boolean;
  onClose: () => void;
  onEventCreated: (event: Event) => void;
}

export default function CreateEventModal({ isOpen, onClose, onEventCreated }: CreateEventModalProps) {
  const [category, setCategory] = useState<"flagship" | "mini">("flagship");
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("MARARA CAMP, THIKA | OCT 31");
  const [tag, setTag] = useState("SMWHR INC / MARARA CAMP");
  const [venue, setVenue] = useState("");
  const [mapsUrl, setMapsUrl] = useState("https://www.google.com/maps/search/?api=1&query=Marara+Camp+Ventures+Thika");
  const [tillNumber, setTillNumber] = useState("");
  const [flyerUrl, setFlyerUrl] = useState("/flyer.png");
  const [videoUrl, setVideoUrl] = useState("/videos/goodlife-hype.mp4");
  const [eventDate, setEventDate] = useState("");
  const [status, setStatus] = useState<"live" | "scheduled">("scheduled");
  const [salesOpenDate, setSalesOpenDate] = useState("");
  const [salesCloseDate, setSalesCloseDate] = useState("");
  const [recapVideoUrl, setRecapVideoUrl] = useState("");
  const [maxTentInventory, setMaxTentInventory] = useState(30);
  const [maxSharedBeds, setMaxSharedBeds] = useState(12);
  const [recurrencePattern, setRecurrencePattern] = useState<RecurrencePattern>("none");
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
      setSubtitle("RIVERFRONT GARDEN, MARARA CAMP | EVERY SUNDAY");
      setTag("GOODLIFE MINI SESSIONS");
      setVenue("RIVERFRONT GARDEN, MARARA CAMP, THIKA");
      setMapsUrl("https://www.google.com/maps/search/?api=1&query=Marara+Camp+Ventures+Thika");
      setFlyerUrl("/flyer-park-chill.png");
      setVideoUrl("/videos/park-chill-speakers.mp4");
      setMaxTentInventory(0);
      setMaxSharedBeds(0);
      setRecurrencePattern("weekly");
      setRecurrenceDay("sunday");
      setRecurrenceTime("14:00");
      setCustomScheduleText("EVERY SUNDAY | 2:00 PM TILL LATE");
      setRegulations("Gates open at 2:00 PM. Chill acoustic vibes, food trucks, and craft beverages. Carry your valid pass.");
    } else {
      setTitle("");
      setSubtitle("MARARA CAMP, THIKA | OCT 31");
      setTag("SMWHR INC / MARARA CAMP");
      setVenue("");
      setMapsUrl("https://www.google.com/maps/search/?api=1&query=Marara+Camp+Ventures+Thika");
      setFlyerUrl("/flyer.png");
      setVideoUrl("/videos/goodlife-hype.mp4");
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
    if (!mapsUrl.trim()) {
      setError("Please provide a Google Maps pin or directions link for the venue.");
      return;
    }
    if (!/^https?:\/\//i.test(mapsUrl.trim())) {
      setError("Google Maps link must start with https:// or http://");
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
        maps_url: mapsUrl.trim(),
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
        video_url: videoUrl.trim() || null,
        max_tent_inventory: Number(maxTentInventory),
        max_shared_beds: Number(maxSharedBeds),
        // INTENT ONLY - "a flagship that should be live", not "make this the
        // homepage event". Whether the single `is_active` slot is actually free
        // is a data-integrity question, so it is enforced in `createEvent`
        // against the database rather than trusted from the client, which
        // anyone can POST to /api/events directly.
        //
        // This used to be `status === "live"`, which made a MINI festival
        // silently hijack the homepage slot from the GOODLIFE flagship.
        is_active: status === "live" && category === "flagship"
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

          {/* Venue & Google Maps Pin */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold uppercase text-brand-navy block mb-1">
                VENUE LOCATION (E.G. MARARA CAMP - THE GARDEN)
              </label>
              <input
                type="text"
                value={venue}
                onChange={(e) => setVenue(e.target.value)}
                className="w-full p-2 border-2 border-brand-navy bg-white text-xs font-bold uppercase focus:outline-none"
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-bold uppercase text-brand-navy">
                  GOOGLE MAPS PIN LINK *
                </label>
                {mapsUrl && (
                  <a
                    href={mapsUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[10px] font-mono font-bold text-brand-navy hover:text-brand-accent underline flex items-center gap-0.5"
                  >
                    Test Pin ↗
                  </a>
                )}
              </div>
              <input
                type="url"
                required
                value={mapsUrl}
                onChange={(e) => setMapsUrl(e.target.value)}
                placeholder="https://maps.app.goo.gl/... or dropped pin"
                className="w-full p-2 border-2 border-brand-navy bg-white text-xs font-mono font-bold focus:outline-none"
              />
            </div>
          </div>

          {/* Tag & Payment Till */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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

          {/* Status & Event Date */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
                      const pat = e.target.value as RecurrencePattern;
                      setRecurrencePattern(pat);
                      setCustomScheduleText(deriveScheduleText(pat, recurrenceDay, recurrenceTime));
                    }}
                    className="w-full p-1.5 border border-brand-navy bg-white text-xs font-bold uppercase focus:outline-none"
                  >
                    {/*
                      Only patterns that lib/event-availability.ts can actually
                      schedule are offered, so the schedule shown to customers
                      always matches when sales really open and close.

                      DAILY is a deliberate special case in that module: every
                      day is an occurrence day, so the usual "shut on session
                      day" rule would close a daily festival forever. A daily
                      festival therefore stays open, subject to status and any
                      explicit sales window.

                      BI-WEEKLY anchors to event_date - the week containing
                      event_date is an "on" week, and the next one is not - so
                      the date must be set to the first session.

                      MONTHLY needs an ordinal ("2nd Sunday") that the schema
                      does not store, so it is still not offered.
                    */}
                    <option value="daily">DAILY (EVERY DAY)</option>
                    <option value="weekly">WEEKLY (EVERY WEEK)</option>
                    <option value="biweekly">BI-WEEKLY (EVERY 2 WEEKS)</option>
                    <option value="none">ONE DAY ONLY (SINGLE DATE)</option>
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-bold uppercase text-brand-navy block mb-1">
                    DAY OF WEEK
                  </label>
                  <select
                    value={recurrenceDay}
                    disabled={recurrencePattern === "none" || recurrencePattern === "daily"}
                    onChange={(e) => {
                      const day = e.target.value;
                      setRecurrenceDay(day);
                      setCustomScheduleText(deriveScheduleText(recurrencePattern, day, recurrenceTime));
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
                      const time = e.target.value;
                      setRecurrenceTime(time);
                      setCustomScheduleText(deriveScheduleText(recurrencePattern, recurrenceDay, time));
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

          {/* Media: Flyer Poster */}
          <div>
            <PosterUploader
              value={flyerUrl}
              onChange={setFlyerUrl}
              label="POSTER IMAGE / ARTWORK"
            />
          </div>

          {/* Media: Hero Teaser Video & Recap Video URL */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold uppercase text-brand-navy block mb-1">
                HERO TEASER VIDEO URL
              </label>
              <input
                type="text"
                value={videoUrl}
                onChange={(e) => setVideoUrl(e.target.value)}
                placeholder="/videos/goodlife-hype.mp4"
                className="w-full p-2 border-2 border-brand-navy bg-white text-xs font-mono focus:outline-none"
              />
              <span className="text-[10px] text-brand-navy/60">Autoplays in Story Deck after 3.5s</span>
            </div>
            <div>
              <label className="text-xs font-bold uppercase text-brand-navy block mb-1">
                RECAP VIDEO URL (OPTIONAL)
              </label>
              <input
                type="text"
                value={recapVideoUrl}
                onChange={(e) => setRecapVideoUrl(e.target.value)}
                placeholder="/recap.mp4"
                className="w-full p-2 border-2 border-brand-navy bg-white text-xs font-mono focus:outline-none"
              />
              <span className="text-[10px] text-brand-navy/60">Displayed on recap page when closed</span>
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
