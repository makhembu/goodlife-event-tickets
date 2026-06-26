"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  Ticket as TicketIcon, 
  Phone, 
  Layers, 
  Sparkles, 
  ShieldCheck, 
  Activity, 
  QrCode, 
  QrCode as ScannerIcon, 
  ArrowRight, 
  Download, 
  CheckCircle2, 
  HelpCircle, 
  AlertTriangle,
  Flame,
  Tent,
  AlertCircle,
  Settings,
  ChevronUp,
  ChevronDown
} from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { fetchEventDetails, EventDetails, fetchTicketTiers, TicketTier } from "@/lib/supabase-db";
import TicketStamp from "@/components/TicketStamp";



export default function TicketCheckoutPage() {
  // Booking Form States
  const [phoneNumber, setPhoneNumber] = useState("");
  const [selectedTier, setSelectedTier] = useState("");
  const [buyerName, setBuyerName] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [showWhatsAppField, setShowWhatsAppField] = useState(false);
  const [whatsappNumber, setWhatsappNumber] = useState("");
  
  // App Processing States
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [generatedTicketId, setGeneratedTicketId] = useState<string | null>(null);
  const [myTickets, setMyTickets] = useState<string[]>([]);
  const [ticketDetailsMap, setTicketDetailsMap] = useState<Record<string, any>>({});
  const [isVaultOpen, setIsVaultOpen] = useState(true);
  
  // Flyer Lightbox State
  const [isFlyerExpanded, setIsFlyerExpanded] = useState(false);
  // House Rules accordion
  const [rulesOpen, setRulesOpen] = useState(false);

  // Admin session state
  const [isAdmin, setIsAdmin] = useState(false);

  const [paystackReference, setPaystackReference] = useState<string | null>(null);
  const [paystackPollingTimedOut, setPaystackPollingTimedOut] = useState(false);

  // Secret admin access (5x logo tap fallback when not logged in)
  const [logoTapCount, setLogoTapCount] = useState(0);
  const [showSecretMenu, setShowSecretMenu] = useState(false);
  const logoTapTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const headerRef = React.useRef<HTMLElement>(null);
  const statusRef = React.useRef<HTMLDivElement>(null);
  const [headerBottom, setHeaderBottom] = useState(0);
  const [isSmallScreen, setIsSmallScreen] = useState(false);
  const [isTallScreen, setIsTallScreen] = useState(false);

  // Measure real header bottom (including page top padding) on mount + resize
  useEffect(() => {
    const update = () => {
      setIsSmallScreen(window.innerWidth < 1024);
      setIsTallScreen(window.innerHeight > 850);
      if (headerRef.current) {
        // getBoundingClientRect gives position relative to viewport
        setHeaderBottom(Math.round(headerRef.current.getBoundingClientRect().bottom));
      }
    };
    update();
    const ro = new ResizeObserver(update);
    if (headerRef.current) ro.observe(headerRef.current);
    window.addEventListener('resize', update);
    return () => { ro.disconnect(); window.removeEventListener('resize', update); };
  }, []);

  function handleLogoTap() {
    if (isAdmin) return; // already have nav, no need for secret tap
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

  // Check admin session on mount
  useEffect(() => {
    fetch("/api/admin/me")
      .then(r => r.json())
      .then(data => { if (data.isAdmin) setIsAdmin(true); })
      .catch(() => {});
  }, []);
  // Initialize myTickets from local storage
  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem("my_goodlife_purchases");
        if (stored) {
          setMyTickets(JSON.parse(stored));
        }
      } catch (e) {}
    }
  }, []);

  // Update myTickets when a new ticket is generated
  useEffect(() => {
    if (generatedTicketId && !myTickets.includes(generatedTicketId)) {
      const updated = [generatedTicketId, ...myTickets];
      setMyTickets(updated);
      if (typeof window !== "undefined") {
        localStorage.setItem("my_goodlife_purchases", JSON.stringify(updated));
      }
    }
  }, [generatedTicketId, myTickets]);

  // Fetch metadata for stored tickets
  useEffect(() => {
    if (myTickets.length === 0) return;
    
    myTickets.forEach(async (id) => {
      try {
        const res = await fetch(`/api/tickets/${id}`);
        if (res.ok) {
          const data = await res.json();
          setTicketDetailsMap(prev => {
            if (prev[id]) return prev;
            return { ...prev, [id]: data };
          });
        }
      } catch (e) {}
    });
  }, [myTickets]);

  // Dynamic Event Details from Database
  const [eventDetails, setEventDetails] = useState<EventDetails>({
    id: 1,
    title: "GOODLIFE",
    subtitle: "237-THIKA | JULY 11",
    tag: "SMWHR INC / MARARA CAMP",
    venue: "MARARA CAMP, THIKA",
    till_number: "5761205",
    flyer_url: "/flyer.png",
    regulations: "Camp gate opens strictly at noon. Carry your PDF ticket or phone download for scanning. No outside drinks at Marara. Entry is strictly 18+ with original ID verification."
  });

  // Dynamic Ticket Tiers from Database
  const [ticketTiers, setTicketTiers] = useState<TicketTier[]>([]);

  useEffect(() => {
    fetchEventDetails().then(setEventDetails).catch(console.error);
    fetchTicketTiers().then(setTicketTiers).catch(console.error);
  }, []);

  // Parse event date dynamically to conditionally display Gate pricing
  const isEventDay = React.useMemo(() => {
    try {
      if (!eventDetails.subtitle) return false;
      // Extract date string from format "237-THIKA | JULY 11" -> "JULY 11"
      const datePart = eventDetails.subtitle.split("|")[1]?.trim();
      if (!datePart) return false;

      const today = new Date();
      // Format current day into "MONTH DD" pattern (e.g. "JULY 11")
      const currentMonth = today.toLocaleString("en-US", { month: "long" }).toUpperCase();
      const currentDay = today.getDate();
      const todayFormatted = `${currentMonth} ${currentDay}`;

      return datePart.toUpperCase() === todayFormatted;
    } catch {
      return false;
    }
  }, [eventDetails.subtitle]);

  const isVideoFlyer = eventDetails.flyer_url ? /\.(mp4|webm|ogg|mov|m4v)($|\?)/i.test(eventDetails.flyer_url) || eventDetails.flyer_url.includes("video") : false;

  // Ticket Tiers config
  const TICKET_TIERS = React.useMemo(() => {
    if (ticketTiers.length === 0) {
      return [
        { id: "ADV 500", name: "ADV 500", price: 500, desc: "Advance entry pass", tag: "ADVANCE" },
        { id: "2PX CAMPING", name: "2PX CAMPING", price: 2500, desc: "Includes shared tent + mattress setup", tag: "2 PEOPLE" },
        { id: "4PX CAMPING", name: "4PX CAMPING", price: 2400, desc: "Includes tent + sleeping mats", tag: "4 PEOPLE" },
        { id: "6PX 3000", name: "6PX 3000", price: 3000, desc: "Group camp setup", tag: "6 PEOPLE" }
      ];
    }
    return ticketTiers
      .filter(tier => {
        if (tier.hidden) return false;
        if (isEventDay) {
          return !tier.hide_on_event_day;
        } else {
          return !tier.show_only_on_event_day;
        }
      })
      .map(tier => ({
        id: tier.id,
        name: tier.name,
        price: tier.price,
        desc: tier.description,
        tag: tier.tag
      }));
  }, [ticketTiers, isEventDay]);

  // Derive safe tier that always matches available options
  const safeSelectedTier = React.useMemo(() => {
    const available = TICKET_TIERS.map(t => t.id);
    return available.includes(selectedTier) ? selectedTier : available[0];
  }, [TICKET_TIERS, selectedTier]);

  // Automatically select the first available tier if the current selection becomes invalid
  useEffect(() => {
    if (TICKET_TIERS.length > 0) {
      const available = TICKET_TIERS.map(t => t.id);
      if (!available.includes(selectedTier)) {
        setSelectedTier(available[0]);
      }
    }
  }, [TICKET_TIERS, selectedTier]);

  // State to track scroll for sticky bottom CTA on mobile
  const [showStickyBtn, setShowStickyBtn] = useState(false);

  useEffect(() => {
    const bookingEl = document.getElementById("booking-container");
    if (!bookingEl) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        // Show sticky CTA when booking container is not visible in viewport
        setShowStickyBtn(!entry.isIntersecting);
      },
      { threshold: 0 }
    );

    observer.observe(bookingEl);
    return () => observer.disconnect();
  }, []);

  // Trigger Paystack M-Pesa STK Push
  const handleCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    setPaystackReference(null);
    setGeneratedTicketId(null);
    setStatusMessage("");

    if (!phoneNumber) {
      setStatusMessage("Please enter your M-Pesa phone number.");
      return;
    }

    setLoading(true);
    setStatusMessage("Initializing M-Pesa STK Push...");

    const autoEmail = phoneNumber.replace(/[^0-9]/g, "") + "@example.goodlife.com";

    try {
      const res = await fetch("/api/paystack/initialize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: autoEmail,
          phone_number: phoneNumber,
          ticket_type: safeSelectedTier,
          buyer_name: buyerName,
          quantity: Number(quantity),
          whatsapp_number: showWhatsAppField && whatsappNumber ? whatsappNumber : ""
        })
      });

      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || "Paystack initialization failed.");
      }

      setPaystackReference(data.reference);
      setStatusMessage("M-Pesa STK push sent! Check your phone and enter your PIN to confirm payment.");
    } catch (err: any) {
      setStatusMessage(err.message || "An error occurred processing your request.");
      setLoading(false);
    }
  };

  // Polling for Paystack M-Pesa completion
  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    if (paystackReference && !generatedTicketId) {
      interval = setInterval(async () => {
        try {
          const res = await fetch(`/api/paystack/verify?reference=${paystackReference}`);
          if (res.ok) {
            const data = await res.json();
            if (data.status === "completed" && data.ticket_id) {
              setGeneratedTicketId(data.ticket_id);
              setStatusMessage("Payment confirmed. Your ticket is ready.");
              setLoading(false);
              clearInterval(interval);
            } else if (data.status === "failed") {
              clearInterval(interval);
              setLoading(false);
              setPaystackPollingTimedOut(true);
        setStatusMessage("Payment failed: transaction was declined or cancelled. Please try again.");
            }
          }
        } catch (err) {
          console.error("Polling error:", err);
        }
      }, 3000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [paystackReference, generatedTicketId]);

  // Auto-scroll to payment status when it changes
  useEffect(() => {
    if (statusMessage && statusRef.current) {
      statusRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [statusMessage]);

  // Polling timeout — show manual retry after 15 seconds
  useEffect(() => {
    if (!paystackReference || generatedTicketId) {
      setPaystackPollingTimedOut(false);
      return;
    }
    const timer = setTimeout(() => setPaystackPollingTimedOut(true), 15000);
    return () => clearTimeout(timer);
  }, [paystackReference, generatedTicketId]);

  const handleManualStatusCheck = async () => {
    if (!paystackReference) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/paystack/verify?reference=${paystackReference}`);
      if (res.ok) {
        const data = await res.json();
        if (data.status === "completed" && data.ticket_id) {
          setGeneratedTicketId(data.ticket_id);
          setStatusMessage("Payment confirmed. Your ticket is ready.");
          setLoading(false);
          setPaystackPollingTimedOut(false);
        } else if (data.status === "failed") {
          setStatusMessage("Payment failed: transaction was declined or cancelled. Please try again.");
          setLoading(false);
        } else {
          setStatusMessage("Status check: payment is not confirmed yet. Try again or contact admin.");
        }
      } else {
        setStatusMessage("Status check: server error. Contact admin if payment was deducted.");
      }
    } catch {
      setStatusMessage("Status check: network error. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-brand-bg py-8 px-4 md:px-12 text-brand-black font-sans selection:bg-brand-accent selection:text-white relative overflow-x-clip">
      
      {/* Decorative Grid Background */}
      <div className="absolute inset-0 z-0 pointer-events-none opacity-20" 
           style={{ backgroundImage: 'radial-gradient(#050505 1px, transparent 1px)', backgroundSize: '24px 24px' }}></div>

      <div className="relative z-10 max-w-6xl mx-auto">
        {/* HEADER NAVBAR */}
        <header ref={headerRef} className="w-full flex items-center justify-between border-b-4 border-brand-black pb-3 mb-4 md:pb-6 md:mb-8 gap-2 md:gap-4">
          <button
            type="button"
            className="flex items-center gap-2 md:gap-3 shrink-0 cursor-pointer select-none text-left"
            onClick={handleLogoTap}
            aria-label={isAdmin ? `${eventDetails.title} home` : "Open staff access after five taps"}
          >
            <div className="p-1 md:p-2 border-2 border-brand-black bg-brand-accent shadow-[2px_2px_0px_0px_#050505] md:shadow-[4px_4px_0px_0px_#050505] flex items-center justify-center">
              {eventDetails.logo_url ? (
                <img src={eventDetails.logo_url} alt={`${eventDetails.title} logo`} className="w-5 h-5 md:w-6 md:h-6 object-contain" />
              ) : (
                <Flame className="w-5 h-5 md:w-6 md:h-6 text-brand-black" strokeWidth={2.5} />
              )}
            </div>
            <span className="font-display text-xl md:text-4xl tracking-wide uppercase text-brand-black pt-1">{eventDetails.title}</span>
          </button>
          <div className="flex gap-2 md:gap-4 shrink-0 justify-end">
            {myTickets.length > 0 && (
              <button 
                onClick={() => document.getElementById("my-tickets-section")?.scrollIntoView({ behavior: "smooth" })}
                className="text-[9px] md:text-xs font-bold uppercase border-2 border-brand-black bg-brand-off-white px-2 py-1 md:px-4 md:py-2 text-brand-black hover:bg-brand-black hover:text-brand-off-white shadow-[2px_2px_0px_0px_#050505] md:shadow-[4px_4px_0px_0px_#050505] active:translate-y-[2px] active:translate-x-[2px] active:shadow-none transition-all whitespace-nowrap"
              >
                My Tickets ({myTickets.length})
              </button>
            )}
            {/* Show admin nav when session is active */}
            {isAdmin && (
              <>
                <Link
                  href="/admin/dashboard"
                  className="text-[9px] md:text-xs font-bold uppercase border-2 border-brand-black bg-brand-off-white px-2 py-1 md:px-4 md:py-2 text-brand-black hover:bg-brand-black hover:text-brand-off-white shadow-[2px_2px_0px_0px_#050505] md:shadow-[4px_4px_0px_0px_#050505] active:translate-y-[2px] active:translate-x-[2px] active:shadow-none transition-all whitespace-nowrap flex items-center gap-1"
                >
                  <Settings className="w-3 h-3 md:w-4 md:h-4" /> Admin
                </Link>
                <Link
                  href="/admin/scanner"
                  className="text-[9px] md:text-xs font-bold uppercase border-2 border-brand-black bg-brand-accent px-2 py-1 md:px-4 md:py-2 text-brand-black hover:bg-white shadow-[2px_2px_0px_0px_#050505] md:shadow-[4px_4px_0px_0px_#050505] active:translate-y-[2px] active:translate-x-[2px] active:shadow-none transition-all flex items-center gap-1 md:gap-2 whitespace-nowrap"
                >
                  <ScannerIcon className="w-3 h-3 md:w-4 md:h-4" strokeWidth={2.5} /> Scanner
                </Link>
              </>
            )}
          </div>
        </header>

        {/* SECRET ADMIN MENU – only visible after 5x logo tap */}
        <AnimatePresence>
          {showSecretMenu && (
            <motion.div
              initial={{ opacity: 0, y: -16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              className="fixed top-4 right-4 z-50 border-4 border-brand-black bg-brand-black text-brand-off-white p-4 shadow-[8px_8px_0px_0px_#FF3300] flex flex-col gap-3 min-w-[200px]"
            >
              <div className="flex items-center justify-between border-b-2 border-brand-off-white/20 pb-2 mb-1">
                <span className="font-display text-lg uppercase tracking-widest text-brand-accent">Staff Only</span>
                <button type="button" aria-label="Close staff menu" onClick={() => setShowSecretMenu(false)} className="text-brand-off-white/60 hover:text-white text-xl leading-none">&times;</button>
              </div>
              <Link
                href="/admin/dashboard"
                onClick={() => setShowSecretMenu(false)}
                className="font-mono text-xs uppercase tracking-wider border-2 border-brand-off-white/30 px-4 py-3 hover:bg-brand-off-white hover:text-brand-black transition-colors flex items-center gap-2"
              >
                <Settings className="w-4 h-4" /> Admin Console
              </Link>
              <Link
                href="/admin/scanner"
                onClick={() => setShowSecretMenu(false)}
                className="font-mono text-xs uppercase tracking-wider border-2 border-brand-accent/60 bg-brand-accent/10 px-4 py-3 hover:bg-brand-accent hover:text-brand-black transition-colors flex items-center gap-2"
              >
                <ScannerIcon className="w-4 h-4" /> Gate Scanner
              </Link>
            </motion.div>
          )}
        </AnimatePresence>

        <main className="w-full grid grid-cols-1 lg:grid-cols-12 gap-6 md:gap-8 items-start mb-12">

          {/* LEFT COLUMN: HERO FLYER & ADVISORIES (5 cols on lg) */}
          <section className="lg:col-span-5 space-y-6 md:space-y-8">
            
            {/* HERO FLYER MOTIF CARD */}
            <div className="border-4 border-brand-black bg-brand-off-white p-3 md:p-6 relative shadow-[4px_4px_0px_0px_#050505] md:shadow-[8px_8px_0px_0px_#050505]">
              
              {/* Top Right Label badge */}
              <div className="absolute -top-3 -right-3 md:-top-4 md:-right-4 bg-brand-accent text-brand-black border-2 border-brand-black px-2 py-0.5 md:px-4 md:py-1 text-[10px] md:text-xs font-black tracking-widest uppercase shadow-[2px_2px_0px_0px_#050505] md:shadow-[4px_4px_0px_0px_#050505] rotate-3">
                LIVE EVENT
              </div>

              <div className="relative flex flex-col md:space-y-4">
                <div className="absolute top-2 left-2 z-10 w-fit max-w-[90%] bg-brand-off-white/95 backdrop-blur-sm border-2 border-brand-black p-2 md:p-3 shadow-[4px_4px_0px_0px_#050505] pointer-events-none md:pointer-events-auto">
                  <span className="text-[9px] md:text-xs font-black tracking-widest text-brand-black uppercase block bg-brand-black text-white w-fit px-1.5 py-0.5 md:px-2 md:py-0.5 mb-1 md:mb-2">
                    {eventDetails.tag}
                  </span>
                  <h1 className="text-3xl sm:text-4xl md:text-6xl font-display uppercase text-brand-black leading-none mt-1 md:mt-2">
                    {eventDetails.title}
                  </h1>
                  <p className="text-[10px] md:text-sm font-bold uppercase tracking-widest text-brand-black mt-1 md:mt-2 flex items-center gap-1.5 md:gap-2">
                    <span className="w-2 h-2 md:w-3 md:h-3 border-2 border-brand-black bg-brand-accent animate-pulse shrink-0" />
                    <span className="truncate">{eventDetails.subtitle}</span>
                  </p>
                </div>

                {/* EVENT FLYER DISPLAY CONTAINER */}
                <button 
                  type="button"
                  onClick={() => setIsFlyerExpanded(true)}
                  className="block relative w-full aspect-[3/4] border-2 border-brand-black shadow-[4px_4px_0px_0px_#050505] overflow-hidden bg-white group cursor-pointer hover:shadow-[2px_2px_0px_0px_#050505] transition-all duration-300 hover:scale-[0.98] focus:outline-none focus:ring-4 focus:ring-brand-accent mt-0 md:my-4"
                >
                  {isVideoFlyer ? (
                    <video 
                      src={eventDetails.flyer_url} 
                      autoPlay 
                      muted 
                      loop 
                      playsInline 
                      className="w-full h-full object-contain pointer-events-none"
                    />
                  ) : (
                    <Image 
                      src={eventDetails.flyer_url} 
                      alt={`${eventDetails.title} Flyer`} 
                      fill
                      priority
                      className="object-contain transition-all duration-700"
                      referrerPolicy="no-referrer"
                    />
                  )}
                  {/* Subtle top gradient to hide the printed title under the absolute box */}
                  <div className="absolute top-0 left-0 w-full h-32 bg-gradient-to-b from-white via-white/80 to-transparent pointer-events-none" />
                  {/* Warning Bar bottom with seamless marquee */}
                  <div className="absolute bottom-0 left-0 w-full h-6 bg-brand-accent border-t-2 border-brand-black overflow-hidden flex items-center">
                    <div className="flex animate-marquee whitespace-nowrap font-display text-lg tracking-wider text-brand-black pt-1">
                      <span className="pr-4">{eventDetails.ticker_text || "NO ENTRY WITHOUT VALIDATION ✦ STRICTLY 18+ ✦ "}</span>
                      <span className="pr-4">{eventDetails.ticker_text || "NO ENTRY WITHOUT VALIDATION ✦ STRICTLY 18+ ✦ "}</span>
                    </div>
                  </div>
                </button>

                {/* Venue / Till details */}
                <div className="grid grid-cols-2 gap-4 text-xs font-black uppercase pt-2">
                  <div className="bg-white p-4 border-2 border-brand-black shadow-[4px_4px_0px_0px_#050505]">
                    <span className="block text-[10px] text-brand-black border-b border-brand-black pb-1 mb-1">LOCATION</span>
                    <span className="text-brand-black truncate block">{eventDetails.venue}</span>
                  </div>
                  <div className="bg-brand-accent p-4 border-2 border-brand-black shadow-[4px_4px_0px_0px_#050505]">
                    <span className="block text-[10px] text-brand-black border-b border-brand-black pb-1 mb-1">PAYMENT TILL</span>
                    <span className="text-brand-black truncate block text-sm">#{eventDetails.till_number}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* SYSTEM REGULATORY ADVISORIES — collapsible accordion */}
            <div className="border-4 border-brand-black bg-brand-black text-brand-off-white shadow-[8px_8px_0px_0px_#FF3300]">
              <button
                type="button"
                onClick={() => setRulesOpen(o => !o)}
                className="w-full flex items-center justify-between px-6 py-4 hover:opacity-80 transition-opacity cursor-pointer"
              >
                <span className="font-display text-2xl uppercase tracking-wider text-brand-accent">
                  HOUSE RULES
                </span>
                {rulesOpen
                  ? <ChevronUp className="w-5 h-5 text-brand-accent shrink-0" />
                  : <ChevronDown className="w-5 h-5 text-brand-accent shrink-0" />}
              </button>
              {rulesOpen && (
                <div className="px-6 pb-5 border-t-2 border-brand-off-white/20 pt-4">
                  <p className="font-mono text-xs uppercase leading-relaxed text-justify opacity-90">
                    {eventDetails.regulations}
                  </p>
                </div>
              )}
            </div>
          </section>

          {/* RIGHT COLUMN: BOOKING AND CHECKOUT GATEWAY (7 cols on lg) — sticky on desktop */}
          <section className="lg:col-span-7 space-y-6 lg:sticky lg:top-8 lg:self-start">
            {/* Booking container: constrain to remaining viewport height below header */}
            <div
              id="booking-container"
              className="border-4 border-brand-black bg-brand-off-white p-4 md:p-8 relative shadow-[12px_12px_0px_0px_#050505] overflow-y-auto"
              style={headerBottom > 0 && !isSmallScreen && isTallScreen
                ? { maxHeight: `calc(100dvh - ${headerBottom + 16}px)` }
                : undefined}
            >
              <h2 className="text-2xl md:text-4xl font-display uppercase border-b-4 border-brand-black pb-1.5 mb-2.5 md:pb-3 md:mb-5 flex items-center gap-2 md:gap-3 text-brand-black">
                <div className="bg-brand-black text-brand-off-white p-1">
                  <TicketIcon className="w-5 h-5 md:w-8 md:h-8" />
                </div>
                GET YOUR TICKETS
              </h2>

              <form onSubmit={handleCheckout} className="space-y-3 md:space-y-5">
                
                {/* TICKET TIER SELECTION GRID */}
                <div className="space-y-1.5 md:space-y-3">
                  <div className="bg-brand-black text-brand-off-white inline-block px-2.5 py-0.5 font-bold text-[10px] md:text-xs uppercase tracking-widest">
                    01. CHOOSE PACKAGE
                  </div>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-rows-2 md:grid-flow-col gap-1.5 md:gap-4" role="radiogroup">
                    {TICKET_TIERS.map((tier) => {
                      const isSelected = safeSelectedTier === tier.id;
                      return (
                        <button
                          key={tier.id}
                          type="button"
                          role="radio"
                          aria-checked={isSelected}
                          onClick={() => setSelectedTier(tier.id)}
                          className={`text-left p-2 md:p-3.5 border-4 transition-all duration-75 relative flex flex-col justify-between gap-1 md:gap-2.5 ${
                            isSelected 
                             ? "border-brand-black bg-brand-black text-brand-off-white shadow-[4px_4px_0px_0px_#FF3300] md:shadow-[6px_6px_0px_0px_#FF3300] translate-x-0.5 -translate-y-0.5" 
                              : "border-brand-black bg-white text-brand-black hover:bg-brand-bg shadow-[2px_2px_0px_0px_#050505] md:shadow-[4px_4px_0px_0px_#050505] active:translate-x-1 active:-translate-y-1"
                          }`}
                        >
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-2">
                              <span className="font-display text-base sm:text-xl md:text-2xl uppercase leading-none pt-0.5">
                                {tier.name}
                              </span>
                              <span className={`text-[8px] md:text-[9px] px-1 md:px-1.5 py-0.2 font-bold uppercase border-2 ${
                                isSelected ? "border-brand-off-white bg-brand-accent text-brand-black" : "border-brand-black bg-brand-black text-white"
                              }`}>
                                {tier.tag}
                              </span>
                            </div>
                            <p className={`text-[9px] md:text-[10px] font-mono uppercase leading-tight ${isSelected ? "text-brand-off-white/80" : "text-brand-black/60"}`}>
                              {tier.desc}
                            </p>
                            {/* SCARCITY MARKER */}
                            <div className="flex items-center gap-1 mt-0.5">
                              <span className={`w-1 h-1 md:w-1.2 md:h-1.2 rounded-full animate-pulse ${isSelected ? "bg-[#00FF00]" : "bg-brand-accent"}`}></span>
                              <span className={`text-[8px] md:text-[8.5px] font-bold tracking-widest uppercase ${isSelected ? "text-brand-off-white" : "text-brand-accent"}`}>
                                SELLING FAST
                              </span>
                            </div>
                          </div>
                          <div className="text-left mt-1 md:mt-auto">
                            <span className={`block font-display text-base sm:text-lg md:text-3xl leading-none ${isSelected ? "text-brand-accent" : "text-brand-black"}`}>
                              KES {tier.price.toLocaleString()}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 md:gap-5">
                  {/* LEFT COLUMN: Details & Passes */}
                  <div className="space-y-2.5 md:space-y-5 flex flex-col">
                    {/* STEP 2: BUYER FULL NAME */}
                    <div className="space-y-1 md:space-y-2">
                      <label htmlFor="buyer-name" className="bg-brand-black text-brand-off-white inline-block px-2.5 py-0.5 font-bold text-[10px] md:text-xs uppercase tracking-widest">
                        02. YOUR DETAILS
                      </label>
                      <input
                        id="buyer-name"
                        name="buyerName"
                        type="text"
                        autoComplete="name"
                        required
                        placeholder="E.g. Amani Mwangi"
                        value={buyerName}
                        onChange={(e) => setBuyerName(e.target.value)}
                        className="block w-full px-3 py-2 md:px-4 md:py-3 border-4 border-brand-black bg-white font-mono text-xs md:text-sm uppercase placeholder-brand-black/30 focus:outline-none focus:bg-brand-accent/10 focus:shadow-[4px_4px_0px_0px_#050505] transition-all text-brand-black"
                      />
                    </div>

                    {/* STEP 3: TICKET QUANTITY */}
                    <div className="space-y-1 md:space-y-2">
                      <div id="quantity-label" className="bg-brand-black text-brand-off-white inline-block px-2.5 py-0.5 font-bold text-[10px] md:text-xs uppercase tracking-widest">
                        03. HOW MANY PASSES?
                      </div>
                      <div className="flex border-4 border-brand-black bg-white shadow-[2px_2px_0px_0px_#050505] md:shadow-[4px_4px_0px_0px_#050505] w-fit" role="group" aria-labelledby="quantity-label">
                        <button
                          type="button"
                          aria-label="Decrease ticket quantity"
                          onClick={() => setQuantity(Math.max(1, quantity - 1))}
                          className="w-12 h-12 border-r-4 border-brand-black font-display text-xl md:text-2xl hover:bg-brand-accent hover:text-brand-black transition-colors flex items-center justify-center"
                        >
                          -
                        </button>
                        <span
                          className="w-12 md:w-16 h-12 flex items-center justify-center font-display text-xl md:text-3xl bg-brand-bg"
                          aria-live="polite"
                          aria-atomic="true"
                        >
                          {quantity}
                        </span>
                        <button
                          type="button"
                          aria-label="Increase ticket quantity"
                          onClick={() => setQuantity(Math.min(10, quantity + 1))}
                          className="w-12 h-12 border-l-4 border-brand-black font-display text-xl md:text-2xl hover:bg-brand-accent hover:text-brand-black transition-colors flex items-center justify-center"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* RIGHT COLUMN: Phone Number & Total */}
                  <div className="space-y-2.5 md:space-y-5 flex flex-col">
                    {/* STEP 4: M-PESA NUMBER */}
                    <div className="space-y-1 md:space-y-2">
                      <label htmlFor="mpesa-number" className="bg-brand-black text-brand-off-white inline-block px-2.5 py-0.5 font-bold text-[10px] md:text-xs uppercase tracking-widest">
                        04. M-PESA NUMBER
                      </label>
                      <div className="relative flex items-stretch">
                        <div className="flex items-center justify-center px-3 md:px-5 border-4 border-r-0 border-brand-black bg-brand-black text-brand-off-white pointer-events-none">
                          <Phone className="h-4 w-4 md:h-5 md:w-5" />
                        </div>
                        <input
                           id="mpesa-number"
                          name="phoneNumber"
                          type="text"
                          inputMode="tel"
                          autoComplete="tel"
                          required
                          placeholder="0712 345 678"
                          value={phoneNumber}
                          onChange={(e) => setPhoneNumber(e.target.value)}
                          className="block w-full px-3 py-2 md:px-4 md:py-3 border-4 border-brand-black bg-white font-mono text-xs md:text-sm uppercase placeholder-brand-black/30 focus:outline-none focus:bg-brand-accent/10 focus:shadow-[4px_4px_0px_0px_#050505] transition-all text-brand-black"
                        />
                      </div>
                      <p className="text-xs text-brand-black/75 font-mono uppercase bg-brand-black/5 px-3 py-2 border-l-4 border-brand-accent">
                        STK push to <strong className="text-brand-black">{phoneNumber || "your number"}</strong> — <span className="text-brand-accent font-bold">ENTER PIN</span> when prompted on your phone. Ticket delivered here via WhatsApp.
                      </p>

                      {!showWhatsAppField ? (
                        <button
                          type="button"
                          onClick={() => setShowWhatsAppField(true)}
                          className="w-full flex items-center gap-2 border-4 border-dashed border-brand-black/40 bg-brand-off-white/50 px-3 py-2.5 hover:border-brand-black hover:bg-brand-accent/10 transition-colors group cursor-pointer"
                        >
                          <svg aria-hidden="true" className="w-4 h-4 shrink-0 text-brand-black/40 group-hover:text-brand-black transition-colors" fill="currentColor" viewBox="0 0 24 24"><path d="M12.031 0C5.385 0 0 5.385 0 12.031c0 2.127.551 4.2 1.597 6.03L.085 23.593l5.688-1.492A11.968 11.968 0 0012.03 24c6.646 0 12.031-5.385 12.031-12.031S18.677 0 12.031 0zm3.847 17.338c-.161.455-.935.882-1.32.936-.364.051-.834.128-2.69-.64-2.242-.927-3.666-3.21-3.774-3.354-.108-.144-.898-1.196-.898-2.28s.57-1.616.772-1.834c.202-.218.441-.272.585-.272.144 0 .288.001.411.006.132.006.311-.052.478.35.176.425.594 1.45.646 1.554.052.104.088.227.016.371-.072.144-.108.234-.216.353-.108.119-.228.257-.323.337-.104.088-.213.185-.094.39.119.205.529.873 1.134 1.412.782.697 1.442.915 1.647 1.019.205.104.323.088.446-.052.119-.14.515-.596.653-.802.138-.206.275-.171.464-.104.189.067 1.194.563 1.399.667.205.104.341.155.394.243.053.088.053.513-.108.968z"/></svg>
                          <span className="text-[10px] font-black uppercase tracking-wider text-brand-black/60 group-hover:text-brand-black transition-colors">
                            Send ticket to a different WhatsApp number
                          </span>
                          <ArrowRight className="w-3.5 h-3.5 ml-auto shrink-0 text-brand-black/40 group-hover:text-brand-black transition-colors" />
                        </button>
                      ) : (
                        <div className="border-4 border-brand-black bg-white">
                          <div className="flex items-stretch">
                            <div className="flex items-center justify-center px-3 border-r-4 border-brand-black bg-brand-black text-white pointer-events-none">
                              <svg aria-hidden="true" className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12.031 0C5.385 0 0 5.385 0 12.031c0 2.127.551 4.2 1.597 6.03L.085 23.593l5.688-1.492A11.968 11.968 0 0012.03 24c6.646 0 12.031-5.385 12.031-12.031S18.677 0 12.031 0z"/></svg>
                            </div>
                            <input
                              id="whatsapp-number"
                              name="whatsappNumber"
                              type="text"
                              inputMode="tel"
                              autoComplete="tel"
                              aria-label="Different number for WhatsApp delivery"
                              placeholder="WhatsApp number"
                              value={whatsappNumber}
                              onChange={(e) => setWhatsappNumber(e.target.value)}
                              className="flex-1 min-w-0 px-3 py-2.5 font-mono text-[10px] uppercase placeholder-brand-black/30 focus:outline-none focus:bg-brand-accent/5 text-brand-black border-0"
                            />
                            <button
                              type="button"
                              onClick={() => { setShowWhatsAppField(false); setWhatsappNumber(""); }}
                              aria-label="Remove WhatsApp number"
                              className="px-3 border-l-4 border-brand-black bg-white text-brand-black/30 hover:text-brand-accent hover:bg-brand-accent/5 transition-colors font-mono text-sm font-bold"
                            >
                              X
                            </button>
                          </div>
                          <p className="text-[8px] font-mono uppercase text-brand-black/40 bg-brand-black/5 px-3 py-1.5 border-t-4 border-brand-black">
                            Leave blank to send ticket only to your M-Pesa number
                          </p>
                        </div>
                      )}
                    </div>

                    {/* TOTAL RECEIPT BLOCK */}
                    <div className="mt-auto px-2.5 py-1.5 md:px-3 md:py-2 border-4 border-brand-black bg-brand-black text-brand-off-white shadow-[2px_2px_0px_0px_#FF3300] md:shadow-[4px_4px_0px_0px_#FF3300] flex items-center justify-between">
                      <span className="text-[8.5px] font-mono uppercase opacity-70">TOTAL DUE</span>
                      <span className="font-display text-xl md:text-3xl leading-none block text-brand-accent">
                        KES {((TICKET_TIERS.find(t => t.id === safeSelectedTier)?.price || 500) * quantity).toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>

                {/* PAY BUTTON */}
                <button
                  type="submit"
                  disabled={loading}
                  className={`w-full py-2.5 sm:py-3.5 md:py-4 border-4 border-brand-black font-display text-lg sm:text-xl md:text-2xl uppercase tracking-widest flex items-center justify-center gap-2 md:gap-3 transition-all duration-100 mt-1 md:mt-2 ${
                    loading 
                      ? "bg-brand-bg text-brand-black/30 cursor-not-allowed shadow-none" 
                      : "bg-brand-accent text-brand-black hover:bg-white shadow-[4px_4px_0px_0px_#050505] md:shadow-[8px_8px_0px_0px_#050505] active:translate-y-[4px] md:active:translate-y-[8px] active:translate-x-[4px] md:active:translate-x-[8px] active:shadow-none"
                  }`}
                >
                  {loading ? (
                    <>
                      <div className="animate-spin border-4 border-brand-black border-t-transparent w-5 h-5 md:w-6 md:h-6" />
                      PROCESSING...
                    </>
                  ) : (
                    <>
                      <Image 
                        src="/mpesa.svg" 
                        alt="M-Pesa" 
                        width={64} 
                        height={34} 
                        className="h-5 sm:h-6 w-auto object-contain brightness-0" 
                      />
                      PAY WITH M-PESA
                    </>
                  )}
                </button>

                {/* Gateway Reassurance */}
                <p className="text-[10px] text-center font-mono uppercase text-brand-black/60 mt-2 flex items-center justify-center gap-1.5 select-none">
                  <ShieldCheck className="w-3.5 h-3.5 text-brand-black/60 shrink-0" strokeWidth={2.5} />
                  <span>SECURED BY PAYSTACK.</span>
                  <span>AN INSTANT M-PESA PIN PROMPT WILL BE SENT.</span>
                </p>
              </form>

              {/* PAYMENT STATUS DISPLAY */}
              {statusMessage && (
                <div ref={statusRef} role="status" aria-live="polite" className="mt-8 p-5 border-4 border-brand-black bg-white shadow-[4px_4px_0px_0px_#050505]">
                  <span className="text-brand-accent font-display text-xl uppercase block mb-2">PAYMENT UPDATE</span>
                  <p className="font-mono text-xs text-brand-black uppercase leading-relaxed">{statusMessage}</p>

                  {paystackPollingTimedOut && paystackReference && !generatedTicketId && (
                    <div className="mt-4 pt-4 border-t-2 border-brand-black/20 space-y-3">
                      <div className={`flex items-start gap-2 ${statusMessage.toLowerCase().includes("failed") ? "text-red-700" : "text-amber-700"}`}>
                        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                        <p className="text-[10px] font-mono uppercase leading-relaxed">
                          {statusMessage.toLowerCase().includes("failed")
                            ? "Transaction was declined. Try again with sufficient M-Pesa balance."
                            : "Still processing? If payment was deducted from your M-Pesa, click below to verify."}
                        </p>
                      </div>
                      <button
                        onClick={handleManualStatusCheck}
                        disabled={loading}
                        className="w-full py-3 border-2 border-brand-black bg-brand-black text-brand-off-white font-bold text-xs font-mono uppercase hover:bg-brand-accent hover:text-brand-black transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        {loading ? (
                          <>CHECKING...</>
                        ) : (
                          <><Activity className="w-4 h-4" /> CHECK PAYMENT STATUS</>
                        )}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* TICKET RETRIEVAL DOWNLOAD AREA */}
              <AnimatePresence>
                {myTickets.length > 0 && (
                  <motion.div 
                    id="my-tickets-section"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 20 }}
                    className="mt-8 p-6 border-4 border-brand-black bg-brand-black text-brand-off-white shadow-[8px_8px_0px_0px_#FF3300]"
                  >
                    <button 
                      onClick={() => setIsVaultOpen(!isVaultOpen)}
                      className="w-full flex items-center justify-between border-b-2 border-brand-off-white/20 pb-3 mb-4 cursor-pointer hover:opacity-80 transition-opacity"
                    >
                      <div className="flex items-center gap-3">
                        <span className="font-display text-3xl uppercase pt-1">YOU ARE IN!</span>
                      </div>
                      <div className="text-brand-accent">
                        {isVaultOpen ? <ChevronUp className="w-6 h-6" /> : <ChevronDown className="w-6 h-6" />}
                      </div>
                    </button>
                    
                    <AnimatePresence>
                      {isVaultOpen && (
                        <motion.div 
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="overflow-hidden"
                        >
                          <div className="space-y-5 pb-2">
                            <p className="text-xs font-mono uppercase leading-relaxed opacity-90">
                              YOUR TICKET(S) ARE READY. DOWNLOAD BELOW OR CHECK YOUR WHATSAPP.
                            </p>

                            <div className="space-y-4 pt-2">
                      {myTickets.map(ticketId => {
                        const details = ticketDetailsMap[ticketId];
                        return (
                        <div key={ticketId} className="border-2 border-brand-off-white/20 p-4 space-y-3 bg-brand-black/50">
                          <div className="flex flex-col md:flex-row md:items-start justify-between gap-2 border-b-2 border-brand-off-white/10 pb-3 mb-3">
                            <div>
                              <p className="text-[10px] font-mono uppercase text-brand-accent mb-1">
                                TICKET ID: <span className="font-bold text-white ml-1">{ticketId}</span>
                              </p>
                              {details && (
                                <p className="text-xl font-display uppercase text-white leading-none mt-2">
                                  {details.ticket_type}
                                </p>
                              )}
                            </div>
                            {details && (
                              <div className="text-left md:text-right mt-2 md:mt-0">
                                <p className="text-[10px] font-mono uppercase text-brand-off-white/70 mb-1">
                                  ATTENDEE
                                </p>
                                <p className="text-sm font-bold text-white uppercase">
                                  {details.buyer_name} <span className="text-brand-accent ml-2">KES {details.amount_paid}</span>
                                </p>
                              </div>
                            )}
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <a
                              href={`/api/tickets/${ticketId}/download`}
                              target="_blank"
                              rel="noreferrer"
                              className="w-full py-4 border-4 border-brand-accent bg-brand-accent text-brand-black font-display text-2xl uppercase hover:bg-white transition-colors flex items-center justify-center gap-2"
                            >
                              <Download className="w-6 h-6" strokeWidth={2.5} /> DOWNLOAD
                            </a>
                            <a
                              href={`https://wa.me/?text=I%20got%20my%20ticket%20for%20${encodeURIComponent(eventDetails.title)}.%20Get%20yours%20here:%20${encodeURIComponent(typeof window !== "undefined" ? window.location.origin : "https://goodlife.com")}`}
                              target="_blank"
                              rel="noreferrer"
                              className="w-full py-4 border-4 border-[#25D366] bg-[#25D366] text-brand-black font-display text-2xl uppercase hover:bg-white transition-colors flex items-center justify-center gap-2"
                            >
                              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M12.031 0C5.385 0 0 5.385 0 12.031c0 2.127.551 4.2 1.597 6.03L.085 23.593l5.688-1.492A11.968 11.968 0 0012.03 24c6.646 0 12.031-5.385 12.031-12.031S18.677 0 12.031 0zm3.847 17.338c-.161.455-.935.882-1.32.936-.364.051-.834.128-2.69-.64-2.242-.927-3.666-3.21-3.774-3.354-.108-.144-.898-1.196-.898-2.28s.57-1.616.772-1.834c.202-.218.441-.272.585-.272.144 0 .288.001.411.006.132.006.311-.052.478.35.176.425.594 1.45.646 1.554.052.104.088.227.016.371-.072.144-.108.234-.216.353-.108.119-.228.257-.323.337-.104.088-.213.185-.094.39.119.205.529.873 1.134 1.412.782.697 1.442.915 1.647 1.019.205.104.323.088.446-.052.119-.14.515-.596.653-.802.138-.206.275-.171.464-.104.189.067 1.194.563 1.399.667.205.104.341.155.394.243.053.088.053.513-.108.968z"/></svg>
                              SHARE
                            </a>
                          </div>
                          <div>
                            <p className="text-[10px] font-mono uppercase opacity-70 mb-1">PERMANENT TICKET URL:</p>
                            <input 
                              type="text" 
                              readOnly 
                              value={`${typeof window !== 'undefined' ? window.location.origin : ''}/api/tickets/${ticketId}/download`}
                              className="w-full bg-transparent border-2 border-brand-off-white/50 text-brand-off-white text-[10px] font-mono p-2 outline-none focus:border-brand-accent"
                              onClick={(e) => {
                                (e.target as HTMLInputElement).select();
                                navigator.clipboard.writeText((e.target as HTMLInputElement).value);
                              }}
                            />
                          </div>
                        </div>
                      )})}
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>


          </section>

        </main>

        <footer className="w-full text-center pb-12 pt-8 border-t-4 border-brand-black mt-12">
          <p className="font-display text-xl uppercase tracking-widest text-brand-black">
            © 2026 {eventDetails.footer_title || `${eventDetails.title} TICKETING`}
          </p>
          <p className="font-mono text-[10px] uppercase mt-2 text-brand-black/60">
            {eventDetails.venue} · {eventDetails.footer_legal || "STRICTLY 18+ NO OUTSIDE DRINKS"}
          </p>
        </footer>
      </div>

      {/* STICKY MOBILE CTA BUTTON */}
      <AnimatePresence>
        {showStickyBtn && (
          <motion.div 
            initial={{ opacity: 0, y: 100 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 100 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 lg:hidden"
          >
            <button
              onClick={() => {
                document.getElementById("booking-container")?.scrollIntoView({ behavior: "smooth" });
              }}
              className="px-6 py-3 border-4 border-brand-black bg-brand-accent text-brand-black font-display text-xl uppercase tracking-widest shadow-[6px_6px_0px_0px_#050505] active:translate-y-[4px] active:translate-x-[4px] active:shadow-none transition-all flex items-center justify-center gap-2 whitespace-nowrap"
            >
              <TicketIcon className="w-5 h-5" />
              SECURE TICKETS
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* FLYER LIGHTBOX / EXPANDED VIEW */}
      <AnimatePresence>
        {isFlyerExpanded && (
          <motion.div 
            className="fixed inset-0 z-[100] flex items-center justify-center bg-brand-black/90 p-4 md:p-12 cursor-pointer backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-label={`${eventDetails.title} flyer preview`}
            onClick={() => setIsFlyerExpanded(false)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
          >
            <motion.div 
              className="relative w-full h-full max-w-5xl max-h-[90vh] border-8 border-brand-black shadow-[16px_16px_0px_0px_#FF3300] bg-white overflow-hidden cursor-default"
              initial={{ scale: 0.92, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.92, opacity: 0 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              onClick={(e) => e.stopPropagation()}
            >
              {isVideoFlyer ? (
                <video 
                  src={eventDetails.flyer_url} 
                  autoPlay 
                  controls 
                  loop 
                  playsInline 
                  className="w-full h-full object-contain bg-black"
                />
              ) : (
                <Image 
                  src={eventDetails.flyer_url} 
                  alt={`${eventDetails.title} Flyer Full`} 
                  fill
                  priority
                  sizes="(max-width: 1024px) 100vw, 80vw"
                  className="object-contain"
                  referrerPolicy="no-referrer"
                />
              )}
              <button 
                type="button"
                aria-label="Close flyer preview"
                className="absolute top-4 right-4 md:top-8 md:right-8 bg-brand-accent border-2 md:border-4 border-brand-black px-2.5 py-1 md:px-4 md:py-2 text-sm md:text-2xl font-black uppercase text-brand-black shadow-[2px_2px_0px_0px_#050505] md:shadow-[4px_4px_0px_0px_#050505] hover:bg-white hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] md:hover:translate-x-1 md:hover:translate-y-1 transition-all z-[110] flex items-center justify-center leading-none"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsFlyerExpanded(false);
                }}
              >
                X
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
