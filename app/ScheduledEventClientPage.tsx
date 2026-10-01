"use client";

import React, { useState, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion, AnimatePresence } from "motion/react";
import {
  Bell,
  Layers,
  Settings,
  Store,
  Ticket as TicketIcon,
  Video,
  CalendarClock,
} from "lucide-react";
import { EventDetails, Event } from "@/lib/supabase-db";
import { canonicalStatus } from "@/lib/event-availability";
import { useCountdown } from "@/hooks/useCountdown";
import LiveMiniEventBanner from "@/components/LiveMiniEventBanner";
import { HapticFeedback } from "@/components/ui/haptic-feedback";

interface ScheduledEventClientPageProps {
  eventDetails: EventDetails;
  availableEvents?: Event[];
  liveMiniEvents?: Event[];
  /**
   * True when we are here because the sales window is open but the event has no
   * ticket tiers yet — see the guard in `app/page.tsx`. Decided on the server
   * so the copy cannot disagree with the reason the page was chosen, and so the
   * component never has to read the clock during render.
   */
  tiersPending?: boolean;
}

function formatOpenDate(value: string | null | undefined) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  // Rendered in Kenya time on purpose: the admin sets this against EAT, and a
  // customer in California should still read the time the promoter intended.
  return d.toLocaleString("en-KE", {
    timeZone: "Africa/Nairobi",
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * The page for an event that is announced and real, but not on sale yet.
 *
 * This page used to not exist. `app/page.tsx` routed `status === 'scheduled'`
 * into `ClosedEventClientPage`, so a flagship whose tickets had not dropped yet
 * rendered "SEASON CONCLUDED", "{TITLE} HAS CONCLUDED" and "THANK YOU FOR
 * SHARING THE VIBE WITH US" - telling customers an event that had not happened
 * was over, and driving away exactly the people who came to buy.
 *
 * Deliberately absent: the recap video, the gallery and the radio. There is no
 * past edition on this page yet, and a "LATEST PHOTO DROP" card on an event
 * that has not happened is the same lie in a different font.
 */
export default function ScheduledEventClientPage({
  eventDetails,
  availableEvents = [],
  liveMiniEvents = [],
  tiersPending = false,
}: ScheduledEventClientPageProps) {
  const [waNumber, setWaNumber] = useState("");
  const [subscribed, setSubscribed] = useState(false);
  const [showSecretMenu, setShowSecretMenu] = useState(false);
  const logoTapCountRef = useRef(0);
  const logoTapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const timeLeft = useCountdown(eventDetails.sales_open_date);

  function handleLogoTap() {
    HapticFeedback.trigger("confirmation");
    logoTapCountRef.current += 1;
    if (logoTapTimerRef.current) clearTimeout(logoTapTimerRef.current);

    if (logoTapCountRef.current >= 5) {
      HapticFeedback.trigger("success");
      setShowSecretMenu(true);
      logoTapCountRef.current = 0;
    } else {
      logoTapTimerRef.current = setTimeout(() => {
        logoTapCountRef.current = 0;
      }, 2500);
    }
  }

  const handleSubscribe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!waNumber.trim()) return;
    try {
      const res = await fetch("/api/hub/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId: eventDetails.id || 1,
          phoneNumber: waNumber.trim(),
        }),
      });
      if (res.ok) setSubscribed(true);
    } catch (err) {
      console.error("Waitlist error:", err);
    }
  };

  const openDateLabel = formatOpenDate(eventDetails.sales_open_date);
  const eventDayLabel = formatOpenDate(eventDetails.event_date);
  const isVideoFlyer =
    !!eventDetails.flyer_url &&
    /\.(mp4|webm|ogg|mov|m4v)($|\?)/i.test(eventDetails.flyer_url);

  return (
    <div className="min-h-screen bg-brand-bg py-8 px-4 md:px-12 text-brand-navy font-sans selection:bg-brand-accent selection:text-brand-off-white relative overflow-x-clip">
      <div
        className="absolute inset-0 z-0 pointer-events-none opacity-20"
        style={{
          backgroundImage:
            "radial-gradient(rgba(20,43,76,0.18) 1px, transparent 1px), radial-gradient(rgba(199,154,86,0.12) 1px, transparent 1px)",
          backgroundSize: "24px 24px, 48px 48px",
          backgroundPosition: "0 0, 12px 12px",
        }}
      />

      <div className="relative z-10 max-w-6xl mx-auto space-y-6 md:space-y-8">
        {/* HEADER */}
        <header className="w-full flex items-center justify-between border-b-4 border-brand-navy pb-4 md:pb-6">
          <div className="flex items-center gap-2 md:gap-3 shrink-0">
            <button
              type="button"
              onClick={handleLogoTap}
              aria-label="Goodlife logo - tap five times for staff menu"
              className="flex items-center gap-2 md:gap-3 cursor-pointer select-none text-left touch-manipulation active:scale-[0.98] transition-transform"
            >
              <div className="p-2 border-2 border-brand-navy bg-brand-accent shadow-(--shadow-brut-sm-strong) flex items-center justify-center">
                {eventDetails.logo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={eventDetails.logo_url} alt="Logo" className="w-6 h-6 object-contain" />
                ) : (
                  <span className="font-display font-bold text-sm tracking-widest text-brand-navy">GL</span>
                )}
              </div>
              <span className="font-display text-2xl md:text-4xl tracking-wide uppercase text-brand-navy pt-1">
                GOODLIFE
              </span>
            </button>
          </div>
          <nav className="hidden md:flex items-center gap-4">
            <Link href="/" className="font-mono text-xs font-bold uppercase tracking-widest text-brand-navy hover:text-brand-accent transition-colors">
              Events
            </Link>
            <Link href="/login" className="font-mono text-xs font-bold uppercase tracking-widest text-brand-navy hover:text-brand-accent transition-colors">
              Staff
            </Link>
          </nav>
        </header>

        {/* SECRET STAFF MENU — 5 taps on the logo, matching the other pages */}
        <AnimatePresence>
          {showSecretMenu && (
            <>
              {/* Tap-outside dismiss backdrop */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setShowSecretMenu(false)}
                className="fixed inset-0 z-[95] bg-brand-navy/60 backdrop-blur-xs"
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: -16 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: -16 }}
                className="fixed top-4 right-4 z-[100] border-4 border-brand-navy bg-brand-navy text-brand-off-white p-4 shadow-(--shadow-brut-xl-accent) flex flex-col gap-3 w-[90vw] max-w-[280px]"
              >
                <div className="flex items-center justify-between border-b-2 border-brand-off-white/20 pb-2 mb-1">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-brand-accent animate-ping" />
                    <span className="font-display text-lg uppercase tracking-widest text-brand-accent">
                      Staff Portal
                    </span>
                  </div>
                  <button
                    type="button"
                    aria-label="Close staff menu"
                    onClick={() => setShowSecretMenu(false)}
                    className="text-brand-off-white/60 hover:text-brand-off-white text-xl leading-none cursor-pointer p-1"
                  >
                    &times;
                  </button>
                </div>
                <Link href="/admin/dashboard" onClick={() => setShowSecretMenu(false)} className="font-mono text-xs uppercase tracking-wider border-2 border-brand-off-white/30 px-4 py-3 hover:bg-brand-off-white hover:text-brand-navy transition-colors flex items-center gap-2">
                  <Settings className="w-4 h-4 text-brand-accent" /> Admin Console
                </Link>
                <Link href="/scanner" onClick={() => setShowSecretMenu(false)} className="font-mono text-xs uppercase tracking-wider border-2 border-brand-accent/60 bg-brand-accent/10 px-4 py-3 hover:bg-brand-accent hover:text-brand-navy transition-colors flex items-center gap-2">
                  <TicketIcon className="w-4 h-4 text-brand-accent" /> Gate Scanner
                </Link>
                <Link href="/vendor/login" onClick={() => setShowSecretMenu(false)} className="font-mono text-xs uppercase tracking-wider border-2 border-brand-accent/60 bg-brand-accent/10 px-4 py-3 hover:bg-brand-accent hover:text-brand-navy transition-colors flex items-center gap-2">
                  <Store className="w-4 h-4 text-brand-accent" /> Vendor POS Terminal
                </Link>
              </motion.div>
            </>
          )}
        </AnimatePresence>

        {/* EDITIONS SWITCHER */}
        {availableEvents.length > 1 && (
          <section className="border-4 border-brand-navy bg-brand-navy p-3 md:p-4 text-brand-off-white shadow-(--shadow-brut-md)">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-brand-accent" />
                <span className="font-mono text-xs font-bold uppercase tracking-wider text-brand-accent">
                  EDITIONS:
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {availableEvents.map((evt) => {
                  const isCurrent = evt.id === eventDetails.id;
                  // `canonicalStatus` folds the legacy `'active'` spelling, so
                  // an event saved through the old admin dropdown is not
                  // mislabelled CLOSED here.
                  const status = canonicalStatus(evt.status);
                  const badge =
                    status === "live" ? "LIVE" : status === "scheduled" ? "SOON" : "CLOSED";
                  const tone =
                    status === "live"
                      ? "bg-green-500/20 text-green-400 border-green-500/40"
                      : status === "scheduled"
                      ? "bg-amber-400/20 text-amber-200 border-amber-400/40"
                      : "opacity-70 border-white/20";
                  return (
                    <Link
                      key={evt.id}
                      href={`/?event=${evt.id}`}
                      className={`py-1.5 px-3 border-2 font-display text-xs md:text-sm uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer ${
                        isCurrent
                          ? "border-brand-accent bg-brand-accent text-brand-navy font-bold shadow-(--shadow-brut-sm)"
                          : "border-brand-off-white/40 bg-brand-navy/60 text-brand-off-white hover:border-brand-accent hover:text-brand-accent"
                      }`}
                    >
                      <span>{evt.title}</span>
                      <span className={`text-[9px] font-mono font-bold px-1 py-0.2 border ${tone}`}>
                        {badge}
                      </span>
                    </Link>
                  );
                })}
              </div>
            </div>
          </section>
        )}

        {/* MINI-FESTIVAL PROMO — the one thing on this page that can be bought */}
        <LiveMiniEventBanner events={liveMiniEvents} />

        {/* HERO: COMING SOON */}
        <section className="border-4 border-brand-navy bg-brand-navy text-brand-off-white shadow-(--shadow-brut-2xl) overflow-hidden relative">
          <div className="aspect-video w-full relative bg-black">
            {eventDetails.video_url || isVideoFlyer ? (
              <video src={eventDetails.video_url || eventDetails.flyer_url} autoPlay muted loop playsInline className="w-full h-full object-cover opacity-60" />
            ) : eventDetails.flyer_url ? (
              <Image src={eventDetails.flyer_url} alt={eventDetails.title} fill className="object-cover opacity-60" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Video className="w-16 h-16 opacity-30" />
              </div>
            )}
            <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center z-10">
              <span className="bg-brand-accent text-brand-navy font-bold px-3 py-1 text-xs tracking-widest uppercase mb-4 shadow-(--shadow-brut-sm)">
                COMING SOON
              </span>
              <h1 className="font-display text-4xl md:text-7xl uppercase tracking-wider text-brand-off-white drop-shadow-md">
                {eventDetails.title}
              </h1>
              <p className="font-mono text-sm md:text-base opacity-90 mt-2 tracking-widest uppercase">
                {tiersPending
                  ? "FINAL PRICING BEING CONFIRMED — CHECK BACK SOON"
                  : "TICKETS DROP SOON — JOIN THE LIST BELOW"}
              </p>
              {eventDayLabel && (
                <p className="font-mono text-xs md:text-sm opacity-80 mt-2 tracking-widest uppercase">
                  {eventDayLabel}
                </p>
              )}
              {eventDetails.venue && (
                <p className="font-mono text-xs opacity-70 mt-1 tracking-widest uppercase">
                  {eventDetails.venue}
                </p>
              )}
            </div>
          </div>
        </section>

        {/* COUNTDOWN + WAITLIST */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
          <div className="border-4 border-brand-navy bg-brand-accent p-6 md:p-8 shadow-(--shadow-brut-xl) flex flex-col justify-center">
            <h2 className="font-display text-3xl md:text-5xl uppercase tracking-wider text-brand-navy mb-2">
              {tiersPending ? "PASSES BEING FINALISED" : "TICKETS DROP IN"}
            </h2>
            <p className="font-mono text-sm font-bold tracking-widest uppercase text-brand-navy mb-6">
              {tiersPending
                ? "ON SALE SHORTLY"
                : openDateLabel
                ? `FROM ${openDateLabel}`
                : "DATE TO BE ANNOUNCED"}
            </p>
            {tiersPending ? (
              // No digits here. The drop date has already passed, so a countdown
              // would sit at 00:00:00:00 and imply something imminent - the same
              // dead timer the recap page used to show. An honest status beats a
              // frozen clock.
              <p className="font-mono text-sm md:text-base text-brand-navy/85 uppercase leading-relaxed border-2 border-dashed border-brand-navy/50 p-4">
                Pricing and passes for this edition are still being set up. This page turns
                itself into checkout the moment they are live — no need to reload.
              </p>
            ) : (
              <>
                <div className="grid grid-cols-4 gap-2 md:gap-4 mb-6">
                  {[
                    { label: "DAYS", val: timeLeft.days },
                    { label: "HRS", val: timeLeft.hours },
                    { label: "MINS", val: timeLeft.minutes },
                    { label: "SECS", val: timeLeft.seconds },
                  ].map((t) => (
                    <div key={t.label} className="border-2 border-brand-navy bg-brand-off-white p-2 md:p-4 text-center shadow-(--shadow-brut-sm)">
                      <div className="font-display text-3xl md:text-5xl text-brand-navy">
                        {t.val.toString().padStart(2, "0")}
                      </div>
                      <div className="font-mono text-[10px] md:text-xs font-bold mt-1 text-brand-navy/70">
                        {t.label}
                      </div>
                    </div>
                  ))}
                </div>
                <p className="font-mono text-[10px] text-brand-navy/70 uppercase flex items-center gap-1.5">
                  <CalendarClock className="w-3.5 h-3.5" />
                  This page refreshes itself when sales open — no need to reload.
                </p>
              </>
            )}
          </div>

          {/* WAITLIST FORM */}
          <div className="border-4 border-brand-navy bg-brand-off-white p-6 md:p-8 shadow-(--shadow-brut-xl-soft) flex flex-col justify-center">
            <h3 className="font-display text-2xl md:text-3xl uppercase tracking-wider text-brand-navy mb-3">
              EARLY-BIRD DROP PING
            </h3>
            <p className="font-mono text-sm text-brand-navy/80 mb-6">
              Get notified on WhatsApp the exact second tickets drop. Early birds sell out in minutes.
            </p>
            {subscribed ? (
              <div className="bg-brand-success-bg border-2 border-brand-success text-brand-success p-4 font-bold flex items-center gap-2">
                <Bell className="w-5 h-5" /> You&apos;re on the list! We&apos;ll ping you.
              </div>
            ) : (
              <form onSubmit={handleSubscribe} className="flex flex-col sm:flex-row gap-3">
                <input
                  type="tel"
                  placeholder="0712 345 678"
                  required
                  value={waNumber}
                  onChange={(e) => setWaNumber(e.target.value)}
                  className="flex-1 px-4 py-3 border-2 border-brand-navy bg-white font-bold text-sm focus:outline-none focus:ring-2 focus:ring-brand-navy"
                />
                <button
                  type="submit"
                  className="px-6 py-3 bg-brand-navy text-brand-accent font-display text-sm uppercase tracking-wider border-2 border-brand-navy hover:bg-brand-accent hover:text-brand-navy transition-colors cursor-pointer shadow-(--shadow-brut-sm)"
                >
                  <span className="inline-flex items-center gap-2">
                    <Bell className="w-4 h-4" /> Notify Me
                  </span>
                </button>
              </form>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}