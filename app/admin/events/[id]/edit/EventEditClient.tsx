"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  Loader2,
  MessageSquare,
  Radio,
  Save,
  Upload,
  Video,
  X,
} from "lucide-react";
import type { Event, EventDetails } from "@/lib/supabase-db-types";
import {
  type StoryMediaItem,
  MAX_STORY_ITEMS,
  normalizeStoryMedia,
  seedStoryMediaFromLegacy,
} from "@/lib/story-media";
import { updateEvent, updateEventDetails } from "@/lib/supabase-db";
import {
  toDateInput,
  toDatetimeLocal,
  fromDatetimeLocal,
  normalizeLifecycleStatus,
} from "./edit-utils";
import StoryMediaManager from "@/components/admin/StoryMediaManager";
import { LIFECYCLE_STATUSES } from "./edit-constants";
import {
  getDefaultWhatsAppTemplate,
  getDefaultOperatorTemplate,
  getDefaultScanTemplate,
} from "./edit-defaults";

interface EditEventClientProps {
  event: Event;
  details: EventDetails;
}

function isEvent(event: unknown): event is Event {
  return typeof event === "object" && event !== null && "id" in event;
}

function isEventDetails(details: unknown): details is EventDetails {
  return typeof details === "object" && details !== null && "id" in details;
}

const FIELD_CLASS =
  "w-full px-3 py-2 border-2 border-[var(--brand-navy)] font-bold text-xs";
const LABEL_CLASS =
  "text-xs font-black uppercase block mb-1";

