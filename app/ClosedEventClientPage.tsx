"use client";

import React, { useState, useEffect, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion, AnimatePresence } from "motion/react";
import { Bell, Camera, Play, Radio, ArrowRight, Video, Layers, Store, Settings, Ticket as TicketIcon } from "lucide-react";
import { EventDetails, Event } from "@/lib/supabase-db";

interface ClosedEventClientPageProps {
  eventDetails: EventDetails;
  availableEvents?: Event[];
  liveMiniEvents?: Event[];
}

export default function ClosedEventClientPage({ 
  eventDetails, 
  availableEvents = [], 
  liveMiniEvents = [] 
}: ClosedEventClientPageProps) {
  const [waNumber, setWaNumber] = useState("");
  const [subscribed, setSubscribed] = useState(false);
  const [timeLeft, setTimeLeft] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 });
  // Secret staff menu: 5 taps on the logo, same gesture as the checkout page.
  const [showSecretMenu, setShowSecretMenu] = useState(false);
  const [logoTapCount, setLogoTapCount] = useState(0);
  const logoTapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleLogoTap() {
    const next = logoTapCount + 1;
    setLogoTapCount(next);
    if (logoTapTimerRef.current) clearTimeout(logoTapTimerRef.current);
    if (next >= 5) {
      setShowSecretMenu(true);
      setLogoTapCount(0);
    } else {
      logoTapTimerRef.current = setTimeout(() => setLogoTapCount(0), 2000);
    }
  }

  useEffect(() => {
    // If no sales open date is specified, show 00:00:00:00
    if (!eventDetails.sales_open_date) {
      setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0 });
      return;
    }

    const openDate = new Date(eventDetails.sales_open_date).getTime();

    const updateTimer = () => {
      const now = new Date().getTime();
      const distance = openDate - now;

      if (distance <= 0) {
        setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0 });
      } else {
        setTimeLeft({
          days: Math.floor(distance / (1000 * 60 * 60 * 24)),
          hours: Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
          minutes: Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60)),
          seconds: Math.floor((distance % (1000 * 60)) / 1000)
        });
      }
    };

    updateTimer();
    const timer = setInterval(updateTimer, 1000);
    return () => clearInterval(timer);
  }, [eventDetails.sales_open_date]);

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
                checkout page had the 5-tap gesture, and this one did not. */}
            <button
              type="button"
              onClick={handleLogoTap}
              aria-label="Goodlife logo"
              className="p-2 border-2 border-brand-navy bg-brand-accent shadow-(--shadow-brut-sm-strong) flex items-center justify-center cursor-pointer active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all"
            >
              {eventDetails.logo_url ? (
                <img src={eventDetails.logo_url} alt="Logo" className="w-6 h-6 object-contain" />
              ) : (
                <span className="font-display font-bold text-sm tracking-widest text-brand-navy">GL</span>
              )}
            </button>
            <span className="font-display text-2xl md:text-4xl tracking-wide uppercase text-brand-navy pt-1">GOODLIFE</span>
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
            <motion.div
              initial={{ opacity: 0, y: -16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              className="fixed top-4 right-4 z-50 border-4 border-brand-navy bg-brand-navy text-brand-off-white p-4 shadow-(--shadow-brut-xl-accent) flex flex-col gap-3 w-[90vw] max-w-[280px]"
            >
              <div className="flex items-center justify-between border-b-2 border-brand-off-white/20 pb-2 mb-1">
                <span className="font-display text-lg uppercase tracking-widest text-brand-accent">Staff Only</span>
                <button type="button" aria-label="Close staff menu" onClick={() => setShowSecretMenu(false)} className="text-brand-off-white/60 hover:text-brand-off-white text-xl leading-none">&times;</button>
              </div>
              <Link
                href="/admin/dashboard"
                onClick={() => setShowSecretMenu(false)}
                className="font-mono text-xs uppercase tracking-wider border-2 border-brand-off-white/30 px-4 py-3 hover:bg-brand-off-white hover:text-brand-navy transition-colors flex items-center gap-2"
              >
                <Settings className="w-4 h-4" /> Admin Console
              </Link>
              <Link
                href="/admin/scanner"
                onClick={() => setShowSecretMenu(false)}
                className="font-mono text-xs uppercase tracking-wider border-2 border-brand-accent/60 bg-brand-accent/10 px-4 py-3 hover:bg-brand-accent hover:text-brand-navy transition-colors flex items-center gap-2"
              >
                <TicketIcon className="w-4 h-4" /> Gate Scanner
              </Link>
              <Link
                href="/vendor/login"
                onClick={() => setShowSecretMenu(false)}
                className="font-mono text-xs uppercase tracking-wider border-2 border-brand-accent/60 bg-brand-accent/10 px-4 py-3 hover:bg-brand-accent hover:text-brand-navy transition-colors flex items-center gap-2"
              >
                <Store className="w-4 h-4" /> Vendor POS Terminal
              </Link>
            </motion.div>
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
                      {evt.status === 'live' ? (
                        <span className="text-[9px] font-mono font-bold bg-green-500/20 text-green-400 px-1 py-0.2 border border-green-500/40">
                          LIVE
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

        {/* LIVE MINI-EVENT ANNOUNCEMENT CALLOUT */}
        {liveMiniEvents.length > 0 && (
          <section className="border-4 border-brand-navy bg-brand-accent p-5 md:p-6 shadow-(--shadow-brut-xl) flex flex-col md:flex-row items-center justify-between gap-4 animate-in fade-in duration-300">
            <div className="space-y-1.5 text-center md:text-left">
              <div className="flex flex-wrap items-center justify-center md:justify-start gap-2">
                <span className="px-2.5 py-0.5 border-2 border-brand-navy bg-brand-navy text-brand-off-white text-[10px] font-mono font-bold uppercase tracking-wider">
                  HAPPENING THIS WEEK
                </span>
                <span className="px-2 py-0.5 border border-brand-navy/60 bg-brand-off-white text-brand-navy text-[10px] font-mono font-bold uppercase">
                  {liveMiniEvents[0].custom_schedule_text || (liveMiniEvents[0].recurrence_pattern && liveMiniEvents[0].recurrence_pattern !== 'none' ? `EVERY ${liveMiniEvents[0].recurrence_day?.toUpperCase()} | ${liveMiniEvents[0].recurrence_time}` : 'GOODLIFE MINI SESSIONS')}
                </span>
              </div>
              <h3 className="font-display text-2xl md:text-4xl uppercase tracking-wider text-brand-navy">
                {liveMiniEvents[0].title} IS LIVE NOW
              </h3>
              <p className="font-mono text-xs md:text-sm uppercase text-brand-navy/80 font-bold">
                {liveMiniEvents[0].venue} • PASSES & FREE RSVP AVAILABLE
              </p>
            </div>
            <Link
              href={`/?event=${liveMiniEvents[0].id}`}
              className="w-full md:w-auto text-center border-4 border-brand-navy bg-brand-navy text-brand-accent px-6 py-3.5 font-display text-lg md:text-xl uppercase tracking-wider hover:bg-brand-off-white hover:text-brand-navy transition-all shadow-(--shadow-brut-sm) active:translate-x-[2px] active:translate-y-[2px] whitespace-nowrap"
            >
              GET PASSES & RSVP →
            </Link>
          </section>
        )}

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

        {/* NEXT EDITION COUNTDOWN */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
          <div className="border-4 border-brand-navy bg-brand-accent p-6 md:p-8 shadow-(--shadow-brut-xl) flex flex-col justify-center">
            <h2 className="font-display text-3xl md:text-5xl uppercase tracking-wider text-brand-navy mb-2">
              NEXT EDITION: {eventDetails.next_event_title || "GOODLIFE 4"}
            </h2>
            <p className="font-mono text-sm font-bold tracking-widest uppercase text-brand-navy mb-6">
              TICKETS DROP IN:
            </p>
            <div className="grid grid-cols-4 gap-2 md:gap-4 mb-6">
              {[
                { label: "DAYS", val: timeLeft.days },
                { label: "HRS", val: timeLeft.hours },
                { label: "MINS", val: timeLeft.minutes },
                { label: "SECS", val: timeLeft.seconds }
              ].map((t) => (
                <div key={t.label} className="border-2 border-brand-navy bg-brand-off-white p-2 md:p-4 text-center shadow-(--shadow-brut-sm)">
                  <div className="font-display text-3xl md:text-5xl text-brand-navy">{t.val.toString().padStart(2, '0')}</div>
                  <div className="font-mono text-[10px] md:text-xs font-bold mt-1 text-brand-navy/70">{t.label}</div>
                </div>
              ))}
            </div>
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
                <Bell className="w-5 h-5" /> You're on the list! We'll ping you.
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
                <p className="font-mono text-xs mt-1 opacity-80">BROWSE ALL 140+ HIGH-RES PHOTOS</p>
              </div>
              <ArrowRight className="w-6 h-6" />
            </div>
          </Link>

          <Link href="/radio" className="group block border-4 border-brand-navy bg-brand-off-white shadow-(--shadow-brut-xl-soft) hover:shadow-(--shadow-brut-sm) hover:translate-x-1 hover:translate-y-1 transition-all overflow-hidden relative">
            <div className="aspect-video w-full bg-brand-navy relative flex flex-col items-center justify-center p-6 text-center text-brand-off-white">
              <Radio className="w-12 h-12 text-brand-accent mb-4" />
              <div className="font-mono text-[10px] tracking-widest text-brand-accent uppercase">Now Playing</div>
              <div className="font-display text-2xl uppercase mt-1">DJ SLICK LIVE AT SUNSET</div>
            </div>
            <div className="p-4 md:p-6 border-t-4 border-brand-navy bg-brand-off-white flex justify-between items-center">
              <div className="flex items-center gap-2 font-bold text-sm uppercase text-brand-navy">
                <Play className="w-5 h-5 fill-current" /> PLAY SET (1h 48m)
              </div>
              <ArrowRight className="w-6 h-6" />
            </div>
          </Link>

        </section>

      </div>
    </div>
  );
}
