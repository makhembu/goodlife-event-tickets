"use client";

import React, { useState, useEffect, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion, AnimatePresence } from "motion/react";
import { Bell, Camera, Play, Radio, ArrowRight, Video, Layers, Store, Settings, Ticket as TicketIcon } from "lucide-react";
import { EventDetails, Event } from "@/lib/supabase-db";
import { canonicalStatus } from "@/lib/event-availability";
import LiveMiniEventBanner from "@/components/LiveMiniEventBanner";
import { HapticFeedback } from "@/components/ui/haptic-feedback";

interface ClosedEventClientPageProps {
  eventDetails: EventDetails;
  availableEvents?: Event[];
  liveMiniEvents?: Event[];
  galleryPhotoCount?: number;
  radioSetName?: string;
  radioSetDuration?: string;
}

export default function ClosedEventClientPage({ 
  eventDetails, 
  availableEvents = [], 
  liveMiniEvents = [],
  galleryPhotoCount,
  radioSetName,
  radioSetDuration,
}: ClosedEventClientPageProps) {
  const [waNumber, setWaNumber] = useState("");
  const [subscribed, setSubscribed] = useState(false);
  // Secret staff menu: 5 taps on the logo, same gesture as the checkout page.
  const [showSecretMenu, setShowSecretMenu] = useState(false);
  const logoTapCountRef = useRef(0);
  const logoTapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // This page renders no countdown. It used to, bound to THIS event's
  // `sales_open_date`, underneath a heading naming a DIFFERENT event
  // ("NEXT EDITION: GOODLIFE 4" hardcoded as a fallback). For a concluded event
  // that date is in the past, so the digits sat at 00:00:00:00 permanently
  // while the copy announced an imminent release. There is no future date on a
  // concluded event's own row to count to, and inventing one would repeat the
  // same lie — so the countdown moved to `ScheduledEventClientPage`, which
  // holds a real, future `sales_open_date` for the edition being announced.

  const handleSubscribe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!waNumber.trim()) return;
    try {
      const res = await fetch("/api/hub/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId: eventDetails.id || 1,
          phoneNumber: waNumber.trim()
        })
      });
      if (res.ok) {
        setSubscribed(true);
      }
    } catch (err) {
      console.error("Waitlist error:", err);
    }
  };

  const isVideo = eventDetails.recap_video_url && /\.(mp4|webm|ogg|mov|m4v)($|\?)/i.test(eventDetails.recap_video_url);

  return (
    <div className="min-h-screen bg-brand-bg py-8 px-4 md:px-12 text-brand-navy font-sans selection:bg-brand-accent selection:text-brand-off-white relative overflow-x-clip">
      <div className="absolute inset-0 z-0 pointer-events-none opacity-20"
           style={{ backgroundImage: 'radial-gradient(rgba(20,43,76,0.18) 1px, transparent 1px), radial-gradient(rgba(199,154,86,0.12) 1px, transparent 1px)', backgroundSize: '24px 24px, 48px 48px', backgroundPosition: '0 0, 12px 12px' }}></div>

      <div className="relative z-10 max-w-6xl mx-auto space-y-6 md:space-y-8">
        
        {/* HEADER */}
        <header className="w-full flex items-center justify-between border-b-4 border-brand-navy pb-4 md:pb-6">
          <div className="flex items-center gap-2 md:gap-3 shrink-0">
            {/* Tap 5x for the staff menu. This page used to be a dead end for
                staff once the public "Staff & POS" link was removed: the only
            {/* Tap 5x for the staff menu. This page used to be a dead end for
                staff once the public "Staff & POS" link was removed: the only
                checkout page had the 5-tap gesture, and this one did not. */}
            <button
              type="button"
              onClick={handleLogoTap}
              aria-label="Goodlife logo - tap five times for staff menu"
              className="flex items-center gap-2 md:gap-3 cursor-pointer select-none text-left touch-manipulation active:scale-[0.98] transition-transform"
            >
              <div className="p-2 border-2 border-brand-navy bg-brand-accent shadow-(--shadow-brut-sm-strong) flex items-center justify-center">
                {eventDetails.logo_url ? (
                  <img src={eventDetails.logo_url} alt="Logo" className="w-6 h-6 object-contain" />
                ) : (
                  <span className="font-display font-bold text-sm tracking-widest text-brand-navy">GL</span>
                )}
              </div>
              <span className="font-display text-2xl md:text-4xl tracking-wide uppercase text-brand-navy pt-1">GOODLIFE</span>
            </button>
          </div>
          <nav className="hidden md:flex items-center gap-4">
            <Link href="/" className="font-mono text-xs font-bold uppercase tracking-widest text-brand-navy hover:text-brand-accent transition-colors">Events</Link>
            <Link href="/gallery" className="font-mono text-xs font-bold uppercase tracking-widest text-brand-navy hover:text-brand-accent transition-colors">Gallery</Link>
            <Link href="/radio" className="font-mono text-xs font-bold uppercase tracking-widest text-brand-navy hover:text-brand-accent transition-colors">Radio</Link>
          </nav>
        </header>

        {/* SECRET STAFF MENU — 5 taps on the logo, matching the checkout page */}
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
                    <span className="font-display text-lg uppercase tracking-widest text-brand-accent">Staff Portal</span>
                  </div>
                  <button type="button" aria-label="Close staff menu" onClick={() => setShowSecretMenu(false)} className="text-brand-off-white/60 hover:text-brand-off-white text-xl leading-none cursor-pointer p-1">&times;</button>
                </div>
                <Link
                  href="/admin/dashboard"
                  onClick={() => setShowSecretMenu(false)}
                  className="font-mono text-xs uppercase tracking-wider border-2 border-brand-off-white/30 px-4 py-3 hover:bg-brand-off-white hover:text-brand-navy transition-colors flex items-center gap-2"
                >
                  <Settings className="w-4 h-4 text-brand-accent" /> Admin Console
                </Link>
                <Link
                  href="/scanner"
                  onClick={() => setShowSecretMenu(false)}
                  className="font-mono text-xs uppercase tracking-wider border-2 border-brand-accent/60 bg-brand-accent/10 px-4 py-3 hover:bg-brand-accent hover:text-brand-navy transition-colors flex items-center gap-2"
                >
                  <TicketIcon className="w-4 h-4 text-brand-accent" /> Gate Scanner
                </Link>
                <Link
                  href="/vendor/login"
                  onClick={() => setShowSecretMenu(false)}
                  className="font-mono text-xs uppercase tracking-wider border-2 border-brand-accent/60 bg-brand-accent/10 px-4 py-3 hover:bg-brand-accent hover:text-brand-navy transition-colors flex items-center gap-2"
                >
                  <Store className="w-4 h-4 text-brand-accent" /> Vendor POS Terminal
                </Link>
              </motion.div>
            </>
          )}
        </AnimatePresence>

        {/* EDITIONS SWITCHER (if multiple events exist) */}
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
                      {canonicalStatus(evt.status) === 'live' ? (
                        <span className="text-[9px] font-mono font-bold bg-green-500/20 text-green-400 px-1 py-0.2 border border-green-500/40">
                          LIVE
                        </span>
                      ) : canonicalStatus(evt.status) === "scheduled" ? (
                        /* Scheduled is not closed. Labelling it CLOSED put a
                           "SEASON CONCLUDED" badge on an event that has not
                           happened yet. */
                        <span className="text-[9px] font-mono font-bold bg-amber-400/20 text-amber-200 px-1 py-0.2 border border-amber-400/40">
                          SOON
                        </span>
                      ) : (
                        <span className="text-[9px] font-mono opacity-70 px-1 py-0.2 border border-white/20">
                          CLOSED
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          </section>
        )}

        {/* MINI-FESTIVAL PROMO */}
        <LiveMiniEventBanner events={liveMiniEvents} />

        {/* HERO RECAP */}
        <section className="border-4 border-brand-navy bg-brand-navy text-brand-off-white shadow-(--shadow-brut-2xl) overflow-hidden relative group">
          <div className="aspect-video w-full relative bg-black">
            {isVideo ? (
              <video src={eventDetails.recap_video_url} autoPlay muted loop playsInline className="w-full h-full object-cover opacity-60" />
            ) : eventDetails.recap_video_url || eventDetails.flyer_url ? (
              <Image src={eventDetails.recap_video_url || eventDetails.flyer_url} alt="Recap" fill className="object-cover opacity-60" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Video className="w-16 h-16 opacity-30" />
              </div>
            )}
            <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center z-10">
              <span className="bg-brand-accent text-brand-navy font-bold px-3 py-1 text-xs tracking-widest uppercase mb-4 shadow-(--shadow-brut-sm)">
                SEASON CONCLUDED
              </span>
              <h1 className="font-display text-4xl md:text-7xl uppercase tracking-wider text-brand-off-white drop-shadow-md">
                {eventDetails.title} HAS CONCLUDED
              </h1>
              <p className="font-mono text-sm md:text-base opacity-90 mt-2 tracking-widest uppercase">
                THANK YOU FOR SHARING THE VIBE WITH US
              </p>
            </div>
          </div>
        </section>

        {/* WHAT HAPPENS NEXT — no countdown, no invented edition name */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
          <div className="border-4 border-brand-navy bg-brand-accent p-6 md:p-8 shadow-(--shadow-brut-xl) flex flex-col justify-center">
            <h2 className="font-display text-3xl md:text-5xl uppercase tracking-wider text-brand-navy mb-3">
              {eventDetails.next_event_title ? (
                <>
                  Next up: <span className="text-brand-off-white [-webkit-text-stroke:1px_var(--color-brand-navy)]">{eventDetails.next_event_title}</span>
                </>
              ) : (
                "The next edition is being planned"
              )}
            </h2>
            <p className="font-mono text-sm font-bold tracking-widest uppercase text-brand-navy/85">
              {eventDetails.next_event_title
                ? "Dates and ticket drops are announced here first — join the list to get the ping."
                : "No date announced yet. Join the list and you'll be the first to know when there is one."}
            </p>
            <p className="font-mono text-[10px] text-brand-navy/70 uppercase mt-5">
              We only start a countdown once a real drop date is set — no fake timers.
            </p>
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
                  className="flex-1 border-4 border-brand-navy bg-brand-bg px-4 py-3 font-mono text-sm focus:outline-none focus:bg-brand-off-white text-brand-navy"
                />
                <button 
                  type="submit"
                  className="border-4 border-brand-navy bg-brand-navy text-brand-accent px-6 py-3 font-bold uppercase tracking-wider text-sm hover:bg-brand-accent hover:text-brand-navy transition-colors whitespace-nowrap shadow-(--shadow-brut-sm) active:translate-y-[2px] active:translate-x-[2px] active:shadow-none cursor-pointer"
                >
                  NOTIFY ME
                </button>
              </form>
            )}
          </div>
        </section>

        {/* GALLERIES & RADIO GRID */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
          
          <Link href="/gallery" className="group block border-4 border-brand-navy bg-brand-off-white shadow-(--shadow-brut-xl-soft) hover:shadow-(--shadow-brut-sm) hover:translate-x-1 hover:translate-y-1 transition-all overflow-hidden relative">
            <div className="aspect-video w-full bg-brand-navy/10 relative flex items-center justify-center">
              <Camera className="w-16 h-16 text-brand-navy opacity-20 group-hover:scale-110 transition-transform" />
            </div>
            <div className="p-4 md:p-6 border-t-4 border-brand-navy bg-brand-accent group-hover:bg-brand-navy group-hover:text-brand-off-white transition-colors flex justify-between items-center">
              <div>
                <h4 className="font-display text-xl uppercase tracking-wider">LATEST PHOTO DROP</h4>
                <p className="font-mono text-xs mt-1 opacity-80">
                  {galleryPhotoCount ? `BROWSE ALL ${galleryPhotoCount} HIGH-RES PHOTOS` : "BROWSE EVENT GALLERY"}
                </p>
              </div>
              <ArrowRight className="w-6 h-6" />
            </div>
          </Link>

          <Link href="/radio" className="group block border-4 border-brand-navy bg-brand-off-white shadow-(--shadow-brut-xl-soft) hover:shadow-(--shadow-brut-sm) hover:translate-x-1 hover:translate-y-1 transition-all overflow-hidden relative">
            <div className="aspect-video w-full bg-brand-navy relative flex flex-col items-center justify-center p-6 text-center text-brand-off-white">
              <Radio className="w-12 h-12 text-brand-accent mb-4" />
              <div className="font-mono text-[10px] tracking-widest text-brand-accent uppercase">Now Playing</div>
              <div className="font-display text-2xl uppercase mt-1">
                {radioSetName || "LIVE FESTIVAL DJ SET"}
              </div>
            </div>
            <div className="p-4 md:p-6 border-t-4 border-brand-navy bg-brand-off-white flex justify-between items-center">
              <div className="flex items-center gap-2 font-bold text-sm uppercase text-brand-navy">
                <Play className="w-5 h-5 fill-current" /> {radioSetDuration ? `PLAY SET (${radioSetDuration})` : "TAP TO LISTEN"}
              </div>
              <ArrowRight className="w-6 h-6" />
            </div>
          </Link>

        </section>

      </div>
    </div>
  );
}