export default function EventEditClient({
  event: initialEvent,
  details: initialDetails,
}: EditEventClientProps) {
  const [event, setEvent] = useState<Event>(initialEvent);
  const [details, setDetails] = useState<EventDetails>(initialDetails);
  const [saving, setSaving] = useState<"status" | "form" | null>(null);
  const [statusSaving, setStatusSaving] = useState(false);
  const [statusError, setStatusError] = useState("");
  const [formError, setFormError] = useState("");
  const [unsaved, setUnsaved] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState<{
    timestamp: number;
    timeStr: string;
    title: string;
  } | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  // Seed the deck from legacy fields when story_media is empty, so the editor
  // does not open blank on events that still use flyer_url/video_url.
  const initialDeck =
    Array.isArray(initialEvent.story_media) && initialEvent.story_media.length > 0
      ? initialEvent.story_media
      : seedStoryMediaFromLegacy(initialEvent);

  const [form, setForm] = useState<Record<string, unknown>>({
    title: initialEvent.title,
    subtitle: initialEvent.subtitle,
    tag: initialEvent.tag,
    venue: initialEvent.venue,
    event_date: toDateInput(initialEvent.event_date),
    maps_url: initialEvent.maps_url,
    till_number: initialEvent.till_number,
    flyer_url: initialEvent.flyer_url,
    video_url: initialEvent.video_url,
    story_media: initialDeck,
    ticker_text: initialEvent.ticker_text,
    logo_url: initialEvent.logo_url,
    status: normalizeLifecycleStatus(initialEvent.status, initialEvent.is_active),
    sales_open_date: toDatetimeLocal(initialEvent.sales_open_date),
    sales_close_date: toDatetimeLocal(initialEvent.sales_close_date),
    next_event_title: initialEvent.next_event_title,
    custom_schedule_text: initialEvent.custom_schedule_text,
    payment_contact: details.payment_contact || "",
    whatsapp_message: details.whatsapp_message?.trim()
      ? details.whatsapp_message
      : getDefaultWhatsAppTemplate(),
    whatsapp_operator_template: details.whatsapp_operator_template?.trim()
      ? details.whatsapp_operator_template
      : getDefaultOperatorTemplate(),
    whatsapp_scan_template: details.whatsapp_scan_template?.trim()
      ? details.whatsapp_scan_template
      : getDefaultScanTemplate(),
    footer_title: details.footer_title || "",
    footer_legal: details.footer_legal || "",
    regulations: initialEvent.regulations,
    simulators_enabled: details.simulators_enabled ?? false,
    operator_notifications_enabled: details.operator_notifications_enabled ?? false,
    lineup: (initialEvent.lineup || []).join(", "),
    lineup_confirmed: initialEvent.lineup_confirmed ?? false,
  });

  const derivedScheduleText = React.useMemo(() => {
    const dateVal = form.event_date ? String(form.event_date) : "";
    if (!dateVal) return "OVERNIGHT CAMPING";
    try {
      const d = new Date(dateVal);
      const mon = d.toLocaleString("en-KE", { month: "short", timeZone: "Africa/Nairobi" }).toUpperCase();
      const day = d.getDate();
      return `${mon} ${day} • GATES OPEN 2:00 PM`;
    } catch {
      return "OVERNIGHT CAMPING";
    }
  }, [form.event_date]);

  const trackChange = useCallback(() => {
    if (!saving) {
      setUnsaved(true);
      setSaveSuccess(null);
    }
  }, [saving]);

  const set = useCallback(
    <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
      setForm((f) => ({ ...f, [key]: value }));
      trackChange();
    },
    [trackChange]
  );

  const handleStatusChange = async (nextStatus: (typeof LIFECYCLE_STATUSES)[number]) => {
    setStatusError("");
    setStatusSaving(true);
    try {
      const res = await fetch(`/api/events/${event.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus, is_active: nextStatus === "live" }),
      });
      if (!res.ok) {
        const detail = await res.json().catch(() => null);
        throw new Error(detail?.error || `Status update failed (HTTP ${res.status})`);
      }
      setEvent((e) => ({ ...e, status: nextStatus, is_active: nextStatus === "live" }));
      setForm((f) => ({ ...f, status: nextStatus }));
    } catch (err: any) {
      setStatusError(err?.message || "Failed to update status.");
    } finally {
      setStatusSaving(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setSaving("form");
    setFormError("");
    try {
      const storyMedia = normalizeStoryMedia(form.story_media);
      const firstPoster = storyMedia
        .map((item) => (item.kind === "poster" ? item.url : item.poster_url || ""))
        .find(Boolean);
      const firstVideo = storyMedia.find((item) => item.kind === "video")?.url;
      const nextStatus = normalizeLifecycleStatus(form.status, null);

      // event_details fields (whatsapp templates, footer, payment contact,
      // feature flags) live on the event_details singleton, not on the events
      // table. Save them first so the dashboard's eventDetails state stays
      // consistent with what the edit page just wrote.
      await updateEventDetails({
        id: 1,
        title: form.title as string,
        subtitle: form.subtitle as string,
        tag: form.tag as string,
        venue: form.venue as string,
        till_number: form.till_number as string,
        flyer_url: firstPoster || (form.flyer_url as string),
        regulations: form.regulations as string,
        ticker_text: form.ticker_text as string,
        logo_url: form.logo_url as string,
        maps_url: form.maps_url as string,
        payment_contact: (form.payment_contact as string) ?? "",
        whatsapp_message: (form.whatsapp_message as string) ?? "",
        whatsapp_operator_template: (form.whatsapp_operator_template as string) ?? "",
        whatsapp_scan_template: (form.whatsapp_scan_template as string) ?? "",
        footer_title: (form.footer_title as string) ?? "",
        footer_legal: (form.footer_legal as string) ?? "",
        simulators_enabled: (form.simulators_enabled as boolean) ?? false,
        operator_notifications_enabled: (form.operator_notifications_enabled as boolean) ?? false,
      });

      const updated = await updateEvent(event.id, {
        title: form.title as string,
        subtitle: form.subtitle as string,
        tag: form.tag as string,
        venue: form.venue as string,
        event_date: form.event_date as string | null,
        maps_url: form.maps_url as string,
        till_number: form.till_number as string,
        flyer_url: firstPoster || (form.flyer_url as string),
        video_url: firstVideo ?? (form.video_url as string | null),
        story_media: storyMedia,
        ticker_text: form.ticker_text as string,
        logo_url: form.logo_url as string,
        sales_open_date: fromDatetimeLocal(form.sales_open_date as string | null),
        sales_close_date: fromDatetimeLocal(form.sales_close_date as string | null),
        next_event_title: (form.next_event_title as string) ?? null,
        status: nextStatus,
        is_active: nextStatus === "live",
        custom_schedule_text: (form.custom_schedule_text as string) ?? null,
        regulations: (form.regulations as string) ?? "",
        lineup: typeof form.lineup === "string"
          ? (form.lineup as string).split(",").map((s) => s.trim()).filter(Boolean)
          : ((form.lineup as string[]) || []),
        lineup_confirmed: Boolean(form.lineup_confirmed),
      });

      if (!updated) throw new Error("Event update returned no data.");
      setEvent(updated);
      setDetails((d) => ({
        ...d,
        title: updated.title,
        subtitle: updated.subtitle,
        tag: updated.tag,
        venue: updated.venue,
        till_number: updated.till_number,
        flyer_url: updated.flyer_url,
        regulations: updated.regulations,
        ticker_text: updated.ticker_text,
        logo_url: updated.logo_url,
        maps_url: updated.maps_url || "",
      }));
      setForm((f) => ({
        ...f,
        status: normalizeLifecycleStatus(updated.status, updated.is_active),
        event_date: toDateInput(updated.event_date),
        sales_open_date: toDatetimeLocal(updated.sales_open_date),
        sales_close_date: toDatetimeLocal(updated.sales_close_date),
        lineup: (updated.lineup || []).join(", "),
        lineup_confirmed: updated.lineup_confirmed ?? false,
      }));
      setUnsaved(false);
      setSaveSuccess({
        timestamp: Date.now(),
        timeStr: new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }),
        title: updated.title,
      });
    } catch (err: any) {
      setFormError(err?.message || "Failed to save event.");
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--brand-off-white)]">
      <header className="border-b-2 border-[var(--brand-navy)] bg-[var(--brand-navy)] text-[var(--brand-off-white)]">
        <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <a
              href="/admin/dashboard"
              className="inline-flex items-center gap-1.5 text-xs font-black uppercase hover:underline"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back to Dashboard
            </a>
            <span className="text-[11px] text-[var(--brand-off-white)]/70 font-mono">
              /admin/events/{event.id}/edit
            </span>
          </div>
          <div className="flex items-center gap-3">
            {saveSuccess && !unsaved && (
              <span className="inline-flex items-center gap-1 text-[11px] font-mono font-bold text-emerald-400 bg-emerald-950/60 border border-emerald-500/40 px-2 py-0.5 rounded">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                SAVED {saveSuccess.timeStr}
              </span>
            )}
            {unsaved && (
              <span className="text-xs font-mono text-[var(--brand-off-white)]/80">
                ● Unsaved changes
              </span>
            )}
            <button
              type="button"
              onClick={() => formRef.current?.requestSubmit()}
              disabled={saving !== null}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 border-2 border-[var(--brand-off-white)] bg-brand-accent text-brand-navy hover:bg-white text-xs font-black uppercase transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              {saving === "form" ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-3.5 h-3.5" />
                  Save Changes
                </>
              )}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        <h1 className="text-xl font-black uppercase border-b-2 border-[var(--brand-navy)] pb-3 mb-6">
          Edit Event: {event.title}
        </h1>

        {saveSuccess && (
          <div className="mb-6 rounded border-2 border-emerald-600 bg-emerald-50 px-4 py-3 text-emerald-900 flex items-center justify-between gap-3 shadow-sm">
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              <div>
                <p className="text-xs font-black uppercase tracking-wide">
                  Changes Saved Successfully!
                </p>
                <p className="text-[11px] font-mono text-emerald-800">
                  Updated at {saveSuccess.timeStr} — Event metadata, dates and story deck are synced with the live site.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setSaveSuccess(null)}
              className="p-1 text-emerald-700 hover:text-emerald-950 font-mono text-xs cursor-pointer font-bold"
              aria-label="Dismiss"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {formError && (
          <div className="mb-6 rounded border-2 border-red-600 bg-red-600/10 px-4 py-3 text-xs font-bold text-red-700">
            {formError}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* LEFT COLUMN — metadata */}
          <form ref={formRef} onSubmit={handleSave} className="space-y-4">
            <section className="bg-white border-2 border-[var(--brand-navy)] p-4 space-y-4">
              <h2 className="text-xs font-black uppercase border-b border-[var(--brand-navy)]/20 pb-2">
                Lifecycle Status
              </h2>
              <div className="space-y-1">
                <select
                  value={form.status as string}
                  onChange={(e) => set("status", e.target.value)}
                  className={FIELD_CLASS}
                  disabled={saving !== null}
                >
                  <option value="live">🟢 Live (Ticket sales open)</option>
                  <option value="scheduled">🟡 Scheduled / Coming Soon</option>
                  <option value="closed">🔴 Concluded / Closed (recap page)</option>
                  <option value="archived">⚫ Archived (hidden from site)</option>
                </select>
                <p className="text-[10px] font-mono text-[var(--brand-navy)]/70">
                  Leave on <strong>Scheduled</strong> for a one-off edition: the site shows a
                  coming-soon page with a countdown, then switches to checkout once "Tickets
                  Open" passes and passes exist. Mini sessions are recurring series — whether
                  one is on is computed from their recurrence rules, so this field does not
                  control them.
                </p>
              </div>
              {statusError && (
                <p className="text-xs font-bold text-red-700">{statusError}</p>
              )}
            </section>

            <section className="bg-white border-2 border-[var(--brand-navy)] p-4 space-y-4">
              <h2 className="text-xs font-black uppercase border-b border-[var(--brand-navy)]/20 pb-2">
                Event Identity
              </h2>
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2 space-y-1">
                  <label className={LABEL_CLASS}>Event Title</label>
                  <input
                    type="text"
                    required
                    value={form.title as string}
                    onChange={(e) => set("title", e.target.value)}
                    className={FIELD_CLASS}
                    disabled={saving !== null}
                  />
                </div>
                <div className="space-y-1">
                  <label className={LABEL_CLASS}>Subtitle</label>
                  <input
                    type="text"
                    required
                    value={form.subtitle as string}
                    onChange={(e) => set("subtitle", e.target.value)}
                    className={FIELD_CLASS}
                    disabled={saving !== null}
                  />
                </div>
                <div className="space-y-1">
                  <label className={LABEL_CLASS}>Organizer Tag</label>
                  <input
                    type="text"
                    required
                    value={form.tag as string}
                    onChange={(e) => set("tag", e.target.value)}
                    className={FIELD_CLASS}
                    disabled={saving !== null}
                  />
                </div>
                <div className="space-y-1">
                  <label className={LABEL_CLASS}>Event Date</label>
                  <input
                    type="date"
                    value={toDateInput(form.event_date)}
                    onChange={(e) => set("event_date", e.target.value || null)}
                    className={FIELD_CLASS}
                    disabled={saving !== null}
                  />
                </div>
              </div>
            </section>

            <section className="bg-white border-2 border-[var(--brand-navy)] p-4 space-y-4">
              <h2 className="text-xs font-black uppercase border-b border-[var(--brand-navy)]/20 pb-2">
                Sales Window
              </h2>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className={LABEL_CLASS}>Tickets Open</label>
                  <input
                    type="datetime-local"
                    value={toDatetimeLocal(form.sales_open_date as string | null)}
                    onChange={(e) =>
                      set("sales_open_date", e.target.value || null)
                    }
                    className={FIELD_CLASS}
                    disabled={saving !== null}
                  />
                  <p className="text-[10px] font-mono text-[var(--brand-navy)]/70">
                    Kenya time. Before this moment the site shows the countdown instead of
                    checkout. Leave empty for "as soon as it goes live".
                  </p>
                </div>
                <div className="space-y-1">
                  <label className={LABEL_CLASS}>Tickets Close</label>
                  <input
                    type="datetime-local"
                    value={toDatetimeLocal(form.sales_close_date as string | null)}
                    onChange={(e) =>
                      set("sales_close_date", e.target.value || null)
                    }
                    className={FIELD_CLASS}
                    disabled={saving !== null}
                  />
                  <p className="text-[10px] font-mono text-[var(--brand-navy)]/70">
                    Kenya time. After this moment payment is refused and the page says sales
                    have closed.
                  </p>
                </div>
              </div>
            </section>

            <section className="bg-white border-2 border-[var(--brand-navy)] p-4 space-y-4">
              <h2 className="text-xs font-black uppercase border-b border-[var(--brand-navy)]/20 pb-2">
                Venue & Logistics
              </h2>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1 col-span-2">
                  <label className={LABEL_CLASS}>Venue Name</label>
                  <input
                    type="text"
                    required
                    value={form.venue as string}
                    onChange={(e) => set("venue", e.target.value)}
                    className={FIELD_CLASS}
                    disabled={saving !== null}
                  />
                </div>
                <div className="space-y-1 col-span-2">
                  <label className={LABEL_CLASS}>Google Maps Pin Link</label>
                  <div className="flex items-center justify-between gap-2">
                    <input
                      type="url"
                      required
                      value={form.maps_url as string}
                      onChange={(e) => set("maps_url", e.target.value)}
                      placeholder="https://maps.app.goo.gl/... or dropped pin"
                      className={`${FIELD_CLASS} font-mono`}
                      disabled={saving !== null}
                    />
                    {(form.maps_url as string) && (
                      <a
                        href={form.maps_url as string}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[10px] font-mono font-bold text-brand-navy hover:text-brand-accent underline flex items-center gap-0.5 shrink-0"
                      >
                        Test Pin ↗
                      </a>
                    )}
                  </div>
                </div>
                <div className="space-y-1">
                  <label className={LABEL_CLASS}>Till Number</label>
                  <input
                    type="text"
                    required
                    value={form.till_number as string}
                    onChange={(e) => set("till_number", e.target.value)}
                    className={FIELD_CLASS}
                    disabled={saving !== null}
                  />
                </div>
                <div className="space-y-1">
                  <label className={LABEL_CLASS}>Payment Contact (for till users)</label>
                  <input
                    type="text"
                    value={(form.payment_contact as string) || ""}
                    onChange={(e) => set("payment_contact", e.target.value)}
                    placeholder="+254 700 000 000"
                    className={FIELD_CLASS}
                    disabled={saving !== null}
                  />
                </div>
                <div className="space-y-1.5 col-span-2">
                  <div className="flex justify-between items-center">
                    <label className={LABEL_CLASS}>Schedule / Vibe Text</label>
                    {!(form.custom_schedule_text as string)?.trim() && (
                      <button
                        type="button"
                        onClick={() => set("custom_schedule_text", derivedScheduleText)}
                        className="text-[10px] font-mono font-bold text-blue-700 hover:underline uppercase cursor-pointer"
                        title="Click to copy the auto-derived text into this input for custom editing"
                      >
                        + Use auto-derived text
                      </button>
                    )}
                  </div>
                  <input
                    type="text"
                    value={(form.custom_schedule_text as string) || ""}
                    onChange={(e) => set("custom_schedule_text", e.target.value)}
                    placeholder="e.g. GATES OPEN 2PM • OVERNIGHT CAMPING"
                    className={FIELD_CLASS}
                    disabled={saving !== null}
                  />
                  <div className="text-[10px] space-y-1.5 font-mono">
                    <p className="text-[var(--brand-navy-light)] font-bold uppercase">
                      Shown in the date/time info box on the homepage. Leave blank to auto-derive from event date.
                    </p>
                    <div className="bg-stone-100 border border-brand-navy/30 p-2 text-xs flex items-center justify-between gap-2 flex-wrap">
                      <span className="font-bold opacity-70 uppercase text-[10px]">
                        Currently showing on homepage:
                      </span>
                      <span className="font-black text-brand-navy bg-white px-2 py-0.5 border border-brand-navy/20">
                        {(form.custom_schedule_text as string)?.trim() ? (
                          <>
                            <span className="text-emerald-700 font-bold mr-1">CUSTOM:</span>
                            &quot;{(form.custom_schedule_text as string).trim()}&quot;
                          </>
                        ) : (
                          <>
                            <span className="text-blue-700 font-bold mr-1">AUTO-DERIVED:</span>
                            &quot;{derivedScheduleText}&quot;
                          </>
                        )}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <section className="bg-white border-2 border-[var(--brand-navy)] p-4 space-y-4">
              <h2 className="text-xs font-black uppercase border-b border-[var(--brand-navy)]/20 pb-2">
                Branding
              </h2>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className={LABEL_CLASS}>Scrolling Marquee Text (Ticker)</label>
                  <input
                    type="text"
                    required
                    value={form.ticker_text as string}
                    onChange={(e) => set("ticker_text", e.target.value)}
                    className={FIELD_CLASS}
                    disabled={saving !== null}
                  />
                </div>
                <div className="space-y-1">
                  <label className={LABEL_CLASS}>
                    Custom Logo Image Path / URL (Optional)
                  </label>
                  <input
                    type="text"
                    value={(form.logo_url as string) || ""}
                    onChange={(e) => set("logo_url", e.target.value)}
                    placeholder="e.g. /custom-logo.png"
                    className={FIELD_CLASS}
                    disabled={saving !== null}
                  />
                </div>
                <div className="space-y-1">
                  <label className={LABEL_CLASS}>Next Edition Title</label>
                  <input
                    type="text"
                    value={(form.next_event_title as string) || ""}
                    onChange={(e) => set("next_event_title", e.target.value)}
                    className={FIELD_CLASS}
                    disabled={saving !== null}
                  />
                </div>
                <div className="space-y-1">
                  <label className={LABEL_CLASS}>Recap Video URL</label>
                  <input
                    type="text"
                    value={(form.recap_video_url as string) || ""}
                    onChange={(e) => set("recap_video_url", e.target.value)}
                    placeholder="/videos/recap.mp4"
                    className={FIELD_CLASS}
                    disabled={saving !== null}
                  />
                </div>
              </div>
            </section>

            <section className="bg-white border-2 border-[var(--brand-navy)] p-4 space-y-4">
              <h2 className="text-xs font-black uppercase border-b border-[var(--brand-navy)]/20 pb-2 flex items-center gap-2">
                <Radio className="w-3.5 h-3.5 text-brand-accent" />
                Artist Lineup (Broadcast & Radio Drops)
              </h2>
              <div className="space-y-4">
                <div className="space-y-1">
                  <label className={LABEL_CLASS}>Confirmed Artists & DJs (Comma Separated)</label>
                  <input
                    type="text"
                    value={(form.lineup as string) || ""}
                    onChange={(e) => set("lineup", e.target.value)}
                    placeholder="e.g. DJ Makuu, DJ Fusion, DJ AP, LRRY"
                    className={FIELD_CLASS}
                    disabled={saving !== null}
                  />
                  <p className="text-[11px] text-[var(--brand-navy-light)] font-bold">
                    Names of performers separated by commas.
                  </p>
                </div>
                <div className="flex items-start gap-2.5 bg-amber-500/10 border border-amber-500/30 p-3 rounded">
                  <input
                    type="checkbox"
                    id="lineup_confirmed"
                    checked={Boolean(form.lineup_confirmed)}
                    onChange={(e) => set("lineup_confirmed", e.target.checked)}
                    disabled={saving !== null}
                    className="h-4 w-4 mt-0.5 rounded border-2 border-[var(--brand-navy)] accent-[var(--brand-navy)] cursor-pointer"
                  />
                  <label htmlFor="lineup_confirmed" className="text-xs font-bold text-[var(--brand-navy)] cursor-pointer leading-tight">
                    <span>Lineup is officially confirmed for broadcast</span>
                    <span className="block text-[11px] text-amber-900/80 font-normal mt-0.5">
                      Required safety gate: Drop Engine will NEVER announce artist names on air unless this box is checked.
                    </span>
                  </label>
                </div>
              </div>
            </section>

            <section className="bg-white border-2 border-[var(--brand-navy)] p-4 space-y-4">
              <h2 className="text-xs font-black uppercase border-b border-[var(--brand-navy)]/20 pb-2">
                WhatsApp Templates
              </h2>
              <div className="space-y-4">
                <div className="space-y-1">
                  <label className={LABEL_CLASS}>
                    <span className="flex items-center gap-2">
                      <MessageSquare className="w-3 h-3" />
                      WhatsApp Message Template (optional)
                    </span>
                  </label>
                  <p className="text-[11px] text-[var(--brand-navy-light)] font-bold uppercase leading-tight">
                    Available variables:{" "}
                    <code className="bg-[var(--brand-navy)]/5 px-1 font-mono text-[11px]">
                      {"{{ticketId}}"}
                    </code>{" "}
                    <code className="bg-[var(--brand-navy)]/5 px-1 font-mono text-[11px]">
                      {"{{buyerName}}"}
                    </code>{" "}
                    <code className="bg-[var(--brand-navy)]/5 px-1 font-mono text-[11px]">
                      {"{{phoneNumber}}"}
                    </code>{" "}
                    <code className="bg-[var(--brand-navy)]/5 px-1 font-mono text-[11px]">
                      {"{{pdfUrl}}"}
                    </code>{" "}
                    <code className="bg-[var(--brand-navy)]/5 px-1 font-mono text-[11px]">
                      {"{{eventTitle}}"}
                    </code>{" "}
                    <code className="bg-[var(--brand-navy)]/5 px-1 font-mono text-[11px]">
                      {"{{eventSubtitle}}"}
                    </code>{" "}
                    <code className="bg-[var(--brand-navy)]/5 px-1 font-mono text-[11px]">
                      {"{{eventVenue}}"}
                    </code>{" "}
                    <code className="bg-[var(--brand-navy)]/5 px-1 font-mono text-[11px]">
                      {"{{eventMapsUrl}}"}
                    </code>{" "}
                    <code className="bg-[var(--brand-navy)]/5 px-1 font-mono text-[11px]">
                      {"{{eventRegulations}}"}
                    </code>
                  </p>
                  <textarea
                    rows={4}
                    value={(form.whatsapp_message as string) || ""}
                    onChange={(e) => set("whatsapp_message", e.target.value)}
                    placeholder="Leave empty to use the default template."
                    className="w-full px-3 py-2 border-2 border-[var(--brand-navy)] font-mono text-xs"
                    disabled={saving !== null}
                  />
                </div>
                <div className="space-y-1">
                  <label className={LABEL_CLASS}>
                    Operator WhatsApp Template (optional)
                  </label>
                  <p className="text-[11px] text-[var(--brand-navy-light)] font-bold uppercase leading-tight">
                    Available variables:{" "}
                    <code className="bg-[var(--brand-navy)]/5 px-1 font-mono text-[11px]">
                      {"{{buyerName}}"}
                    </code>{" "}
                    <code className="bg-[var(--brand-navy)]/5 px-1 font-mono text-[11px]">
                      {"{{ticketType}}"}
                    </code>{" "}
                    <code className="bg-[var(--brand-navy)]/5 px-1 font-mono text-[11px]">
                      {"{{quantity}}"}
                    </code>{" "}
                    <code className="bg-[var(--brand-navy)]/5 px-1 font-mono text-[11px]">
                      {"{{amountPaid}}"}
                    </code>{" "}
                    <code className="bg-[var(--brand-navy)]/5 px-1 font-mono text-[11px]">
                      {"{{reference}}"}
                    </code>
                  </p>
                  <textarea
                    rows={3}
                    value={(form.whatsapp_operator_template as string) || ""}
                    onChange={(e) =>
                      set("whatsapp_operator_template", e.target.value)
                    }
                    placeholder="Leave empty to use the default operator template."
                    className="w-full px-3 py-2 border-2 border-[var(--brand-navy)] font-mono text-xs"
                    disabled={saving !== null}
                  />
                </div>
                <div className="space-y-1">
                  <label className={LABEL_CLASS}>
                    Scan Notification Template (optional)
                  </label>
                  <p className="text-[11px] text-[var(--brand-navy-light)] font-bold uppercase leading-tight">
                    Available variables:{" "}
                    <code className="bg-[var(--brand-navy)]/5 px-1 font-mono text-[11px]">
                      {"{{buyerName}}"}
                    </code>{" "}
                    <code className="bg-[var(--brand-navy)]/5 px-1 font-mono text-[11px]">
                      {"{{ticketType}}"}
                    </code>{" "}
                    <code className="bg-[var(--brand-navy)]/5 px-1 font-mono text-[11px]">
                      {"{{ticketId}}"}
                    </code>{" "}
                    <code className="bg-[var(--brand-navy)]/5 px-1 font-mono text-[11px]">
                      {"{{scannerName}}"}
                    </code>{" "}
                    <code className="bg-[var(--brand-navy)]/5 px-1 font-mono text-[11px]">
                      {"{{scanTime}}"}
                    </code>
                  </p>
                  <textarea
                    rows={3}
                    value={(form.whatsapp_scan_template as string) || ""}
                    onChange={(e) => set("whatsapp_scan_template", e.target.value)}
                    placeholder="Leave empty to use the default scan template."
                    className="w-full px-3 py-2 border-2 border-[var(--brand-navy)] font-mono text-xs"
                    disabled={saving !== null}
                  />
                </div>
              </div>
            </section>              <section className="bg-white border-2 border-[var(--brand-navy)] p-4 space-y-4">
              <h2 className="text-xs font-black uppercase border-b border-[var(--brand-navy)]/20 pb-2">
                Site Footer
              </h2>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className={LABEL_CLASS}>Footer Title</label>
                  <input
                    type="text"
                    value={(form.footer_title as string) || ""}
                    onChange={(e) => set("footer_title", e.target.value)}
                    placeholder="e.g. GOODLIFE TICKETING"
                    className={FIELD_CLASS}
                    disabled={saving !== null}
                  />
                </div>
                <div className="space-y-1">
                  <label className={LABEL_CLASS}>Footer Legal Line</label>
                  <input
                    type="text"
                    value={(form.footer_legal as string) || ""}
                    onChange={(e) => set("footer_legal", e.target.value)}
                    placeholder="e.g. STRICTLY 18+ NO OUTSIDE DRINKS"
                    className={FIELD_CLASS}
                    disabled={saving !== null}
                  />
                </div>
              </div>
            </section>

            <section className="bg-white border-2 border-[var(--brand-navy)] p-4 space-y-4">
              <h2 className="text-xs font-black uppercase border-b border-[var(--brand-navy)]/20 pb-2">
                Feature Flags
              </h2>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-black uppercase block">Developer Simulators Panel</span>
                    <span className="text-[11px] text-[var(--brand-navy-light)] font-bold uppercase block">Toggle local checkout bypass simulators on homepage</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      set(
                        "simulators_enabled",
                        !(form.simulators_enabled as boolean)
                      );
                    }}
                    disabled={saving !== null}
                    className={`text-xs font-black px-4 py-2 border-2 uppercase transition-all cursor-pointer ${
                      (form.simulators_enabled as boolean) !== false
                        ? "bg-green-600 border-green-600 text-white"
                        : "bg-red-600 border-red-600 text-white"
                    }`}
                  >
                    {(form.simulators_enabled as boolean) !== false
                      ? "ENABLED"
                      : "DISABLED"}
                  </button>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-black uppercase block">Operator WhatsApp Notifications</span>
                    <span className="text-[11px] text-[var(--brand-navy-light)] font-bold uppercase block">Enable or disable operator broadcast alerts</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      set(
                        "operator_notifications_enabled",
                        !((form.operator_notifications_enabled as boolean) ?? false)
                      );
                    }}
                    disabled={saving !== null}
                    className={`text-xs font-black px-4 py-2 border-2 uppercase transition-all cursor-pointer ${
                      (form.operator_notifications_enabled as boolean) !== false
                        ? "bg-green-600 border-green-600 text-white"
                        : "bg-red-600 border-red-600 text-white"
                    }`}
                  >
                    {(form.operator_notifications_enabled as boolean) !== false
                      ? "ENABLED"
                      : "DISABLED"}
                  </button>
                </div>
              </div>
            </section>

            <section className="bg-white border-2 border-[var(--brand-navy)] p-4 space-y-4">
              <h2 className="text-xs font-black uppercase border-b border-[var(--brand-navy)]/20 pb-2">
                Regulations & Advisories
              </h2>
              <textarea
                required
                rows={4}
                value={(form.regulations as string) || ""}
                onChange={(e) => set("regulations", e.target.value)}
                className={FIELD_CLASS}
                disabled={saving !== null}
              />
            </section>

            <div className="flex justify-end gap-2 pt-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  window.location.href = "/admin/dashboard";
                }}
                className="px-4 py-2 border-2 border-[var(--brand-navy)] text-[var(--brand-navy)] text-xs font-black uppercase transition-all duration-150 active:scale-95"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving !== null}
                className="px-4 py-2 bg-[var(--brand-navy)] text-[var(--brand-off-white)] border-2 border-[var(--brand-navy)] text-xs font-black uppercase flex items-center gap-1 transition-all duration-150 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {saving === "form" ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="w-3.5 h-3.5" />
                    Save Changes
                  </>
                )}
              </button>
            </div>
          </form>

          {/* RIGHT COLUMN — story deck media */}
          <section className="lg:col-span-1 space-y-4">
            <div className="bg-white border-2 border-[var(--brand-navy)] p-4 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-black uppercase border-b border-[var(--brand-navy)]/20 pb-2">
                  Story Deck Media
                </h2>
                <span className="text-[10px] font-mono text-[var(--brand-navy)]/70">
                  {Array.isArray(form.story_media)
                    ? `${form.story_media.length} / ${MAX_STORY_ITEMS}`
                    : "0 / " + MAX_STORY_ITEMS}
                </span>
              </div>

              <StoryMediaManager
                value={form.story_media as StoryMediaItem[]}
                onChange={(items) => set("story_media", items)}
              />

              <div className="border-t border-[var(--brand-navy)]/10 pt-3 space-y-2">
                <p className="text-[10px] font-mono text-[var(--brand-navy)]/70">
                  The deck is capped at {MAX_STORY_ITEMS} slides. When non-empty, the first
                  poster slide syncs to <code className="bg-[var(--brand-navy)]/5 px-1 font-mono">flyer_url</code>{" "}
                  and the first video slide syncs to <code className="bg-[var(--brand-navy)]/5 px-1 font-mono">video_url</code>{" "}
                  on save, so the social card and the scheduled/closed pages keep showing the
                  same artwork.
                </p>
                {initialDeck.length > 0 && Array.isArray(initialEvent.story_media) === false && (
                  <p className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
                    This event had no custom slides yet, so the editor opened with the poster
                    and teaser already on the homepage. Add, remove or reorder slides above —
                    leaving it as-is keeps the homepage unchanged.
                  </p>
                )}
              </div>
            </div>

            {/* Live mini-preview */}
            <div className="bg-white border-2 border-[var(--brand-navy)] p-4 space-y-3">
              <h2 className="text-xs font-black uppercase border-b border-[var(--brand-navy)]/20 pb-2">
                Homepage Hero Preview
              </h2>
              <div className="aspect-video bg-[var(--brand-navy)] rounded border border-[var(--brand-navy)]/30 overflow-hidden">
                <StoryDeckMiniPreview
                  storyMedia={form.story_media as StoryMediaItem[]}
                  flyerUrl={form.flyer_url as string}
                  videoUrl={form.video_url as string | null}
                />
              </div>
              <p className="text-[10px] font-mono text-[var(--brand-navy)]/70 text-center">
                What the homepage hero will look like with the current deck.
              </p>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

function StoryDeckMiniPreview({
  storyMedia,
  flyerUrl,
  videoUrl,
}: {
  storyMedia: StoryMediaItem[];
  flyerUrl: string;
  videoUrl: string | null;
}) {
  const items = Array.isArray(storyMedia) ? storyMedia : [];
  const poster = items.find((i) => i.kind === "poster");
  const video = items.find((i) => i.kind === "video");
  const posterSrc = poster?.url || flyerUrl || "";
  const videoSrc = video?.url || videoUrl || "";
  const posterPoster = (video && video.poster_url) || posterSrc || "";

  return (
    <div className="w-full h-full flex flex-col gap-2 p-2">
      {posterSrc ? (
        <div className="w-full flex-1 min-h-0 relative">
          <img
            src={posterSrc}
            alt="Poster preview"
            className="w-full h-full object-cover"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
        </div>
      ) : (
        <div className="w-full flex-1 min-h-0 flex items-center justify-center text-[var(--brand-off-white)]/40 text-xs">
          No poster
        </div>
      )}
      {videoSrc ? (
        <div className="w-full aspect-video relative rounded overflow-hidden border border-[var(--brand-navy)]/30 bg-black">
          <video
            src={videoSrc}
            className="w-full h-full object-contain"
            muted
            loop
            playsInline
            onMouseEnter={(e) => {
              const v = (e.currentTarget as HTMLVideoElement);
              if (v.paused) v.play().catch(() => {});
            }}
            onMouseLeave={(e) => {
              const v = (e.currentTarget as HTMLVideoElement);
              v.pause();
            }}
            onError={(e) => {
              (e.currentTarget as HTMLVideoElement).style.display = "none";
            }}
          />
          {!posterSrc && posterPoster && (
            <img
              src={posterPoster}
              alt=""
              className="absolute inset-0 w-full h-full object-cover"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
          )}
        </div>
      ) : null}
    </div>
  );
}
