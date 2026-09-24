"use client";

import React, { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { Flame, Bell, Camera, Play, Radio, ArrowRight, Video } from "lucide-react";
import { EventDetails } from "@/lib/supabase-db";

export default function ClosedEventClientPage({ eventDetails }: { eventDetails: EventDetails }) {
  const [waNumber, setWaNumber] = useState("");
  const [subscribed, setSubscribed] = useState(false);
  const [timeLeft, setTimeLeft] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 });

  useEffect(() => {
    // Assuming next event is 30 days from now for demo if not set
    const openDate = eventDetails.sales_open_date 
      ? new Date(eventDetails.sales_open_date).getTime() 
      : new Date().getTime() + 30 * 24 * 60 * 60 * 1000;

    const timer = setInterval(() => {
      const now = new Date().getTime();
      const distance = openDate - now;

      if (distance < 0) {
        clearInterval(timer);
      } else {
        setTimeLeft({
          days: Math.floor(distance / (1000 * 60 * 60 * 24)),
          hours: Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
          minutes: Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60)),
          seconds: Math.floor((distance % (1000 * 60)) / 1000)
        });
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [eventDetails.sales_open_date]);

  const handleSubscribe = (e: React.FormEvent) => {
    e.preventDefault();
    if (!waNumber) return;
    setSubscribed(true);
    // In reality, we would POST to /api/waitlist here
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
            <div className="p-2 border-2 border-brand-navy bg-brand-accent shadow-(--shadow-brut-sm-strong) flex items-center justify-center">
              {eventDetails.logo_url ? (
                <img src={eventDetails.logo_url} alt="Logo" className="w-6 h-6 object-contain" />
              ) : (
                <Flame className="w-6 h-6 text-brand-navy" strokeWidth={2.5} />
              )}
            </div>
            <span className="font-display text-2xl md:text-4xl tracking-wide uppercase text-brand-navy pt-1">GOODLIFE</span>
          </div>
          <nav className="hidden md:flex items-center gap-4">
            <Link href="/" className="font-mono text-xs font-bold uppercase tracking-widest text-brand-navy hover:text-brand-accent transition-colors">Events</Link>
            <Link href="/gallery" className="font-mono text-xs font-bold uppercase tracking-widest text-brand-navy hover:text-brand-accent transition-colors">Gallery</Link>
            <Link href="/radio" className="font-mono text-xs font-bold uppercase tracking-widest text-brand-navy hover:text-brand-accent transition-colors">Radio</Link>
          </nav>
        </header>

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
          <div className="border-4 border-brand-navy bg-brand-accent p-6 md:p-8 shadow-(--shadow-brut-xl-strong) flex flex-col justify-center">
            <h2 className="font-display text-3xl md:text-5xl uppercase tracking-wider text-brand-navy mb-2">
              🚨 NEXT EDITION: {eventDetails.next_event_title || "GOODLIFE 4"}
            </h2>
            <p className="font-mono text-sm font-bold tracking-widest uppercase text-brand-navy mb-6">
              🗓️ TICKETS DROP IN:
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
              {/* If we had a preview image, we'd put it here */}
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
