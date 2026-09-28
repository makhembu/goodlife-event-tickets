"use client";

import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  Ticket as TicketIcon, 
  Phone, 
  Layers, 
  Sparkles, 
  ShieldCheck, 
  Activity, 
  ArrowRight, 
  Download, 
  AlertTriangle,
  Flame,
  Tent,
  Settings,
  ChevronUp,
  ChevronDown,
  Copy,
  Check,
  Video,
  Store,
  Camera,
  Radio,
  Clock,
  Maximize2,
  X,
  Compass,
  BedSingle,
  Users
} from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { fetchEventDetails, EventDetails, fetchTicketTiers, TicketTier, Event } from "@/lib/supabase-db";
import confetti from "canvas-confetti";
import { HapticFeedback } from "@/components/ui/haptic-feedback";

interface CheckoutClientPageProps {
  initialEventDetails?: EventDetails;
  initialTicketTiers?: TicketTier[];
  availableEvents?: Event[];
  initialTierParam?: string;
}

export default function TicketCheckoutPage({ 
  initialEventDetails, 
  initialTicketTiers,
  availableEvents = [],
  initialTierParam
}: CheckoutClientPageProps) {
  // Available Events list
  const [eventsList, setEventsList] = useState<Event[]>(availableEvents);

  // Dynamic Event Details from Database
  const [eventDetails, setEventDetails] = useState<EventDetails>(initialEventDetails || {
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
  const [ticketTiers, setTicketTiers] = useState<TicketTier[]>(initialTicketTiers || []);

  // Package Switcher: "entry" vs "camping"
  const [activePackageTab, setActivePackageTab] = useState<"entry" | "camping">("entry");

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
  
  // Camping Grounds & Tent Walkthrough Tour Lightbox State
  const [showCampTourModal, setShowCampTourModal] = useState(false);

  // House Rules accordion
  const [rulesOpen, setRulesOpen] = useState(false);

  // Copy states
  const [copiedTill, setCopiedTill] = useState(false);
  const [copiedAmount, setCopiedAmount] = useState(false);

  // Admin session state
  const [isAdmin, setIsAdmin] = useState(false);

  const [paymentProvider, setPaymentProvider] = useState<"payhero" | "paystack">("payhero");
  const paystackEnabled = process.env.NEXT_PUBLIC_ENABLE_PAYSTACK === "true";
  const [stxReference, setStxReference] = useState<string | null>(null);
  const [pollingTimedOut, setPollingTimedOut] = useState(false);

  // Secret admin access (5x logo tap fallback when not logged in)
  const [logoTapCount, setLogoTapCount] = useState(0);
  const [showSecretMenu, setShowSecretMenu] = useState(false);
  const logoTapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const headerRef = useRef<HTMLElement>(null);
  const statusRef = useRef<HTMLDivElement>(null);
  const phoneInputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [headerBottom, setHeaderBottom] = useState(0);
  const [isSmallScreen, setIsSmallScreen] = useState(false);

  // Measure real header bottom on mount + resize
  useEffect(() => {
    const update = () => {
      setIsSmallScreen(window.innerWidth < 1024);
      if (headerRef.current) {
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
    if (isAdmin) return;
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

  // Fetch events list if empty
  useEffect(() => {
    if (eventsList.length === 0) {
      fetch("/api/events")
        .then(r => r.json())
        .then(data => {
          if (Array.isArray(data)) {
            setEventsList(data.filter((e: Event) => e.status === 'live' || e.status === 'scheduled' || e.is_active));
          }
        })
        .catch(() => {});
    }
  }, [eventsList.length]);

  // Haptic micro-feedback
  const triggerHaptic = useCallback((pattern: "success" | "confirmation" | "error") => {
    HapticFeedback.trigger(pattern);
  }, []);

  // Fire confetti when a new ticket arrives.
  // A ref, not state: this is read only as "have we already celebrated this
  // ticket?" inside the effect below. Nothing renders from it, so state cost an
  // extra render pass on every purchase for no benefit.
  const celebratedTicketRef = useRef<string | null>(null);
  useEffect(() => {
    if (generatedTicketId && celebratedTicketRef.current !== generatedTicketId) {
      celebratedTicketRef.current = generatedTicketId;
      setTimeout(() => {
        triggerHaptic("success");
        confetti({
          particleCount: 80,
          spread: 70,
          origin: { y: 0.6 },
          colors: ["#C79A56", "#142B4C", "#16a34a"],
        });
        setTimeout(() => {
          confetti({
            particleCount: 40,
            spread: 40,
            origin: { x: 0.3, y: 0.6 },
            colors: ["#142B4C", "#C79A56"],
          });
          confetti({
            particleCount: 40,
            spread: 40,
            origin: { x: 0.7, y: 0.6 },
            colors: ["#C79A56", "#142B4C"],
          });
        }, 200);
      }, 300);
    }
  }, [generatedTicketId, triggerHaptic]);

  // Initialize myTickets from local storage.
  //
  // Deliberately an effect, not a useState lazy initialiser. The initialiser
  // would run during the hydration render, so the client would render "My
  // Tickets (3)" where the server rendered nothing - a real hydration
  // mismatch. Reading an external store after mount is the case effects exist
  // for, so the rule is suppressed here rather than worked around at the cost
  // of a broken first paint.
  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem("my_goodlife_purchases");
        if (stored) {
          // eslint-disable-next-line react-hooks/set-state-in-effect
          setMyTickets(JSON.parse(stored));
        }
      } catch (e) {}
    }
  }, []);

  // Update myTickets when a new ticket is generated.
  //
  // Also left as an effect on purpose. The three call sites that set
  // generatedTicketId already sit on the payment-success path, and moving this
  // append into them to satisfy the linter risks double-adding a ticket or
  // dropping it - a real-money regression for a lint-level gain.
  useEffect(() => {
    if (generatedTicketId && !myTickets.includes(generatedTicketId)) {
      const updated = [generatedTicketId, ...myTickets];
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMyTickets(updated);
      if (typeof window !== "undefined") {
        localStorage.setItem("my_goodlife_purchases", JSON.stringify(updated));
      }
    }
  }, [generatedTicketId, myTickets]);

  // Fetch metadata for stored tickets
  useEffect(() => {
    if (myTickets.length === 0) return;
    const needed = myTickets.filter(id => !ticketDetailsMap[id]);
    if (needed.length === 0) return;

    let cancelled = false;
    Promise.all(needed.map(async (id) => {
      try {
        const res = await fetch(`/api/tickets/${id}`);
        if (res.ok) return { id, data: await res.json() };
        if (res.status === 404) return { id, dead: true };
        return null;
      } catch { return null; }
    })).then(results => {
      if (cancelled) return;
      const fresh: Record<string, any> = {};
      const deadIds: string[] = [];
      results.forEach(r => {
        if (!r) return;
        if ((r as any).dead) deadIds.push(r.id);
        else if ((r as any).data) fresh[(r as any).id] = (r as any).data;
      });
      if (deadIds.length) {
        const pruned = myTickets.filter(id => !deadIds.includes(id));
        setMyTickets(pruned);
        if (typeof window !== "undefined") {
          localStorage.setItem("my_goodlife_purchases", JSON.stringify(pruned));
        }
      }
      setTicketDetailsMap(prev => Object.keys(fresh).length ? { ...prev, ...fresh } : prev);
    });
    return () => { cancelled = true; };
  }, [myTickets, ticketDetailsMap]);

  // Handle Event Switching
  const handleSwitchEvent = async (targetEvent: Event) => {
    if (targetEvent.id === eventDetails.id) return;
    setLoading(true);
    setStatusMessage("");
    try {
      const tiers = await fetchTicketTiers(targetEvent.id);
      setEventDetails({
        id: targetEvent.id,
        title: targetEvent.title,
        subtitle: targetEvent.subtitle,
        tag: targetEvent.tag,
        venue: targetEvent.venue,
        till_number: targetEvent.till_number,
        flyer_url: targetEvent.flyer_url || "/flyer.png",
        regulations: targetEvent.regulations || "",
        ticker_text: targetEvent.ticker_text || "",
        logo_url: targetEvent.logo_url,
        event_date: targetEvent.event_date,
        status: targetEvent.status,
        category: targetEvent.category,
        sales_open_date: targetEvent.sales_open_date,
        sales_close_date: targetEvent.sales_close_date,
        next_event_title: targetEvent.next_event_title,
        recap_video_url: targetEvent.recap_video_url,
        max_tent_inventory: targetEvent.max_tent_inventory,
        max_shared_beds: targetEvent.max_shared_beds,
        recurrence_pattern: targetEvent.recurrence_pattern,
        recurrence_day: targetEvent.recurrence_day,
        recurrence_time: targetEvent.recurrence_time,
        custom_schedule_text: targetEvent.custom_schedule_text
      });
      setTicketTiers(tiers);
      
      const hasCamping = tiers.some(t => t.tier_category === 'camping' || t.is_camping_bundle || t.camping_type === 'shared_bed' || t.camping_type === 'private');
      if (!hasCamping) {
        setActivePackageTab("entry");
      }
      if (tiers.length > 0) {
        setSelectedTier(tiers[0].id);
      }
    } catch (e) {
      console.error("Failed to switch event:", e);
    } finally {
      setLoading(false);
    }
  };

  const isVideoFlyer = eventDetails.flyer_url ? /\.(mp4|webm|ogg|mov|m4v)($|\?)/i.test(eventDetails.flyer_url) || eventDetails.flyer_url.includes("video") : false;

  // Processed Tiers config with strict time/edition gating
  const TICKET_TIERS = useMemo(() => {
    // Current time in Kenya EAT (UTC+3)
    const now = new Date();
    const utcMs = now.getTime() + (now.getTimezoneOffset() * 60000);
    const eatDate = new Date(utcMs + (3 * 3600000));
    const eatDayOfWeek = eatDate.getDay(); // 0 = Sun, 6 = Sat, 1..5 = Mon..Fri
    const isWeekend = eatDayOfWeek === 0 || eatDayOfWeek === 6;

    // Check if today is the event date in EAT
    const isEventDay = eventDetails.event_date
      ? eatDate.toISOString().slice(0, 10) === new Date(eventDetails.event_date).toISOString().slice(0, 10)
      : false;

    const rawTiers: any[] = ticketTiers.length > 0 ? ticketTiers : [
      { id: "early-bird-500", name: "Early Bird Pass", price: 450, description: "Limited early access festival entry pass", tag: "TICKETS", tier_category: "entry", admits_quantity: 1, badge_text: "SELLING FAST" },
      { id: "advance-800", name: "ADVANCE PASS", price: 800, description: "Standard advance admission pass", tag: "TICKETS", tier_category: "entry", admits_quantity: 1 },
      { id: "vip-gate-1000", name: "gate VIP Fast‑Track Pass", price: 1000, description: "VIP lounge access + express queue jump", tag: "TICKETS", tier_category: "entry", admits_quantity: 1, show_only_on_event_day: true },
      { id: "shared-bed-6px-1200", name: "1PX BED IN SHARED 6PX TENT", price: 1200, description: "Festival Entry + 1 Bed in shared 6-Person dorm tent. Assigned on arrival at gate.", tag: "CAMPING", tier_category: "camping", admits_quantity: 1, is_camping_bundle: true, camping_type: "shared_bed", badge_text: "SOLO FAVORITE" },
      { id: "pitch-own-tent-1500", name: "PITCH YOUR OWN TENT", price: 1500, description: "Festival Entry for 2 Guests + Reserved Tent Pitch Ground Space", tag: "CAMPING", tier_category: "camping", admits_quantity: 2, is_camping_bundle: true, camping_type: "private" },
      { id: "2px-private-tent-2500", name: "2PX PRIVATE DOME TENT", price: 2500, description: "Festival Entry for 2 Guests + Private Dome Tent + 2 Mattresses", tag: "CAMPING", tier_category: "camping", admits_quantity: 2, is_camping_bundle: true, camping_type: "private" },
      { id: "4px-group-tent-4000", name: "4PX PRIVATE GROUP TENT", price: 4000, description: "Festival Entry for 4 Guests + Large 4-Person Dome Tent + 4 Mattresses", tag: "CAMPING", tier_category: "camping", admits_quantity: 4, is_camping_bundle: true, camping_type: "private", badge_text: "BEST VALUE" },
      { id: "6px-glamping-tent-6000", name: "6PX PRIVATE GLAMPING TENT", price: 6000, description: "Festival Entry for 6 Guests + Full Spacious Glamping Dome Tent", tag: "CAMPING", tier_category: "camping", admits_quantity: 6, is_camping_bundle: true, camping_type: "private" }
    ];

    const isMiniEvent = eventDetails.category === 'mini' || eventDetails.title?.toLowerCase().includes("sunday park");

    return rawTiers
      .filter((tier: any) => {
        if (tier.hidden) return false;

        const isCamping = tier.tier_category === 'camping' || tier.is_camping_bundle || tier.tag === 'CAMPING';

        // 1. MINI EVENT (e.g. Sunday Park & Chill #12)
        // Rule: Mon-Fri: ONLY Free RSVP pass. Sat-Sun (weekend): 300 & 1000 passes show, Free RSVP is hidden.
        if (isMiniEvent) {
          const isRsvp = tier.price === 0 || tier.tag?.includes('RSVP') || tier.id?.includes('rsvp') || tier.name?.toLowerCase().includes('rsvp');
          if (isWeekend) {
            // Weekend: Hide RSVP, show paid passes
            return !isRsvp;
          } else {
            // Weekday: ONLY show RSVP, hide paid passes
            return isRsvp;
          }
        }

        // 2. FLAGSHIP EVENT (e.g. GOODLIFE 4)
        // Camping tiers are always available in Camping tab while supplies last
        if (isCamping) {
          return true;
        }

        // A tier whose own availability window has closed must never be offered,
        // whatever the ladder below decides. The ladder only ever reasons about
        // Early Bird, so an expired Advance pass was promoted into the list
        // precisely because Early Bird had expired - and the server then refused
        // the payment, leaving the customer to fill in the form only to be
        // rejected. This check is what keeps the two in agreement.
        if (tier.available_from && eatDate < new Date(tier.available_from)) return false;
        if (tier.available_until && eatDate > new Date(tier.available_until)) return false;

        // Entry tiers: Strict Laddering
        // Check Early Bird status
        const earlyBird: any = rawTiers.find((t: any) => 
          (t.id?.toLowerCase().includes("early-bird") || t.name?.toLowerCase().includes("early bird")) &&
          !(t.tier_category === 'camping' || t.is_camping_bundle)
        );
        const isEarlyBirdActive = earlyBird ? (
          (!earlyBird.available_until || new Date(earlyBird.available_until) > eatDate) &&
          (earlyBird.max_quantity == null || (earlyBird.sold_count || 0) < earlyBird.max_quantity) &&
          !isEventDay
        ) : false;

        const isThisEarlyBird = tier.id?.toLowerCase().includes("early-bird") || tier.name?.toLowerCase().includes("early bird");
        const isThisAdvance = tier.id?.toLowerCase().includes("advance") || tier.name?.toLowerCase().includes("advance");
        const isThisGateVip = tier.id?.toLowerCase().includes("vip") || tier.name?.toLowerCase().includes("vip") || tier.show_only_on_event_day;

        // If today is Event Day: ONLY Gate / Event Day passes show. Early Bird and Advance are hidden.
        if (isEventDay) {
          if (tier.hide_on_event_day) return false;
          return Boolean(tier.show_only_on_event_day || isThisGateVip);
        }

        // Before Event Day:
        // Gate VIP only shows on event day!
        if (tier.show_only_on_event_day || isThisGateVip) {
          return false;
        }

        // If Early Bird is currently active: ONLY Early Bird shows under entry!
        if (isEarlyBirdActive) {
          return isThisEarlyBird;
        }

        // If Early Bird is expired or sold out (and not event day yet): Advance pass activates!
        if (!isEarlyBirdActive && isThisAdvance) {
          return true;
        }

        return false;
      })
      .map((tier: any) => ({
        id: tier.id,
        name: tier.name,
        price: Number(tier.price),
        desc: tier.description,
        tag: tier.tag,
        tier_category: tier.tier_category || (tier.tag === "CAMPING" ? "camping" : "entry"),
        admits_quantity: tier.admits_quantity || 1,
        is_camping_bundle: tier.is_camping_bundle ?? (tier.tag === "CAMPING"),
        camping_type: tier.camping_type || (tier.id.includes("shared") ? "shared_bed" : tier.tag === "CAMPING" ? "private" : "none"),
        badge_text: tier.badge_text ? tier.badge_text.replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '').trim() : null,
        tour_media_urls: tier.tour_media_urls || []
      }));
  }, [ticketTiers, eventDetails]);

  // Separate Entry vs Camping passes
  const entryTiers = useMemo(() => {
    return TICKET_TIERS.filter(t => t.tier_category === 'entry' || (!t.is_camping_bundle && t.camping_type !== 'private' && t.camping_type !== 'shared_bed'));
  }, [TICKET_TIERS]);

  const campingTiers = useMemo(() => {
    return TICKET_TIERS.filter(t => t.tier_category === 'camping' || t.is_camping_bundle || t.camping_type === 'private' || t.camping_type === 'shared_bed');
  }, [TICKET_TIERS]);

  // Filtered tiers for active tab
  const displayedTiers = useMemo(() => {
    if (activePackageTab === "camping" && campingTiers.length > 0) {
      return campingTiers;
    }
    return entryTiers;
  }, [activePackageTab, campingTiers, entryTiers]);

  // Safe selected tier
  const safeSelectedTier = useMemo(() => {
    const available = displayedTiers.map(t => t.id);
    if (available.includes(selectedTier)) return selectedTier;
    if (available.length > 0) return available[0];
    const allAvailable = TICKET_TIERS.map(t => t.id);
    return allAvailable.includes(selectedTier) ? selectedTier : (allAvailable[0] || "");
  }, [displayedTiers, TICKET_TIERS, selectedTier]);

  const selectedTierObj = useMemo(() => {
    return TICKET_TIERS.find(t => t.id === safeSelectedTier) || displayedTiers[0] || null;
  }, [TICKET_TIERS, safeSelectedTier, displayedTiers]);

  const totalPrice = useMemo(() => {
    const price = selectedTierObj?.price ?? 500;
    return price * quantity;
  }, [selectedTierObj, quantity]);

  // Deep-linking handler for ?tier=
  //
  // Applied during render, not in an effect. The server derives
  // `initialTierParam` from searchParams, and when it is absent the
  // window.location fallback provably returns the same value on the server and
  // the client (if the URL had ?tier=, the server would have received it), so
  // this stays hydration-safe. The old effect also meant the tier flashed as
  // unselected for one frame after the tiers finished loading.
  const deepLinkParam = initialTierParam
    ?? (typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("tier") : null);
  const deepLinkMatch = useMemo(() => {
    if (!deepLinkParam || TICKET_TIERS.length === 0) return null;
    const trimmed = deepLinkParam.trim().toLowerCase();
    const normalized = trimmed.replace(/[^a-z0-9]/g, "");
    return TICKET_TIERS.find(t =>
      t.id.toLowerCase() === trimmed ||
      t.name.toLowerCase() === trimmed ||
      t.id.toLowerCase().replace(/[^a-z0-9]/g, "") === normalized ||
      t.name.toLowerCase().replace(/[^a-z0-9]/g, "") === normalized
    ) || null;
  }, [deepLinkParam, TICKET_TIERS]);

  // Keyed on the tier set as well as the id, so a deep link re-applies after the
  // tiers load and after an event switch, matching the effect's original
  // [initialTierParam, TICKET_TIERS] deps. A signature of the ids is used rather
  // than the array identity: TICKET_TIERS is a .map() result with its own
  // structural type, not TicketTier[], so it cannot be stored in typed state.
  const tierSetKey = TICKET_TIERS.map(t => t.id).join("|");
  const [appliedDeepLink, setAppliedDeepLink] = useState<{ key: string; id: string } | null>(null);
  if (deepLinkMatch && (appliedDeepLink?.key !== tierSetKey || appliedDeepLink.id !== deepLinkMatch.id)) {
    setAppliedDeepLink({ key: tierSetKey, id: deepLinkMatch.id });
    setSelectedTier(deepLinkMatch.id);
    const isCamping = deepLinkMatch.tier_category === 'camping' || deepLinkMatch.is_camping_bundle || deepLinkMatch.camping_type === 'private' || deepLinkMatch.camping_type === 'shared_bed';
    setActivePackageTab(isCamping ? "camping" : "entry");
  }

  // Keep the selected tier inside the displayed set. Also during render: as an
  // effect this cost an extra pass, so after a tab switch the tier cards could
  // paint once with nothing highlighted while `safeSelectedTier` had already
  // moved on to a valid tier.
  const [displayedTiersSeen, setDisplayedTiersSeen] = useState(displayedTiers);
  if (displayedTiersSeen !== displayedTiers) {
    setDisplayedTiersSeen(displayedTiers);
    const available = displayedTiers.map(t => t.id);
    if (available.length > 0 && !available.includes(selectedTier)) {
      setSelectedTier(available[0]);
    }
  }

  // Checkout submission (PayHero STK push or KES 0 Free RSVP)
  const handleCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    setStxReference(null);
    setGeneratedTicketId(null);
    setStatusMessage("");

    if (!phoneNumber) {
      triggerHaptic("error");
      setStatusMessage("Please enter your phone number.");
      phoneInputRef.current?.focus();
      return;
    }

    setLoading(true);

    // KES 0 FREE RSVP PIPELINE (Instant Server-Side Issuance without STK Push)
    if (totalPrice === 0 || selectedTierObj?.price === 0) {
      setStatusMessage("Registering your free pass...");
      try {
        const res = await fetch("/api/tickets/rsvp-free", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            event_id: eventDetails.id,
            ticket_type: safeSelectedTier,
            buyer_name: buyerName || "Guest",
            phone_number: phoneNumber,
            whatsapp_number: showWhatsAppField && whatsappNumber ? whatsappNumber : ""
          })
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "Free registration failed. Capacity may be reached.");
        }

        const ids = data.ticket_ids || [data.ticket_id];
        setGeneratedTicketId(ids[0]);
        setMyTickets(prev => {
          const merged = Array.from(new Set([...ids, ...prev]));
          if (typeof window !== "undefined") {
            localStorage.setItem("my_goodlife_purchases", JSON.stringify(merged));
          }
          return merged;
        });

        triggerHaptic("success");
        setStatusMessage("RSVP Confirmed! Your free entry pass is ready and has been dispatched to WhatsApp.");
      } catch (err: any) {
        triggerHaptic("error");
        setStatusMessage(err.message || "An error occurred issuing your free pass.");
      } finally {
        setLoading(false);
      }
      return;
    }

    // STANDARD PAID CHECKOUT (PayHero STK Push)
    setStatusMessage("Sending the M-Pesa prompt to your phone...");
    const autoEmail = phoneNumber.replace(/[^0-9]/g, "") + "@example.goodlife.com";

    try {
      const endpoint = paymentProvider === "payhero" ? "/api/payhero/initialize" : "/api/paystack/initialize";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: autoEmail,
          phone_number: phoneNumber,
          ticket_type: safeSelectedTier,
          buyer_name: buyerName || "Attendee",
          quantity: Number(quantity),
          whatsapp_number: showWhatsAppField && whatsappNumber ? whatsappNumber : "",
          event_id: eventDetails.id
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Payment initialization failed.");
      }

      setStxReference(data.reference);
      triggerHaptic("confirmation");
      setStatusMessage("Prompt sent! Check your phone and enter your M-Pesa PIN to confirm payment.");
    } catch (err: any) {
      triggerHaptic("error");
      setStatusMessage(err.message || "An error occurred processing your request.");
      setLoading(false);
    }
  };

  // Sticky action bar click handler
  const handleStickyActionClick = () => {
    if (!phoneNumber.trim()) {
      phoneInputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      phoneInputRef.current?.focus();
    } else {
      formRef.current?.requestSubmit();
    }
  };

  // Polling for payment completion
  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    if (stxReference && !generatedTicketId) {
      interval = setInterval(async () => {
        try {
          const res = await fetch(`/api/${paymentProvider}/verify?reference=${stxReference}`);
          if (res.ok) {
            const data = await res.json();
            if (data.status === "completed" && data.ticket_id) {
              const ids: string[] = (data.ticket_ids && Array.isArray(data.ticket_ids) && data.ticket_ids.length > 0)
                ? data.ticket_ids
                : [data.ticket_id];
              setGeneratedTicketId(ids[0]);
              setMyTickets(prev => {
                const merged = Array.from(new Set([...ids, ...prev]));
                if (typeof window !== "undefined") {
                  localStorage.setItem("my_goodlife_purchases", JSON.stringify(merged));
                }
                return merged;
              });
              setStatusMessage(ids.length > 1 ? `Payment confirmed! All ${ids.length} tickets are ready.` : "Payment confirmed. Your ticket is ready.");
              setLoading(false);
              clearInterval(interval);
            } else if (data.status === "failed") {
              clearInterval(interval);
              setLoading(false);
              setPollingTimedOut(true);
              triggerHaptic("error");
              setStatusMessage(data.message ? `Payment failed: ${data.message}` : "Payment failed: transaction was declined or cancelled. Please try again.");
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
  }, [stxReference, generatedTicketId, paymentProvider, triggerHaptic]);

  // Auto-scroll to payment status
  useEffect(() => {
    if (statusMessage && statusRef.current) {
      statusRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [statusMessage]);

  // Polling timeout.
  // The "are we still waiting?" reset happens during render, so a finished or
  // abandoned payment can never leave the timeout banner stuck on screen. The
  // effect now only owns the timer, which is genuinely a side effect.
  const [pollingKey, setPollingKey] = useState({ stxReference, generatedTicketId });
  if (pollingKey.stxReference !== stxReference || pollingKey.generatedTicketId !== generatedTicketId) {
    setPollingKey({ stxReference, generatedTicketId });
    setPollingTimedOut(false);
  }

  useEffect(() => {
    if (!stxReference || generatedTicketId) return;
    const timer = setTimeout(() => setPollingTimedOut(true), 15000);
    return () => clearTimeout(timer);
  }, [stxReference, generatedTicketId]);

  const handleManualStatusCheck = async () => {
    if (!stxReference) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/${paymentProvider}/verify?reference=${stxReference}`);
      if (res.ok) {
        const data = await res.json();
        if (data.status === "completed" && data.ticket_id) {
          const ids: string[] = (data.ticket_ids && Array.isArray(data.ticket_ids) && data.ticket_ids.length > 0)
            ? data.ticket_ids
            : [data.ticket_id];
          setGeneratedTicketId(ids[0]);
          setMyTickets(prev => {
            const merged = Array.from(new Set([...ids, ...prev]));
            if (typeof window !== "undefined") {
              localStorage.setItem("my_goodlife_purchases", JSON.stringify(merged));
            }
            return merged;
          });
          setStatusMessage(ids.length > 1 ? `Payment confirmed! All ${ids.length} tickets are ready.` : "Payment confirmed. Your ticket is ready.");
          setLoading(false);
          setPollingTimedOut(false);
        } else if (data.status === "failed") {
          triggerHaptic("error");
          setStatusMessage(data.message ? `Payment failed: ${data.message}` : "Payment failed: transaction was declined or cancelled. Please try again.");
          setLoading(false);
        } else {
          triggerHaptic("error");
          setStatusMessage("Status check: payment is not confirmed yet. Try again or contact admin.");
        }
      } else {
        triggerHaptic("error");
        setStatusMessage("Status check: server error. Contact admin if payment was deducted.");
      }
    } catch {
      triggerHaptic("error");
      setStatusMessage("Status check: network error. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-brand-bg py-6 md:py-8 px-4 md:px-12 text-brand-navy font-sans selection:bg-brand-accent selection:text-brand-off-white relative overflow-x-clip pb-28 lg:pb-12">
      
      {/* Decorative Grid Background */}
      <div className="absolute inset-0 z-0 pointer-events-none opacity-20"
           style={{ backgroundImage: 'radial-gradient(rgba(20,43,76,0.18) 1px, transparent 1px), radial-gradient(rgba(199,154,86,0.12) 1px, transparent 1px)', backgroundSize: '24px 24px, 48px 48px', backgroundPosition: '0 0, 12px 12px' }}></div>

      <div className="relative z-10 max-w-6xl mx-auto">
        
        {/* HEADER NAVBAR */}
        <header ref={headerRef} className="w-full flex items-center justify-between border-b-4 border-brand-navy pb-3 mb-4 md:pb-6 md:mb-6 gap-3 md:gap-6">
          <button
            type="button"
            className="flex items-center gap-2 md:gap-3 shrink-0 cursor-pointer select-none text-left"
            onClick={handleLogoTap}
            aria-label={isAdmin ? `${eventDetails.title} home` : "Open staff access after five taps"}
          >
            <div className="p-1 md:p-2 border-2 border-brand-navy bg-brand-accent shadow-(--shadow-brut-xs-strong) md:shadow-(--shadow-brut-sm-strong) flex items-center justify-center">
              {eventDetails.logo_url ? (
                <img src={eventDetails.logo_url} alt={`${eventDetails.title} logo`} className="w-5 h-5 md:w-6 md:h-6 object-contain" />
              ) : (
                <span className="font-display font-black text-xs md:text-sm tracking-tighter text-brand-navy">GL</span>
              )}
            </div>
            <span className="font-display text-xl md:text-4xl tracking-wide uppercase text-brand-navy pt-1">{eventDetails.title}</span>
          </button>

          {/* PUBLIC NAV — Gallery, Radio only.
              Staff surfaces (Admin Console, Gate Scanner, Vendor POS) are reached
              by tapping the logo 5 times, which opens the secret staff menu
              further down. They must not be advertised here: middleware already
              blocks the routes, but publishing the links pointed every visitor
              straight at the back doors. */}
          <nav className="hidden md:flex items-center gap-4 shrink-0">
            <Link href="/gallery" className="font-mono text-xs font-bold uppercase tracking-widest text-brand-navy hover:text-brand-accent transition-colors flex items-center gap-1">
              <Camera className="w-3.5 h-3.5" /> Gallery
            </Link>
            <Link href="/radio" className="font-mono text-xs font-bold uppercase tracking-widest text-brand-navy hover:text-brand-accent transition-colors flex items-center gap-1">
              <Radio className="w-3.5 h-3.5" /> Radio
            </Link>
          </nav>
          {/* Mobile: icon-only */}
          <nav className="flex md:hidden items-center gap-1.5 shrink-0">
            <Link href="/gallery" aria-label="Gallery" className="p-1.5 border-2 border-brand-navy bg-brand-off-white hover:bg-brand-accent transition-colors shadow-(--shadow-brut-xs)">
              <Camera className="w-4 h-4 text-brand-navy" />
            </Link>
            <Link href="/radio" aria-label="Radio" className="p-1.5 border-2 border-brand-navy bg-brand-off-white hover:bg-brand-accent transition-colors shadow-(--shadow-brut-xs)">
              <Radio className="w-4 h-4 text-brand-navy" />
            </Link>
          </nav>

          <div className="flex gap-2 md:gap-4 shrink-0 justify-end">
            {myTickets.length > 0 && (
              <button 
                onClick={() => document.getElementById("my-tickets-section")?.scrollIntoView({ behavior: "smooth" })}
                className="text-[11px] md:text-xs font-bold uppercase border-2 border-brand-navy bg-brand-off-white px-2 py-1 md:px-4 md:py-2 text-brand-navy hover:bg-brand-navy hover:text-brand-off-white shadow-(--shadow-brut-xs) md:shadow-(--shadow-brut-sm) active:translate-y-[2px] active:translate-x-[2px] active:shadow-none transition-all whitespace-nowrap"
              >
                My Tickets ({myTickets.length})
              </button>
            )}
            {/* Show admin nav when session is active */}
            {isAdmin && (
              <>
                <Link
                  href="/admin/dashboard"
                  className="text-[11px] md:text-xs font-bold uppercase border-2 border-brand-navy bg-brand-off-white px-2 py-1 md:px-4 md:py-2 text-brand-navy hover:bg-brand-navy hover:text-brand-off-white shadow-(--shadow-brut-xs) md:shadow-(--shadow-brut-sm) active:translate-y-[2px] active:translate-x-[2px] active:shadow-none transition-all whitespace-nowrap flex items-center gap-1"
                >
                  <Settings className="w-3 h-3 md:w-4 md:h-4" /> Admin
                </Link>
                <Link
                  href="/admin/vendors"
                  className="text-[11px] md:text-xs font-bold uppercase border-2 border-brand-navy bg-brand-accent px-2 py-1 md:px-3 md:py-2 text-brand-navy hover:bg-brand-navy hover:text-brand-off-white shadow-(--shadow-brut-xs) md:shadow-(--shadow-brut-sm) active:translate-y-[2px] active:translate-x-[2px] active:shadow-none transition-all whitespace-nowrap hidden sm:inline-flex items-center gap-1"
                >
                  <Store className="w-3 h-3 md:w-4 md:h-4" /> Vendors & Staff
                </Link>
                <Link
                  href="/admin/scanner"
                  className="text-[11px] md:text-xs font-bold uppercase border-2 border-brand-navy bg-brand-off-white px-2 py-1 md:px-4 md:py-2 text-brand-navy hover:bg-brand-navy hover:text-brand-off-white shadow-(--shadow-brut-xs) md:shadow-(--shadow-brut-sm) active:translate-y-[2px] active:translate-x-[2px] active:shadow-none transition-all flex items-center gap-1 md:gap-2 whitespace-nowrap"
                >
                  <TicketIcon className="w-3 h-3 md:w-4 md:h-4" strokeWidth={2.5} /> Scanner
                </Link>
              </>
            )}
          </div>
        </header>

        {/* MULTI-EVENT SWITCHER (Rendered if > 1 live/scheduled events exist) */}
        {eventsList.length > 1 && (
          <div className="flex items-center gap-2 border-4 border-brand-navy bg-brand-navy px-2 py-1.5 shadow-(--shadow-brut-sm) mb-4 md:mb-6 md:p-2">
            <div className="text-[10px] md:text-[11px] font-mono uppercase text-brand-accent flex items-center gap-1 px-1 font-bold shrink-0">
              <Layers className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">EDITIONS</span>
              <span className="sm:hidden">ED.</span>
            </div>
            {/* Horizontal scroller on mobile, wraps from md up. Event titles are
                long ("SUNDAY PARK & CHILL #12"), so letting these wrap gave the
                bar three or four rows and pushed the poster, the venue and the
                till details off the first screen. The editions stay reachable -
                they just stop eating the viewport. */}
            <div className="flex gap-1.5 flex-1 min-w-0 overflow-x-auto overscroll-x-contain snap-x snap-mandatory md:flex-wrap md:overflow-x-visible md:snap-none [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {eventsList.map(evt => {
                const isCurrent = evt.id === eventDetails.id;
                return (
                  <button
                    key={evt.id}
                    type="button"
                    onClick={() => handleSwitchEvent(evt)}
                    className={`py-1 px-2.5 md:px-3 border-2 font-display text-xs md:text-sm uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer shrink-0 snap-start ${
                      isCurrent
                        ? "border-brand-accent bg-brand-accent text-brand-navy font-bold shadow-(--shadow-brut-xs)"
                        : "border-brand-off-white/40 bg-brand-navy text-brand-off-white hover:border-brand-accent hover:text-brand-accent"
                    }`}
                  >
                    <span className="truncate max-w-[150px] md:max-w-none">{evt.title}</span>
                    {evt.category === 'mini' && (
                      <span className="text-[9px] bg-brand-navy/60 text-brand-off-white px-1 py-0.2 border border-brand-off-white/30 font-mono">
                        MINI
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* SECRET ADMIN MENU */}
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

        <main className="w-full grid grid-cols-1 lg:grid-cols-12 gap-6 md:gap-8 items-start mb-8">

          {/* LEFT COLUMN: HERO FLYER & ADVISORIES (5 cols on lg) */}
          <section className="lg:col-span-5 space-y-4 md:space-y-6">
            
            {/* HERO FLYER MOTIF CARD */}
            <div className="border-4 border-brand-navy bg-brand-off-white p-3 md:p-6 relative shadow-(--shadow-brut-sm-strong) md:shadow-(--shadow-brut-xl-soft)">
              
              {/* Category / Status badge */}
              <div className="absolute -top-3 -right-3 md:-top-4 md:-right-4 bg-brand-accent text-brand-navy border-2 border-brand-navy px-2 py-0.5 md:px-4 md:py-1 text-[11px] md:text-xs font-black tracking-widest uppercase shadow-(--shadow-brut-xs) md:shadow-(--shadow-brut-sm) rotate-3">
                {eventDetails.category === 'mini' ? 'MINI EVENT' : 'LIVE EVENT'}
              </div>

              <div className="relative flex flex-col md:space-y-4">
                <div className="absolute top-2 left-2 z-10 w-fit max-w-[90%] bg-brand-off-white/95 backdrop-blur-sm border-2 border-brand-navy p-2 md:p-2.5 shadow-(--shadow-brut-sm) pointer-events-none md:pointer-events-auto">
                  <span className="text-[11px] md:text-xs font-black tracking-widest text-brand-navy uppercase block bg-brand-navy text-brand-off-white w-fit px-1.5 py-0.5 md:px-2 md:py-0.5 mb-1 md:mb-1">
                    {eventDetails.tag}
                  </span>
                  <h1 className="text-3xl sm:text-4xl md:text-5xl font-display uppercase text-brand-navy leading-none mt-1">
                    {eventDetails.title}
                  </h1>
                  <p className="text-[11px] md:text-sm font-bold uppercase tracking-widest text-brand-navy mt-1 flex items-center gap-1.5 md:gap-2">
                    <span className="w-2 h-2 md:w-3 md:h-3 border-2 border-brand-navy bg-brand-accent animate-pulse shrink-0" />
                    <span className="truncate">{eventDetails.subtitle}</span>
                  </p>
                  {eventDetails.custom_schedule_text ? (
                    <div className="mt-1 inline-flex items-center gap-1.5 px-2 py-0.5 border border-brand-navy bg-brand-navy text-brand-accent text-[9px] md:text-[11px] font-mono font-bold uppercase tracking-wider">
                      <Clock className="w-3 h-3 text-brand-accent shrink-0" />
                      <span>{eventDetails.custom_schedule_text}</span>
                    </div>
                  ) : eventDetails.recurrence_pattern && eventDetails.recurrence_pattern !== 'none' ? (
                    <div className="mt-1 inline-flex items-center gap-1.5 px-2 py-0.5 border border-brand-navy bg-brand-navy text-brand-accent text-[9px] md:text-[11px] font-mono font-bold uppercase tracking-wider">
                      <Clock className="w-3 h-3 text-brand-accent shrink-0" />
                      <span>EVERY {eventDetails.recurrence_day?.toUpperCase()} | {eventDetails.recurrence_time}</span>
                    </div>
                  ) : null}
                </div>

                {/* EVENT FLYER CONTAINER
                    Deliberately NOT sized against the viewport. It used to be
                    md:h-[calc(100dvh-330px)], which made the poster eat almost
                    the whole first screen on any large display and pushed the
                    venue, the till number and the buy path below the fold. The
                    poster is a preview; the full-size view is the lightbox
                    behind "ENLARGE FULL POSTER", which is one tap away. */}
                <div className="relative w-full max-md:h-[180px] max-md:max-h-[180px] md:aspect-auto md:h-[420px] md:max-h-[420px] border-2 border-brand-navy shadow-(--shadow-brut-sm-strong) overflow-hidden bg-brand-off-white group mt-0 md:my-3">
                  <button 
                    type="button"
                    onClick={() => setIsFlyerExpanded(true)}
                    className="w-full h-full block relative text-left focus:outline-none focus:ring-4 focus:ring-brand-accent cursor-pointer"
                    aria-label="Enlarge full poster"
                  >
                    {isVideoFlyer ? (
                      <video 
                        src={eventDetails.flyer_url} 
                        autoPlay 
                        muted 
                        loop 
                        playsInline 
                        className="w-full h-full object-cover md:object-contain pointer-events-none"
                      />
                    ) : (
                      <Image
                        src={eventDetails.flyer_url}
                        alt={`${eventDetails.title} Flyer`}
                        fill
                        priority
                        className="object-cover object-top md:object-contain transition-all duration-700"
                        referrerPolicy="no-referrer"
                      />
                    )}
                    {/* Subtle top gradient */}
                    <div className="absolute top-0 left-0 w-full h-24 md:h-32 bg-gradient-to-b from-brand-off-white via-brand-off-white/80 to-transparent pointer-events-none" />

                    {/* Mobile Quick Lightbox Tag inside the crop */}
                    <div className="absolute bottom-2 right-2 z-20 md:hidden bg-brand-navy text-brand-accent border-2 border-brand-accent px-2 py-1 font-mono text-[10px] font-black uppercase flex items-center gap-1.5 shadow-(--shadow-brut-xs)">
                      <Maximize2 className="w-3 h-3" /> FULL POSTER
                    </div>

                    {/* Marquee ticker on desktop */}
                    <div className="absolute bottom-0 left-0 w-full h-6 bg-brand-accent border-t-2 border-brand-navy overflow-hidden flex items-center max-md:hidden">
                      <div className="flex animate-marquee whitespace-nowrap font-display text-lg tracking-wider text-brand-navy pt-1">
                        <span className="pr-4">{eventDetails.ticker_text || "NO ENTRY WITHOUT VALIDATION ✦ STRICTLY 18+ ✦ "}</span>
                        <span className="pr-4">{eventDetails.ticker_text || "NO ENTRY WITHOUT VALIDATION ✦ STRICTLY 18+ ✦ "}</span>
                      </div>
                    </div>
                  </button>
                </div>

                {/* Mobile Hero Trigger: Brutalist [ENLARGE FULL POSTER] button */}
                <button
                  type="button"
                  onClick={() => setIsFlyerExpanded(true)}
                  className="w-full py-2.5 px-3 border-2 border-brand-navy bg-brand-off-white text-brand-navy font-mono text-xs font-black uppercase flex items-center justify-center gap-2 shadow-(--shadow-brut-xs) active:translate-x-[1px] active:translate-y-[1px] hover:bg-brand-navy hover:text-brand-off-white transition-all md:hidden cursor-pointer"
                >
                  <Maximize2 className="w-3.5 h-3.5" /> ENLARGE FULL POSTER
                </button>

                {/* Venue / Till details.
                    These used to be `truncate` in a 2-column grid, so on a phone
                    "MARARA CAMP, THIKA" was cut to "MARARA CAM..." - the two
                    facts a buyer most wants to check before paying. Wrapping
                    keeps the 2-up layout and makes the text legible. */}
                <div className="grid grid-cols-2 gap-3 text-xs font-black uppercase pt-1">
                  <div className="bg-brand-off-white p-3 border-2 border-brand-navy shadow-(--shadow-brut-sm-strong) min-w-0">
                    <span className="block text-[10px] text-brand-navy border-b border-brand-navy pb-1 mb-1 font-mono">LOCATION</span>
                    <span className="text-brand-navy block text-[11px] md:text-xs leading-tight break-words">{eventDetails.venue}</span>
                  </div>
                  <div className="bg-brand-accent p-3 border-2 border-brand-navy shadow-(--shadow-brut-sm-strong) min-w-0">
                    <span className="block text-[10px] text-brand-navy border-b border-brand-navy pb-1 mb-1 font-mono">PAYMENT TILL</span>
                    <span className="text-brand-navy block text-sm md:text-base font-display break-all">#{eventDetails.till_number}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* SYSTEM REGULATORY ADVISORIES */}
            <div className="border-4 border-brand-navy bg-brand-navy text-brand-off-white shadow-(--shadow-brut-xl-accent)">
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

          {/* RIGHT COLUMN: BOOKING AND CHECKOUT GATEWAY (7 cols on lg) */}
          <section className="lg:col-span-7 lg:sticky lg:top-8 lg:self-start pt-4 lg:pt-8">
            <div className="relative">
              {/* Folder Tab */}
              <div className="absolute -top-7 left-4 bg-brand-accent text-brand-navy border-4 border-b-0 border-brand-navy px-6 py-0.5 font-display text-base md:text-lg tracking-widest uppercase font-bold z-20">
                BOOKING
              </div>
              
              <div
                id="booking-container"
                className="border-4 border-brand-navy bg-brand-off-white p-4 md:p-6 relative shadow-(--shadow-brut-2xl) overflow-y-auto"
                style={headerBottom > 0 && !isSmallScreen
                  ? { maxHeight: `calc(100dvh - ${headerBottom + 48}px)` }
                  : undefined}
              >
                <h2 className="text-2xl md:text-4xl font-display uppercase border-b-4 border-brand-navy pb-1.5 mb-3 md:pb-3 md:mb-3 flex items-center gap-2 md:gap-3 text-brand-navy">
                  <div className="bg-brand-navy text-brand-off-white p-1">
                    <TicketIcon className="w-5 h-5 md:w-8 md:h-8" />
                  </div>
                  GET YOUR PASSES
                </h2>

                {/* 2-TAB PACKAGE SWITCHER: ENTRY PASSES vs ALL-INCLUSIVE CAMPING */}
                {campingTiers.length > 0 && (
                  <div className="flex border-4 border-brand-navy bg-brand-off-white p-1 gap-1 mb-4 shadow-(--shadow-brut-xs)">
                    <button
                      type="button"
                      onClick={() => setActivePackageTab("entry")}
                      className={`flex-1 py-2 px-2 sm:px-3 font-display text-xs sm:text-sm md:text-base uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                        activePackageTab === "entry"
                          ? "bg-brand-navy text-brand-off-white shadow-(--shadow-brut-xs)"
                          : "bg-transparent text-brand-navy/60 hover:text-brand-navy hover:bg-brand-bg"
                      }`}
                    >
                      <TicketIcon className="w-4 h-4" /> ENTRY PASSES ({entryTiers.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setActivePackageTab("camping")}
                      className={`flex-1 py-2 px-2 sm:px-3 font-display text-xs sm:text-sm md:text-base uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                        activePackageTab === "camping"
                          ? "bg-brand-accent text-brand-navy font-bold shadow-(--shadow-brut-xs)"
                          : "bg-transparent text-brand-navy/60 hover:text-brand-navy hover:bg-brand-bg"
                      }`}
                    >
                      <Tent className="w-4 h-4" /> ALL-INCLUSIVE CAMPING ({campingTiers.length})
                    </button>
                  </div>
                )}

                {/* CAMPING DISCOVERY ZONE (Exclusively in Camping Tab) */}
                {activePackageTab === "camping" && campingTiers.length > 0 && (
                  <div className="space-y-3 mb-4">
                    {/* All-Inclusive Clarity Callout */}
                    <div className="bg-brand-navy text-brand-off-white border-2 border-brand-accent p-2.5 shadow-(--shadow-brut-xs) flex items-start gap-2">
                      <Sparkles className="w-4 h-4 text-brand-accent shrink-0 mt-0.5" />
                      <p className="text-[11px] font-mono uppercase leading-tight">
                        <span className="text-brand-accent font-bold">ALL-INCLUSIVE:</span> ALL TENT & BED PACKAGES INCLUDE FULL FESTIVAL ENTRY FOR ALL GUESTS. NO SEPARATE ENTRY TICKET NEEDED!
                      </p>
                    </div>

                    {/* Live Marara Camp Availability Ticker */}
                    <div className="border-2 border-brand-navy bg-brand-accent/20 p-2.5 flex items-center justify-between shadow-(--shadow-brut-2xs)">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-red-600 animate-pulse shrink-0" />
                        <span className="font-mono text-[11px] font-black uppercase text-brand-navy tracking-wide">
                          CAMP GROUNDS STATUS: 82% BOOKED
                        </span>
                      </div>
                      <span className="text-[10px] font-mono font-bold uppercase bg-brand-navy text-brand-accent px-1.5 py-0.5 whitespace-nowrap">
                        ONLY 4 TENTS & 3 BEDS LEFT
                      </span>
                    </div>

                    {/* Camp & Tent Walkthrough Tour Trigger */}
                    <button
                      type="button"
                      onClick={() => setShowCampTourModal(true)}
                      className="w-full p-2.5 border-2 border-dashed border-brand-navy bg-brand-off-white hover:bg-brand-accent/20 transition-all flex items-center justify-between text-left group cursor-pointer shadow-(--shadow-brut-2xs)"
                    >
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 border border-brand-navy bg-brand-navy text-brand-off-white group-hover:bg-brand-accent group-hover:text-brand-navy transition-colors shrink-0">
                          <Video className="w-3.5 h-3.5" />
                        </div>
                        <div>
                          <div className="font-display text-xs sm:text-sm uppercase text-brand-navy">
                            CAMP GROUNDS & TENT WALKTHROUGH
                          </div>
                          <div className="text-[10px] font-mono text-brand-navy/70 uppercase">
                            Drone tour, private dome tents, shared dorms & amenities
                          </div>
                        </div>
                      </div>
                      <span className="font-mono text-[10px] font-bold text-brand-navy underline uppercase shrink-0 ml-1">
                        VIEW TOUR &rarr;
                      </span>
                    </button>
                  </div>
                )}

                <form ref={formRef} onSubmit={handleCheckout} className="space-y-3 md:space-y-3.5">
                  
                  {/* TIER SELECTION GRID */}
                  <div className="space-y-1.5 md:space-y-2">
                    <div className="bg-brand-navy text-brand-off-white inline-block px-2.5 py-0.5 font-bold text-[11px] md:text-xs uppercase tracking-widest">
                      01. SELECT {activePackageTab === "camping" ? "CAMPING PACKAGE" : "PASS TYPE"}
                    </div>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5" role="radiogroup">
                      {displayedTiers.map((tier) => {
                        const isSelected = safeSelectedTier === tier.id;
                        const isSharedBed = tier.camping_type === 'shared_bed';
                        const isFree = tier.price === 0;

                        return (
                          <button
                            key={tier.id}
                            type="button"
                            role="radio"
                            aria-checked={isSelected}
                            onClick={() => setSelectedTier(tier.id)}
                            className={`text-left p-2.5 md:p-3.5 border-4 transition-all duration-75 relative flex flex-col justify-between gap-1.5 cursor-pointer ${
                              isSelected 
                                ? "border-brand-navy bg-brand-accent text-brand-navy shadow-(--shadow-brut-lg) translate-x-1 -translate-y-1 font-bold" 
                                : "border-brand-navy bg-brand-off-white text-brand-navy hover:bg-brand-bg shadow-(--shadow-brut-md) active:translate-x-1 active:-translate-y-1"
                            }`}
                          >
                            <div className="space-y-1">
                              {/* Urgency / Badge Text */}
                              {tier.badge_text && (
                                <div className="text-[10px] font-mono font-black uppercase text-brand-navy bg-brand-navy/10 px-1.5 py-0.5 border border-brand-navy/20 w-fit">
                                  {tier.badge_text}
                                </div>
                              )}

                              <div className="flex items-start justify-between gap-1.5">
                                <span className="font-display text-base sm:text-lg uppercase leading-none pt-0.5 text-brand-navy">
                                  {tier.name}
                                </span>
                                <span className="font-display text-base sm:text-lg leading-none text-brand-navy font-bold shrink-0 whitespace-nowrap">
                                  {isFree ? "FREE RSVP" : `KES ${tier.price.toLocaleString()}`}
                                </span>
                              </div>

                              <p className="text-[11px] font-mono uppercase leading-tight text-brand-navy/80 line-clamp-2">
                                {tier.desc}
                              </p>

                              {/* Capacity & Option B Details */}
                              <div className="flex flex-wrap items-center justify-between gap-1 mt-1 pt-1 border-t border-brand-navy/20">
                                <div className="flex items-center gap-1 text-[10px] font-mono font-bold uppercase text-brand-navy">
                                  {isSharedBed ? (
                                    <>
                                      <BedSingle className="w-3 h-3 text-brand-navy shrink-0" />
                                      <span>1 BED (GATE ASSIGNED)</span>
                                    </>
                                  ) : (
                                    <>
                                      <Users className="w-3 h-3 text-brand-navy shrink-0" />
                                      <span>ADMITS {tier.admits_quantity} GUEST{tier.admits_quantity > 1 ? 'S' : ''}</span>
                                    </>
                                  )}
                                </div>
                                <span className="text-[10px] px-1 py-0.2 font-bold uppercase border border-brand-navy bg-brand-navy text-brand-off-white whitespace-nowrap">
                                  {tier.tag}
                                </span>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 md:gap-4">
                    {/* LEFT COLUMN: Details & Passes */}
                    <div className="space-y-2 md:space-y-3 flex flex-col">
                      {/* STEP 2: BUYER FULL NAME */}
                      <div className="space-y-1">
                        <label htmlFor="buyer-name" className="bg-brand-navy text-brand-off-white inline-block px-2 py-0.5 font-bold text-[10px] md:text-xs uppercase tracking-widest">
                          02. YOUR NAME
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
                          className="block w-full px-3 py-2 border-4 border-brand-navy bg-brand-off-white font-mono text-xs md:text-sm uppercase placeholder-brand-navy/30 focus:outline-none focus:bg-brand-accent/10 focus:shadow-(--shadow-brut-sm) transition-all text-brand-navy"
                        />
                      </div>

                      {/* STEP 3: TICKET QUANTITY */}
                      <div className="space-y-1">
                        <div id="quantity-label" className="bg-brand-navy text-brand-off-white inline-block px-2 py-0.5 font-bold text-[10px] md:text-xs uppercase tracking-widest">
                          03. HOW MANY PACKAGES?
                        </div>
                        <div className="flex border-4 border-brand-navy bg-brand-off-white shadow-(--shadow-brut-xs) w-fit" role="group" aria-labelledby="quantity-label">
                          <button
                            type="button"
                            aria-label="Decrease quantity"
                            onClick={() => setQuantity(Math.max(1, quantity - 1))}
                            className="w-10 h-10 border-r-4 border-brand-navy font-display text-lg hover:bg-brand-accent hover:text-brand-navy transition-colors flex items-center justify-center cursor-pointer"
                          >
                            -
                          </button>
                          <span
                            className="w-12 h-10 flex items-center justify-center font-display text-xl bg-brand-bg text-brand-navy"
                            aria-live="polite"
                            aria-atomic="true"
                          >
                            {quantity}
                          </span>
                          <button
                            type="button"
                            aria-label="Increase quantity"
                            onClick={() => setQuantity(Math.min(10, quantity + 1))}
                            className="w-10 h-10 border-l-4 border-brand-navy font-display text-lg hover:bg-brand-accent hover:text-brand-navy transition-colors flex items-center justify-center cursor-pointer"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* RIGHT COLUMN: Phone Number & Total */}
                    <div className="space-y-2 md:space-y-3 flex flex-col">
                      {/* STEP 4: M-PESA NUMBER */}
                      <div className="space-y-1">
                        <label htmlFor="mpesa-number" className="bg-brand-navy text-brand-off-white inline-block px-2 py-0.5 font-bold text-[10px] md:text-xs uppercase tracking-widest">
                          04. M-PESA NUMBER
                        </label>
                        <div className="relative flex items-stretch">
                          <div className="flex items-center justify-center px-3 border-4 border-r-0 border-brand-navy bg-brand-navy text-brand-off-white pointer-events-none">
                            <Phone className="h-4 w-4" />
                          </div>
                          <input
                            ref={phoneInputRef}
                            id="mpesa-number"
                            name="phoneNumber"
                            type="text"
                            inputMode="tel"
                            autoComplete="tel"
                            required
                            aria-describedby="mpesa-hint"
                            placeholder="0712 345 678"
                            value={phoneNumber}
                            onChange={(e) => setPhoneNumber(e.target.value)}
                            className="block w-full px-3 py-2 border-4 border-brand-navy bg-brand-off-white font-mono text-xs md:text-sm uppercase placeholder-brand-navy/30 focus:outline-none focus:bg-brand-accent/10 focus:shadow-(--shadow-brut-sm) transition-all text-brand-navy"
                          />
                        </div>
                        {!showWhatsAppField && (
                          <p id="mpesa-hint" className="text-[10px] text-brand-navy/80 font-mono uppercase bg-brand-navy/5 px-2.5 py-1 border-l-4 border-brand-accent">
                            {totalPrice === 0 ? "Ticket PDF dispatched to WhatsApp." : "Enter PIN on phone. Ticket sent via WhatsApp."}
                          </p>
                        )}

                        {!showWhatsAppField ? (
                          <button
                            type="button"
                            onClick={() => setShowWhatsAppField(true)}
                            className="w-full flex items-center gap-1.5 border-2 border-dashed border-brand-navy/40 bg-brand-off-white/50 px-2.5 py-1.5 hover:border-brand-navy hover:bg-brand-accent/10 transition-colors group cursor-pointer"
                          >
                            <svg aria-hidden="true" className="w-3.5 h-3.5 shrink-0 text-brand-navy/40 group-hover:text-brand-navy transition-colors" fill="currentColor" viewBox="0 0 24 24"><path d="M12.031 0C5.385 0 0 5.385 0 12.031c0 2.127.551 4.2 1.597 6.03L.085 23.593l5.688-1.492A11.968 11.968 0 0012.03 24c6.646 0 12.031-5.385 12.031-12.031S18.677 0 12.031 0zm3.847 17.338c-.161.455-.935.882-1.32.936-.364.051-.834.128-2.69-.64-2.242-.927-3.666-3.21-3.774-3.354-.108-.144-.898-1.196-.898-2.28s.57-1.616.772-1.834c.202-.218.441-.272.585-.272.144 0 .288.001.411.006.132.006.311-.052.478.35.176.425.594 1.45.646 1.554.052.104.088.227.016.371-.072.144-.108.234-.216.353-.108.119-.228.257-.323.337-.104.088-.213.185-.094.39.119.205.529.873 1.134 1.412.782.697 1.442.915 1.647 1.019.205.104.323.088.446-.052.119-.14.515-.596.653-.802.138-.206.275-.171.464-.104.189.067 1.194.563 1.399.667.205.104.341.155.394.243.053.088.053.513-.108.968z"/></svg>
                            <span className="text-[10px] font-black uppercase tracking-wider text-brand-navy/60 group-hover:text-brand-navy transition-colors">
                              Different WhatsApp number?
                            </span>
                            <ArrowRight className="w-3 h-3 ml-auto shrink-0 text-brand-navy/40 group-hover:text-brand-navy transition-colors" />
                          </button>
                        ) : (
                          <div className="border-2 border-brand-navy bg-brand-off-white">
                            <div className="flex items-stretch">
                              <div className="flex items-center justify-center px-2.5 border-r-2 border-brand-navy bg-brand-navy text-brand-off-white pointer-events-none">
                                <svg aria-hidden="true" className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M12.031 0C5.385 0 0 5.385 0 12.031c0 2.127.551 4.2 1.597 6.03L.085 23.593l5.688-1.492A11.968 11.968 0 0012.03 24c6.646 0 12.031-5.385 12.031-12.031S18.677 0 12.031 0z"/></svg>
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
                                className="flex-1 min-w-0 px-2.5 py-1.5 font-mono text-[11px] uppercase placeholder-brand-navy/30 focus:outline-none focus:bg-brand-accent/5 text-brand-navy border-0"
                              />
                              <button
                                type="button"
                                onClick={() => { setShowWhatsAppField(false); setWhatsappNumber(""); }}
                                aria-label="Remove WhatsApp number"
                                className="px-2.5 border-l-2 border-brand-navy bg-brand-off-white text-brand-navy/30 hover:text-brand-accent hover:bg-brand-accent/5 transition-colors font-mono text-xs font-bold"
                              >
                                X
                              </button>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* TOTAL RECEIPT BLOCK */}
                      <div className="mt-auto px-2.5 py-1.5 md:px-3 md:py-2 border-4 border-brand-navy bg-brand-navy text-brand-off-white shadow-(--shadow-brut-xs-accent) md:shadow-(--shadow-brut-sm-accent) flex items-center justify-between">
                        <span className="text-[10px] font-mono uppercase opacity-70">TOTAL DUE</span>
                        <span className="font-display text-lg md:text-2xl leading-none block text-brand-accent">
                          {totalPrice === 0 ? "KES 0 (FREE)" : `KES ${totalPrice.toLocaleString()}`}
                        </span>
                      </div>
                    </div>
                  </div>

                  {paystackEnabled && totalPrice > 0 && (
                    <div className="grid grid-cols-2 gap-2 my-2" role="radiogroup" aria-label="Payment method">
                      <button
                        type="button"
                        role="radio"
                        aria-checked={paymentProvider === "payhero"}
                        onClick={() => setPaymentProvider("payhero")}
                        className={`py-2 px-2 border-2 border-brand-navy font-mono text-[11px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
                          paymentProvider === "payhero"
                            ? "bg-brand-navy text-brand-accent shadow-(--shadow-brut-xs-accent)"
                            : "bg-brand-off-white text-brand-navy/60 hover:text-brand-navy hover:bg-brand-accent/10"
                        }`}
                      >
                        PAY WITH M-PESA
                      </button>
                      <button
                        type="button"
                        role="radio"
                        aria-checked={paymentProvider === "paystack"}
                        onClick={() => setPaymentProvider("paystack")}
                        className={`py-2 px-2 border-2 border-brand-navy font-mono text-[11px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
                          paymentProvider === "paystack"
                            ? "bg-brand-navy text-brand-accent shadow-(--shadow-brut-xs-accent)"
                            : "bg-brand-off-white text-brand-navy/60 hover:text-brand-navy hover:bg-brand-accent/10"
                        }`}
                      >
                        PAYSTACK
                      </button>
                    </div>
                  )}

                  {/* ACTION SUBMIT BUTTON */}
                  <button
                    type="submit"
                    disabled={loading}
                    className={`w-full py-3 sm:py-3.5 md:py-4 border-4 border-brand-navy font-display text-lg sm:text-xl md:text-2xl uppercase tracking-widest flex items-center justify-center gap-2 md:gap-3 transition-all duration-100 mt-2 cursor-pointer ${
                      loading 
                        ? "bg-brand-bg text-brand-navy/30 cursor-not-allowed shadow-none" 
                        : "bg-brand-accent text-brand-navy hover:bg-brand-off-white shadow-(--shadow-brut-sm) md:shadow-(--shadow-brut-xl-soft) active:translate-y-[4px] md:active:translate-y-[8px] active:translate-x-[4px] md:active:translate-x-[8px] active:shadow-none"
                    }`}
                  >
                    {loading ? (
                      <>
                        <div className="animate-spin border-4 border-brand-navy border-t-transparent w-5 h-5" />
                        PROCESSING...
                      </>
                    ) : totalPrice === 0 ? (
                      <>
                        <TicketIcon className="w-6 h-6" />
                        RSVP FREE ENTRY PASS
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
                  <p className="text-[10px] text-center font-mono uppercase text-brand-navy/60 mt-1 flex items-center justify-center gap-1.5 select-none">
                    <ShieldCheck className="w-3.5 h-3.5 text-brand-navy/60 shrink-0" strokeWidth={2.5} />
                    <span>{totalPrice === 0 ? "INSTANT PASS ISSUED DIRECTLY TO WHATSAPP." : "AN INSTANT M-PESA PIN PROMPT WILL BE SENT."}</span>
                  </p>

                  {/* Manual Till Payment Alternative */}
                  {totalPrice > 0 && eventDetails?.till_number && (
                    <div className="mt-2.5 p-3 border-4 border-brand-navy bg-brand-accent/5 shadow-(--shadow-brut-sm) flex flex-col gap-2">
                      <p className="text-[10px] font-black uppercase text-brand-navy tracking-wider text-center select-none">
                        Prefer manual M-Pesa Till payment?
                      </p>
                      
                      <div className="grid grid-cols-2 gap-2">
                        {/* Till Box */}
                        <div className="p-2 border-2 border-brand-navy bg-brand-off-white flex flex-col justify-between items-center text-center">
                          <span className="text-[10px] font-mono font-bold uppercase text-brand-navy/60 select-none">TILL NUMBER</span>
                          <span className="text-base font-display text-brand-navy font-bold leading-none my-1 select-all">
                            {eventDetails.till_number}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(eventDetails.till_number);
                              setCopiedTill(true);
                              setTimeout(() => setCopiedTill(false), 2000);
                            }}
                            className="mt-1 w-full py-2 border border-brand-navy bg-brand-accent text-brand-navy font-mono text-[10px] font-bold uppercase hover:bg-brand-navy hover:text-brand-off-white transition-all flex items-center justify-center gap-1 cursor-pointer"
                          >
                            {copiedTill ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                            {copiedTill ? "COPIED!" : "COPY TILL"}
                          </button>
                        </div>

                        {/* Amount Box */}
                        <div className="p-2 border-2 border-brand-navy bg-brand-off-white flex flex-col justify-between items-center text-center">
                          <span className="text-[10px] font-mono font-bold uppercase text-brand-navy/60 select-none">AMOUNT</span>
                          <span className="text-base font-display text-brand-navy font-bold leading-none my-1 select-all">
                            KES {totalPrice}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(totalPrice.toString());
                              setCopiedAmount(true);
                              setTimeout(() => setCopiedAmount(false), 2000);
                            }}
                            className="mt-1 w-full py-2 border border-brand-navy bg-brand-accent text-brand-navy font-mono text-[10px] font-bold uppercase hover:bg-brand-navy hover:text-brand-off-white transition-all flex items-center justify-center gap-1 cursor-pointer"
                          >
                            {copiedAmount ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                            {copiedAmount ? "COPIED!" : "COPY AMOUNT"}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </form>

                {/* PAYMENT STATUS DISPLAY */}
                {statusMessage && (
                  <div ref={statusRef} role="status" aria-live="polite" className="mt-6 p-4 border-4 border-brand-navy bg-brand-off-white shadow-(--shadow-brut-sm-strong)">
                    <span className="text-brand-accent font-display text-lg uppercase block mb-1">STATUS UPDATE</span>
                    <p className="font-mono text-xs text-brand-navy uppercase leading-relaxed">{statusMessage}</p>

                    {pollingTimedOut && stxReference && !generatedTicketId && (
                      <div className="mt-3 pt-3 border-t-2 border-brand-navy/20 space-y-2">
                        <div className={`flex items-start gap-2 ${statusMessage.toLowerCase().includes("failed") ? "text-brand-accent" : "text-brand-navy-light"}`}>
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
                          className="w-full py-2.5 border-2 border-brand-navy bg-brand-navy text-brand-off-white font-bold text-xs font-mono uppercase hover:bg-brand-accent hover:text-brand-navy transition-colors disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
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
                      className="mt-6 p-4 md:p-6 border-4 border-brand-navy bg-brand-navy text-brand-off-white shadow-(--shadow-brut-xl-accent)"
                    >
                      <button 
                        onClick={() => setIsVaultOpen(!isVaultOpen)}
                        className="w-full flex items-center justify-between border-b-2 border-brand-off-white/20 pb-3 mb-4 cursor-pointer hover:opacity-80 transition-opacity"
                      >
                        <div className="flex items-center gap-3">
                          <span className="font-display text-2xl md:text-3xl uppercase pt-1 text-brand-accent">
                            YOU ARE IN!
                          </span>
                        </div>
                        <div className="text-brand-accent">
                          {isVaultOpen ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
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
                            <div className="space-y-4 pb-2">
                              <p className="text-xs font-mono uppercase leading-relaxed opacity-90">
                                YOUR TICKET(S) ARE READY. DOWNLOAD BELOW OR CHECK YOUR WHATSAPP.
                              </p>

                              <div className="space-y-3 pt-1">
                                {myTickets.map(ticketId => {
                                  const details = ticketDetailsMap[ticketId];
                                  const tierName = details?.ticket_type || selectedTierObj?.name || "Ticket";
                                  const evTitle = eventDetails.title || "GOODLIFE";
                                  const evVenue = eventDetails.venue || "MARARA CAMP, THIKA";
                                  const shareUrl = typeof window !== "undefined" ? window.location.origin : "https://goodlife.smwhr.space";
                                  const dynamicShareMsg = `Just secured my ${tierName} pass to ${evTitle} at ${evVenue}! Grab yours before tickets sell out: ${shareUrl}`;

                                  return (
                                    <div key={ticketId} className="border-2 border-brand-off-white/20 p-3 space-y-2 bg-brand-navy/50">
                                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-1 border-b-2 border-brand-off-white/10 pb-2 mb-2">
                                        <div>
                                          <p className="text-[10px] font-mono uppercase text-brand-accent mb-0.5">
                                            PASS ID: <span className="font-bold text-brand-off-white ml-1">{ticketId}</span>
                                          </p>
                                          {details && (
                                            <p className="text-lg font-display uppercase text-brand-off-white leading-none mt-1">
                                              {details.ticket_type}
                                            </p>
                                          )}
                                        </div>
                                        {details && (
                                          <div className="text-left sm:text-right mt-1 sm:mt-0">
                                            <p className="text-[10px] font-mono uppercase text-brand-off-white/70">
                                              ATTENDEE
                                            </p>
                                            <p className="text-xs font-bold text-brand-off-white uppercase">
                                              {details.buyer_name} <span className="text-brand-accent ml-1">KES {details.amount_paid}</span>
                                            </p>
                                          </div>
                                        )}
                                      </div>

                                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                        <a
                                          href={`/api/tickets/${ticketId}/download`}
                                          target="_blank"
                                          rel="noreferrer"
                                          className="w-full py-3 border-2 border-brand-accent bg-brand-accent text-brand-navy font-display text-xl uppercase hover:bg-brand-off-white transition-colors flex items-center justify-center gap-2 shadow-(--shadow-brut-xs)"
                                        >
                                          <Download className="w-5 h-5" strokeWidth={2.5} /> DOWNLOAD PDF
                                        </a>
                                        <a
                                          href={`https://api.whatsapp.com/send?text=${encodeURIComponent(dynamicShareMsg)}`}
                                          target="_blank"
                                          rel="noreferrer"
                                          className="w-full py-3 border-2 border-[#128C7E] bg-[#25D366] text-white font-display text-xl uppercase hover:brightness-110 transition-all flex items-center justify-center gap-2 shadow-(--shadow-brut-xs)"
                                        >
                                          <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24"><path d="M12.031 0C5.385 0 0 5.385 0 12.031c0 2.127.551 4.2 1.597 6.03L.085 23.593l5.688-1.492A11.968 11.968 0 0012.03 24c6.646 0 12.031-5.385 12.031-12.031S18.677 0 12.031 0zm3.847 17.338c-.161.455-.935.882-1.32.936-.364.051-.834.128-2.69-.64-2.242-.927-3.666-3.21-3.774-3.354-.108-.144-.898-1.196-.898-2.28s.57-1.616.772-1.834c.202-.218.441-.272.585-.272.144 0 .288.001.411.006.132.006.311-.052.478.35.176.425.594 1.45.646 1.554.052.104.088.227.016.371-.072.144-.108.234-.216.353-.108.119-.228.257-.323.337-.104.088-.213.185-.094.39.119.205.529.873 1.134 1.412.782.697 1.442.915 1.647 1.019.205.104.323.088.446-.052.119-.14.515-.596.653-.802.138-.206.275-.171.464-.104.189.067 1.194.563 1.399.667.205.104.341.155.394.243.053.088.053.513-.108.968z"/></svg>
                                          SHARE TO STATUS
                                        </a>
                                      </div>

                                      {/* Permanent URL input */}
                                      <div>
                                        <p className="text-[10px] font-mono uppercase opacity-70 mb-0.5">PERMANENT LINK:</p>
                                        <input 
                                          type="text" 
                                          readOnly 
                                          value={`${typeof window !== 'undefined' ? window.location.origin : ''}/api/tickets/${ticketId}/download`}
                                          className="w-full bg-transparent border border-brand-off-white/40 text-brand-off-white text-[10px] font-mono p-1.5 outline-none focus:border-brand-accent"
                                          onClick={(e) => {
                                            (e.target as HTMLInputElement).select();
                                            navigator.clipboard.writeText((e.target as HTMLInputElement).value);
                                          }}
                                        />
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </section>

        </main>

        <footer className="w-full text-center pb-6 pt-6 border-t-4 border-brand-navy mt-4">
          <p className="font-display text-xl uppercase tracking-widest text-brand-navy">
            © 2026 {eventDetails.title} TICKETING
          </p>
          <p className="font-mono text-[11px] uppercase mt-1 text-brand-navy/60">
            {eventDetails.venue} · STRICTLY 18+ NO OUTSIDE DRINKS
          </p>
          {/* No staff links in the footer. It advertised "Staff & POS Login"
              and "Admin Portal" to every customer on every checkout page, which
              is a worse leak than the header: a footer link reads as routine
              and gets clicked without a second thought. Staff reach both from
              the secret menu, or by going straight to /login. */}
        </footer>
      </div>

      {/* HIGH-CONVERTING MOBILE STICKY ACTION BAR (Thumb Zone) */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-brand-off-white border-t-4 border-brand-navy p-3 shadow-(--shadow-brut-xl-strong) lg:hidden flex items-center justify-between gap-3">
        <div className="flex-1 min-w-0 pr-1">
          <div className="text-[10px] font-mono uppercase text-brand-navy/70 truncate font-bold">
            {selectedTierObj?.name} {quantity > 1 ? `(${quantity}x)` : ""}
          </div>
          <div className="font-display text-xl text-brand-navy leading-none">
            {totalPrice === 0 ? "FREE ENTRY (KES 0)" : `KES ${totalPrice.toLocaleString()}`}
          </div>
        </div>
        <button
          type="button"
          onClick={handleStickyActionClick}
          disabled={loading}
          className="py-2.5 px-4 border-2 border-brand-navy bg-brand-accent text-brand-navy font-display text-base uppercase tracking-wider shadow-(--shadow-brut-xs) active:translate-x-[1px] active:translate-y-[1px] active:shadow-none flex items-center gap-1.5 shrink-0 font-bold cursor-pointer"
        >
          {loading ? (
            "PROCESSING..."
          ) : totalPrice === 0 ? (
            "RSVP FREE PASS"
          ) : (
            <>
              <Image src="/mpesa.svg" alt="M-Pesa" width={38} height={20} className="h-4 w-auto object-contain brightness-0" />
              PAY M-PESA
            </>
          )}
        </button>
      </div>

      {/* FLYER FULL-SIZE LIGHTBOX */}
      <AnimatePresence>
        {isFlyerExpanded && (
          <motion.div 
            className="fixed inset-0 z-[100] flex items-center justify-center bg-brand-navy/95 p-3 md:p-12 cursor-pointer backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-label={`${eventDetails.title} full flyer`}
            onClick={() => setIsFlyerExpanded(false)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <motion.div 
              className="relative w-full h-full max-w-4xl max-h-[92vh] border-4 md:border-8 border-brand-navy shadow-(--shadow-brut-3xl-accent) bg-brand-off-white overflow-hidden cursor-default flex flex-col"
              initial={{ scale: 0.94, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.94, opacity: 0 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header Bar */}
              <div className="flex items-center justify-between border-b-2 border-brand-navy bg-brand-accent p-2 md:p-3 shrink-0">
                <span className="font-display text-sm md:text-lg uppercase text-brand-navy">
                  {eventDetails.title} — OFFICIAL EVENT POSTER
                </span>
                <button
                  type="button"
                  aria-label="Close poster"
                  className="bg-brand-navy text-brand-off-white p-1 hover:bg-brand-off-white hover:text-brand-navy transition-colors border border-brand-navy"
                  onClick={() => setIsFlyerExpanded(false)}
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Poster Content */}
              <div className="relative flex-1 w-full bg-brand-navy overflow-auto">
                {isVideoFlyer ? (
                  <video 
                    src={eventDetails.flyer_url} 
                    autoPlay 
                    controls 
                    loop 
                    playsInline 
                    className="w-full h-full object-contain"
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
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* CAMPING GROUNDS & TENT WALKTHROUGH TOUR LIGHTBOX */}
      <AnimatePresence>
        {showCampTourModal && (
          <motion.div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-brand-navy/95 p-3 md:p-10 cursor-pointer backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-label="Camping Tour & Grounds Walkthrough"
            onClick={() => setShowCampTourModal(false)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="relative w-full max-w-3xl max-h-[90vh] border-4 md:border-8 border-brand-navy bg-brand-off-white shadow-(--shadow-brut-3xl-accent) overflow-y-auto cursor-default"
              initial={{ scale: 0.94, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.94, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Tour Header */}
              <div className="flex items-center justify-between border-b-4 border-brand-navy bg-brand-accent p-3 md:p-4">
                <div className="flex items-center gap-2">
                  <Tent className="w-5 h-5 text-brand-navy" />
                  <span className="font-display text-lg md:text-2xl uppercase text-brand-navy">
                    MARARA CAMP GROUNDS & TENT TOUR
                  </span>
                </div>
                <button
                  type="button"
                  aria-label="Close tour"
                  className="bg-brand-navy text-brand-off-white p-1 hover:bg-brand-off-white hover:text-brand-navy transition-colors border-2 border-brand-navy cursor-pointer"
                  onClick={() => setShowCampTourModal(false)}
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Video Walkthrough Player */}
              <div className="relative aspect-video w-full bg-black border-b-4 border-brand-navy">
                <video
                  src={eventDetails.recap_video_url || "/promo.mp4"}
                  controls
                  autoPlay
                  playsInline
                  className="w-full h-full object-cover"
                />
              </div>

              {/* Camp Specs & Option B Explanation */}
              <div className="p-4 md:p-6 space-y-4">
                <div className="bg-brand-navy text-brand-off-white p-3 border-2 border-brand-accent">
                  <h4 className="font-display text-base md:text-lg uppercase text-brand-accent mb-1">
                    ALL-INCLUSIVE ACCOMMODATION RULES
                  </h4>
                  <p className="font-mono text-xs uppercase leading-relaxed opacity-90">
                    ✦ Every camping package includes full festival entry passes for all guests.<br />
                    ✦ <strong>Private Tents (2PX / 4PX / 6PX)</strong>: Exclusive dome tent with mattresses for your group. Key handed to lead guest at gate.<br />
                    ✦ <strong>Shared 6PX Dorm Beds (1PX)</strong>: Communal dome tent setup with individual mattress. Bed numbers allocated on arrival at gate (Option B first-come, first-served).
                  </p>
                </div>

                {/* Amenity checklist */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 pt-2">
                  <div className="p-2.5 border-2 border-brand-navy bg-brand-bg font-mono text-[11px] font-bold uppercase flex items-center gap-2">
                    <span className="font-bold text-brand-navy">✦</span> Heavy Canvas Tents
                  </div>
                  <div className="p-2.5 border-2 border-brand-navy bg-brand-bg font-mono text-[11px] font-bold uppercase flex items-center gap-2">
                    <span className="font-bold text-brand-navy">✦</span> Foam Mattresses
                  </div>
                  <div className="p-2.5 border-2 border-brand-navy bg-brand-bg font-mono text-[11px] font-bold uppercase flex items-center gap-2">
                    <span className="font-bold text-brand-navy">✦</span> Hot Showers
                  </div>
                  <div className="p-2.5 border-2 border-brand-navy bg-brand-bg font-mono text-[11px] font-bold uppercase flex items-center gap-2">
                    <span className="font-bold text-brand-navy">✦</span> Flush Toilets
                  </div>
                  <div className="p-2.5 border-2 border-brand-navy bg-brand-bg font-mono text-[11px] font-bold uppercase flex items-center gap-2">
                    <span className="font-bold text-brand-navy">✦</span> 24/7 Gate Guard
                  </div>
                  <div className="p-2.5 border-2 border-brand-navy bg-brand-bg font-mono text-[11px] font-bold uppercase flex items-center gap-2">
                    <span className="font-bold text-brand-navy">✦</span> Bonfire Lounge
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setShowCampTourModal(false);
                    setActivePackageTab("camping");
                    document.getElementById("booking-container")?.scrollIntoView({ behavior: "smooth" });
                  }}
                  className="w-full py-3 border-4 border-brand-navy bg-brand-accent text-brand-navy font-display text-xl uppercase hover:bg-brand-navy hover:text-brand-off-white transition-colors text-center shadow-(--shadow-brut-xs) cursor-pointer"
                >
                  CHOOSE A CAMPING PACKAGE &rarr;
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
