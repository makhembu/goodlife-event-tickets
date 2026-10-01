"use client";

import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  Ticket as TicketIcon, 
  Phone, 
  Layers, 
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
  Store,
  Camera,
  Radio,
  Clock,
  Maximize2,
  X,
  Compass,
  BedSingle,
  Users,
  MapPin,
  Navigation
} from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { fetchEventDetails, EventDetails, fetchTicketTiers, TicketTier, Event } from "@/lib/supabase-db";
import confetti from "canvas-confetti";
import { HapticFeedback } from "@/components/ui/haptic-feedback";
import { useEatToday } from "@/hooks/use-eat-today";
import { isHiddenFromSite } from "@/lib/event-availability";
import LiveMiniEventBanner from "@/components/LiveMiniEventBanner";

interface CheckoutClientPageProps {
  initialEventDetails?: EventDetails;
  initialTicketTiers?: TicketTier[];
  availableEvents?: Event[];
  /** Mini festivals that are currently sellable. Rendered as a promo strip so
   *  the one thing a customer *can* buy is advertised even while they are on a
   *  flagship's ticket page. */
  liveMiniEvents?: Event[];
  initialTierParam?: string;
}

export default function TicketCheckoutPage({ 
  initialEventDetails, 
  initialTicketTiers,
  availableEvents = [],
  liveMiniEvents = [],
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
    regulations: "Camp gate opens strictly at noon. Carry your PDF ticket or phone download for scanning. No outside drinks at Marara. Entry is strictly 18+ with original ID verification.",
    maps_url: "https://www.google.com/maps/search/?api=1&query=MARARA+CAMP,+THIKA"
  });

  const directionsUrl = useMemo(() => {
    if (eventDetails.maps_url && eventDetails.maps_url.trim()) return eventDetails.maps_url.trim();
    const query = eventDetails.venue
      ? (eventDetails.venue.toLowerCase().includes("marara") ? "Marara Camp Ventures, Thika" : eventDetails.venue)
      : eventDetails.title;
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
  }, [eventDetails.maps_url, eventDetails.venue, eventDetails.title]);

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
  
  // Manual M-Pesa till accordion. Collapsed by default: the till number is
  // already on the first screen in the venue/till strip, so this is the
  // copy-the-till-and-amount convenience, not the only route to the number.
  // Leaving it open pushed the buy button and total down the page.
  const [tillOpen, setTillOpen] = useState(false);

  // House Rules accordion
  const [rulesOpen, setRulesOpen] = useState(false);
  // Editions picker. A closed trigger costs ~40px on a phone, where the old
  // always-open row of event buttons competed with the poster for the fold.
  const [editionsOpen, setEditionsOpen] = useState(false);

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
  const editionsRef = useRef<HTMLDivElement>(null);

  // Dismiss the editions panel on outside tap or Escape. Both listeners only
  // setState from an event callback, never synchronously from the effect body.
  useEffect(() => {
    if (!editionsOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (editionsRef.current && !editionsRef.current.contains(e.target as Node)) {
        setEditionsOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setEditionsOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [editionsOpen]);
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
            // `isHiddenFromSite` shares `publicState`'s rule, so the switcher
            // can never offer a link that 404s.
            setEventsList(data.filter((e: Event) => !isHiddenFromSite(e)));
          }
        })
        .catch(() => {});
    }
  }, [eventsList.length]);

  // Haptic micro-feedback
  const triggerHaptic = useCallback((pattern: "success" | "confirmation" | "error") => {
    HapticFeedback.trigger(pattern);
  }, []);

  const setError = useCallback((msg: string) => {
    triggerHaptic("error");
    setStatusMessage(msg);
  }, [triggerHaptic]);

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
        custom_schedule_text: targetEvent.custom_schedule_text,
        maps_url: targetEvent.maps_url
      });
      setTicketTiers(tiers);
      
      const hasCamping = tiers.some(t => t.tier_category === 'camping' || t.is_camping_bundle || t.camping_type === 'shared_bed' || t.camping_type === 'private');
      if (!hasCamping) {
        setActivePackageTab("entry");
      }
      if (tiers.length > 0) {
        setSelectedTier(tiers[0].id);
      }
      if (typeof window !== "undefined") {
        window.history.pushState({}, "", `/?event=${targetEvent.id}`);
      }
    } catch (e) {
      console.error("Failed to switch event:", e);
    } finally {
      setLoading(false);
    }
  };

  const isVideoFlyer = eventDetails.flyer_url ? /\.(mp4|webm|ogg|mov|m4v)($|\?)/i.test(eventDetails.flyer_url) || eventDetails.flyer_url.includes("video") : false;

  // "Now" in Kenya EAT, on a 60s heartbeat, re-rendering when the EAT day rolls
  // over so a tab left open overnight stops offering yesterday's tiers. Also
  // supplies the shifted instant that tier windows are compared against — the
  // component itself must not call `Date.now()` during render.
  const eatToday = useEatToday();
  const eatDate = useMemo(() => new Date(eatToday.eatNowMs), [eatToday.eatNowMs]);
  const isWeekend = eatToday.dayOfWeek === 0 || eatToday.dayOfWeek === 6;

  // Is this a recurring mini session rather than the flagship festival?
  //
  // Hoisted out of the `TICKET_TIERS` memo because three separate places need
  // it and they must agree: whether to fall back to the built-in price ladder,
  // which tiers the weekday/weekend rule admits, and which explanation to show
  // when the ladder ends up empty. The title substring is kept from the original
  // check because `category` is nullable on rows created before it was set.
  const isMiniEvent =
    eventDetails.category === "mini" || (eventDetails.title || "").toLowerCase().includes("sunday park");

  // Processed Tiers config with strict time/edition gating
  const TICKET_TIERS = useMemo(() => {
    // Check if today is the event date in EAT
    const isEventDay = eventDetails.event_date
      ? eatToday.dateKey === new Date(eventDetails.event_date).toISOString().slice(0, 10)
      : false;

    // There is no fallback price ladder here, and there never should be.
    //
    // This used to fall back to eight hardcoded tiers for the flagship. It fired
    // for ANY event with no tiers in the DB, so an unconfigured "Park & Chill"
    // rendered 4px group tents at KES 4,000 and a glamping dome at KES 6,000 —
    // passes that event does not sell. The copy had already drifted from the
    // `DEFAULT_POSTER_TIERS` list it was duplicating (different Early Bird
    // price, a non-breaking hyphen in the VIP tier name), which is how two
    // copies of one price list turn into two different price lists.
    //
    // Zero tiers now means zero tiers. `app/page.tsx` routes such an event to
    // the coming-soon page, and if one ever reaches this component anyway the
    // empty-state panel below explains that no passes are on sale rather than
    // inventing a price. An admin sets the prices.
    const rawTiers: any[] = ticketTiers;

    return rawTiers
      .filter((tier: any) => {
        if (tier.hidden) return false;

        const isCamping = tier.tier_category === 'camping' || tier.is_camping_bundle || tier.tag === 'CAMPING';

        // 1. MINI EVENT (e.g. Sunday Park & Chill #12)
        // Rule: Mon-Fri the discounted early RSVP is the offer; Sat-Sun the
        // weekend passes are, and the early RSVP is not offered.
        //
        // "RSVP" is identified by the tier's own label, never by its price.
        // `tier.price === 0` used to be the first term of this test, which made
        // "free" and "early bird" the same idea: repricing the early RSVP from
        // KES 0 to a discounted rate could have flipped this gate by accident,
        // and conversely a genuinely free tier would have been sold at the
        // weekend. An RSVP is a booking window, not a price point.
        if (isMiniEvent) {
          const isRsvp = Boolean(tier.tag?.includes('RSVP') || tier.id?.includes('rsvp') || tier.name?.toLowerCase().includes('rsvp'));
          if (isWeekend) {
            // Weekend: hide the early RSVP, show the weekend passes.
            return !isRsvp;
          }
          // Weekday: the early RSVP only.
          return isRsvp;
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
  }, [ticketTiers, eventDetails, eatDate, eatToday.dateKey, isWeekend, isMiniEvent]);

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
    const price = selectedTierObj?.price ?? 0;
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

    // Guard the empty-ladder case BEFORE anything else.
    //
    // With no tier selected, `selectedTierObj` is undefined and `totalPrice`
    // falls back to 0, which is the exact value the free-RSVP branch below
    // tests for. So a page that had filtered its own tiers down to nothing - a
    // mini festival with only paid passes, viewed on a weekday - would happily
    // POST a free RSVP with an empty `ticket_type` and hand out a ticket for a
    // pass that does not exist. Refuse first, then check the phone number.
    if (TICKET_TIERS.length === 0) {
      triggerHaptic("error");
      setStatusMessage(
        "No passes are on sale for this session right now. Check back on the weekend, or join the waitlist."
      );
      return;
    }

    if (!selectedTierObj || typeof selectedTierObj.price !== "number") {
      setError("Please select a valid ticket tier.");
      return;
    }

    if (!phoneNumber) {
      triggerHaptic("error");
      setStatusMessage("Please enter your phone number.");
      phoneInputRef.current?.focus();
      return;
    }

    setLoading(true);

    /*
     * THE FREE-RSVP PIPELINE THAT USED TO BE HERE IS GONE, AND IT WAS NEVER
     * WORKING.
     *
     * It issued a ticket server-side with no payment whenever the selected tier
     * cost KES 0, so a customer tapping "Pay" on a free pass got a real ticket by
     * WhatsApp without paying. Two things ended it.
     *
     * First, it was broken. The POST sent `ticket_type` while
     * `app/api/tickets/rsvp-free/route.ts` requires `tier_id`, so the route
     * answered 400 "Missing required fields: buyer_name, phone_number,
     * tier_id." That mismatch has been in the file since the route and the call
     * landed in the same commit, so this branch has never once issued a ticket.
     *
     * Second, and the actual reason it should not be restored: there is no free
     * pass. Every tier in the ladder is paid, the early RSVP being a discounted
     * rate rather than a giveaway, so `totalPrice === 0` is no longer a state a
     * customer can reach. Keeping a second, un-metered ticket-issuing path
     * alongside the payment path is a liability regardless: the next KES 0 tier
     * anybody creates would silently bypass M-Pesa, and it would do so through
     * a branch that 400s.
     *
     * If a genuinely free public tier is ever wanted back, it should be
     * deliberate and it should be rate-limited, quota-checked and written
     * through one issuance path shared with paid checkout. Do not restore this
     * block.
     */

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

      {/* Page shell. Widened from max-w-6xl (1152px) on large screens, and
          this is what makes the poster actually grow on a big monitor.

          At 1152px the left column was pinned at 461px no matter how wide the
          window got, so a 2560x1440 display - which had 376px of spare
          vertical space and 1400px of spare horizontal space - showed the
          exact same 405px poster as a 1440px laptop. The poster was sized by
          the COLUMN, so extra pixels went into empty space to the right of
          the booking panel rather than into the artwork.

          A 0.707 portrait poster can only get bigger by getting taller, and
          height is capped by the fold, so widening the column is the only
          lever that can enlarge the poster on a large display at all. It is
          measured against the fold cap on the poster itself: the two are
          coupled, and widening the shell alone would have pushed the poster
          past the fold on mid-size screens.

          Scoped to this page's own shell, not app/layout.tsx, so the admin
          dashboard, POS and scanner are untouched by it. */}
      <div className="relative z-10 max-w-6xl xl:max-w-[1400px] 2xl:max-w-[1680px] mx-auto">
        
        {/* HEADER NAVBAR */}
        {/* HEADER NAVBAR & UNIFIED BROADSHEET RIBBON */}
        <header ref={headerRef} className="w-full border-b-4 border-brand-navy pb-3 mb-3 md:pb-5 md:mb-5 bg-brand-bg flex items-center justify-between gap-3 md:gap-6">
          <div className="flex items-center gap-2 md:gap-4 shrink-0 min-w-0">
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
              <h1 className="font-display text-2xl md:text-4xl lg:text-5xl tracking-wide uppercase text-brand-navy leading-none pt-1">
                {eventDetails.title}
              </h1>
            </button>

            {/* Desktop Unified Metadata Strip */}
            <div className="hidden lg:flex items-center gap-3 ml-2 font-mono text-xs font-bold uppercase tracking-wider text-brand-navy/80">
              <span className="w-2 h-2 border border-brand-navy bg-brand-accent animate-pulse shrink-0" />
              <a
                href={directionsUrl}
                target="_blank"
                rel="noopener noreferrer"
                title={`Get directions to ${eventDetails.venue || "venue"} on Google Maps`}
                className="truncate flex items-center gap-1.5 hover:text-brand-navy hover:underline group text-brand-navy/90 select-none"
              >
                <span className="truncate">{eventDetails.venue || eventDetails.subtitle}</span>
                <span className="text-[10px] font-black uppercase tracking-wider bg-brand-accent text-brand-navy px-1 py-0.5 border border-brand-navy inline-flex items-center gap-0.5 group-hover:bg-brand-navy group-hover:text-brand-accent transition-colors shrink-0 no-underline">
                  <span>📍 MAP</span>
                  <span className="text-[9px]">↗</span>
                </span>
              </a>
              <span className="text-brand-accent font-black">/</span>
              <span className="bg-brand-navy text-brand-accent px-1.5 py-0.5 text-[10px] tracking-widest">{eventDetails.tag}</span>
            </div>
          </div>

          <div className="flex items-center gap-2 md:gap-4 shrink-0 justify-end">
            {/* Desktop Editions Switcher inside Header */}
            {eventsList.length > 1 && (
              <div ref={editionsRef} className="relative hidden md:block">
                <button
                  type="button"
                  onClick={() => setEditionsOpen(o => !o)}
                  aria-expanded={editionsOpen}
                  aria-haspopup="listbox"
                  className="flex items-center gap-2 border-2 border-brand-navy bg-brand-navy text-brand-off-white px-3 py-1.5 shadow-(--shadow-brut-xs) hover:bg-brand-navy/90 active:translate-y-[1px] transition-all cursor-pointer"
                >
                  <span className="font-mono text-[10px] font-black uppercase tracking-widest text-brand-accent">
                    EDITIONS
                  </span>
                  <span className="font-mono text-[10px] font-black uppercase bg-brand-accent text-brand-navy px-1.5 py-0.5 leading-none">
                    {eventsList.length} ▼
                  </span>
                </button>

                <AnimatePresence>
                  {editionsOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: -6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{ duration: 0.15, ease: "easeOut" }}
                      role="listbox"
                      aria-label="Event editions"
                      className="absolute right-0 top-full mt-2 w-72 border-4 border-brand-navy bg-brand-navy shadow-(--shadow-brut-xl-accent) overflow-hidden z-50"
                    >
                      {eventsList.map(evt => {
                        const isCurrent = evt.id === eventDetails.id;
                        return (
                          <button
                            key={evt.id}
                            type="button"
                            role="option"
                            aria-selected={isCurrent}
                            onClick={() => {
                              setEditionsOpen(false);
                              handleSwitchEvent(evt);
                            }}
                            className={`w-full text-left px-4 py-3 flex items-center gap-2 border-b border-brand-off-white/15 last:border-b-0 transition-colors cursor-pointer ${
                              isCurrent
                                ? "bg-brand-accent text-brand-navy"
                                : "text-brand-off-white hover:bg-brand-off-white/10"
                            }`}
                          >
                            <span className="font-display text-base uppercase tracking-wider truncate">
                              {evt.title}
                            </span>
                            {evt.category === 'mini' && (
                              <span className="shrink-0 text-[9px] font-mono font-black uppercase px-1 py-0.5 border border-current">
                                Mini
                              </span>
                            )}
                            {isCurrent && <Check className="w-4 h-4 ml-auto shrink-0" />}
                          </button>
                        );
                      })}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

            {/* PUBLIC NAV — Gallery, Radio */}
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

            <div className="flex items-center gap-1.5 md:gap-3 shrink-0 justify-end">
              {myTickets.length > 0 && (
                <button 
                  onClick={() => document.getElementById("my-tickets-section")?.scrollIntoView({ behavior: "smooth" })}
                  className="text-[11px] md:text-xs font-bold uppercase border-2 border-brand-navy bg-brand-off-white px-2 py-1 md:px-4 md:py-2 text-brand-navy hover:bg-brand-navy hover:text-brand-off-white shadow-(--shadow-brut-xs) md:shadow-(--shadow-brut-sm) active:translate-y-[2px] active:translate-x-[2px] active:shadow-none transition-all whitespace-nowrap"
                >
                  <span className="hidden sm:inline">My Tickets</span><span className="sm:hidden">Tickets</span> ({myTickets.length})
                </button>
              )}
              {isAdmin && (
                <>
                  <Link
                    href="/admin/dashboard"
                    title="Admin Console"
                    aria-label="Admin Console"
                    className="p-1.5 md:px-4 md:py-2 text-[11px] md:text-xs font-bold uppercase border-2 border-brand-navy bg-brand-off-white text-brand-navy hover:bg-brand-navy hover:text-brand-off-white shadow-(--shadow-brut-xs) md:shadow-(--shadow-brut-sm) active:translate-y-[1px] active:translate-x-[1px] active:shadow-none transition-all whitespace-nowrap flex items-center gap-1.5"
                  >
                    <Settings className="w-4 h-4" />
                    <span className="hidden md:inline">Admin</span>
                  </Link>
                  <Link
                    href="/scanner"
                    title="Gate Scanner"
                    aria-label="Gate Scanner"
                    className="p-1.5 md:px-4 md:py-2 text-[11px] md:text-xs font-bold uppercase border-2 border-brand-navy bg-brand-off-white text-brand-navy hover:bg-brand-navy hover:text-brand-off-white shadow-(--shadow-brut-xs) md:shadow-(--shadow-brut-sm) active:translate-y-[1px] active:translate-x-[1px] active:shadow-none transition-all flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <TicketIcon className="w-4 h-4" strokeWidth={2.5} />
                    <span className="hidden md:inline">Scanner</span>
                  </Link>
                  <Link
                    href="/admin/vendors"
                    title="Vendors & Staff"
                    aria-label="Vendors & Staff"
                    className="p-1.5 md:px-3 md:py-2 text-[11px] md:text-xs font-bold uppercase border-2 border-brand-navy bg-brand-accent px-2 py-1 text-brand-navy hover:bg-brand-navy hover:text-brand-off-white shadow-(--shadow-brut-xs) md:shadow-(--shadow-brut-sm) active:translate-y-[1px] active:translate-x-[1px] active:shadow-none transition-all whitespace-nowrap hidden sm:inline-flex items-center gap-1.5"
                  >
                    <Store className="w-4 h-4" />
                    <span className="hidden md:inline">Vendors & Staff</span>
                  </Link>
                </>
              )}
            </div>
          </div>
        </header>

        {/* MOBILE SLIM FESTIVAL WRISTBAND TAPE (Solution 3) */}
        {eventsList.length > 1 && (
          <>
            <div
              onClick={() => {
                const others = eventsList.filter(e => e.id !== eventDetails.id);
                if (others.length === 1) {
                  handleSwitchEvent(others[0]);
                } else {
                  setEditionsOpen(o => !o);
                }
              }}
              className="w-full flex items-center justify-between border-2 border-brand-navy bg-brand-accent text-brand-navy px-3 py-1.5 mb-3 shadow-(--shadow-brut-xs) active:translate-y-[1px] cursor-pointer md:hidden select-none"
            >
              <span className="font-mono text-[9px] font-black uppercase tracking-wider flex items-center gap-1.5 truncate">
                <span>✦</span>
                <span>ALSO LIVE:</span>
                <strong className="underline underline-offset-2">
                  {eventsList.length === 2
                    ? (eventsList.find(e => e.id !== eventDetails.id)?.title || "MORE EDITIONS")
                    : `${eventsList.length - 1} OTHER EDITIONS`}
                </strong>
              </span>
              <span className="font-mono text-[9px] font-black uppercase tracking-wider bg-brand-navy text-brand-accent px-1.5 py-0.5 shrink-0 ml-2">
                {eventsList.length === 2 ? "SWITCH →" : (editionsOpen ? "CLOSE ▲" : "VIEW ▼")}
              </span>
            </div>

            {/* Mobile Drawer (visible when multiple editions and editionsOpen is true) */}
            <AnimatePresence>
              {editionsOpen && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="w-full border-2 border-brand-navy bg-brand-navy p-2 mb-3 shadow-(--shadow-brut-sm) md:hidden overflow-hidden"
                >
                  <div className="font-mono text-[9px] font-black uppercase text-brand-accent mb-1 px-1">
                    SELECT ACTIVE EVENT EDITION:
                  </div>
                  <div className="flex flex-col gap-1">
                    {eventsList.map(evt => {
                      const isCurrent = evt.id === eventDetails.id;
                      return (
                        <button
                          key={evt.id}
                          type="button"
                          onClick={() => {
                            setEditionsOpen(false);
                            handleSwitchEvent(evt);
                          }}
                          className={`w-full text-left px-3 py-2 flex items-center justify-between text-xs font-mono font-bold uppercase border border-brand-navy transition-colors ${
                            isCurrent
                              ? "bg-brand-accent text-brand-navy font-black"
                              : "bg-brand-navy text-brand-off-white hover:bg-brand-off-white/10"
                          }`}
                        >
                          <span className="truncate">{evt.title}</span>
                          {isCurrent ? <span>CURRENT ✓</span> : <span>SWITCH →</span>}
                        </button>
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </>
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

        {/* MINI-FESTIVAL PROMO. Rendered here too, not just on the pages that
            are NOT selling: a customer who just bought a flagship pass is the
            exact person most likely to come back for the cheap Sunday session. */}
        <LiveMiniEventBanner events={liveMiniEvents} />

        <main className="w-full grid grid-cols-1 lg:grid-cols-12 gap-6 md:gap-8 items-start mb-8">

          {/* LEFT COLUMN: HERO FLYER & ADVISORIES (5 cols on lg) */}
          <section className="lg:col-span-5 space-y-4 md:space-y-6">
            
            {/* HERO FLYER MOTIF CARD

                This card carries the fold cap, NOT the poster inside it. That is
                the whole fix for the frame reading as oversized.

                The cap used to sit on the poster with md:mx-auto, so the poster
                shrank to the cap and then centred itself inside a full-width
                card. Whatever the cap left over split into two cream wedges
                that nobody chose: 15px a side at 1440x900, 21px at 1920x1080,
                0 at 2560x1440 where the column binds first. The visible frame
                was 43-49px against a designed 28px (border-4 + p-6), and it
                moved on every resize.

                Applying the cap here instead makes the card hug the artwork, so
                the frame is exactly 28px everywhere and the margin stops
                depending on which constraint happened to win.

                md:box-content is load-bearing and easy to undo by accident.
                Tailwind sets border-box globally, so a plain max-width on this
                card would be measured to the OUTSIDE of the 28px frame and the
                artwork would silently come out 56px smaller than the cap
                allows. content-box measures max-width to the inside, which is
                what makes the artwork land on exactly the cap.

                Deliberately no w-full: a content-box width:100% resolves
                against the column and pushes the frame 56px past it,
                overflowing the grid. Block width:auto already fills the column
                minus the frame, and the cap then trims it. */}
            <div className="border-4 border-brand-navy bg-brand-off-white p-3 md:p-6 relative shadow-(--shadow-brut-sm-strong) md:shadow-(--shadow-brut-xl-soft) md:box-content md:mx-auto md:max-w-[calc(70.7dvh_-_180px)]">
              
              {/* Category / Status badge */}
              <div className="absolute -top-3 -right-3 md:-top-4 md:-right-4 bg-brand-accent text-brand-navy border-2 border-brand-navy px-2 py-0.5 md:px-4 md:py-1 text-[11px] md:text-xs font-black tracking-widest uppercase shadow-(--shadow-brut-xs) md:shadow-(--shadow-brut-sm) rotate-3">
                {eventDetails.category === 'mini' ? 'MINI EVENT' : 'LIVE EVENT'}
              </div>

              <div className="relative flex flex-col md:space-y-4">

                {/* EVENT FLYER CONTAINER
                    The flyer is A-series portrait: measured at 1131x1600 on
                    every current event, i.e. a ratio of exactly 0.707. Two
                    separate bugs came from the box not matching that.

                    1. DESKTOP WAS THROWING 107px AWAY PER SIDE. The old
                       `md:h-[420px]` in a 405px-wide box is a LANDSCAPE box
                       holding a PORTRAIT image, so object-contain fits to
                       height and centres the rest: the poster painted at only
                       294px wide inside a 405px box. It looked "narrow" because
                       it was - a third of the available width was empty gutter
                       that no amount of widening the column would recover.
                       `md:aspect-[707/1000]` makes the box the same shape as the
                       artwork, so the poster now fills the full column width.

                    2. object-contain is kept as the guarantee. contain NEVER
                       crops, so if a future flyer is a different shape the worst
                       case is a little letterboxing - never a hidden headline or
                       a cut-off price. The hard-coded ratio is an optimisation,
                       not a safety mechanism; the safety is contain.

                    3. SIZED FROM THE FOLD, NOT THE VIEWPORT. The old cap was
                       `md:max-h-[68dvh]`, which is a bug in disguise: 68dvh
                       measures the viewport from the top of the window, but
                       the poster does not start at the top of the window. It
                       starts 219px down (nav 115, EDITIONS bar 67, main 24,
                       card padding 24). So the cap was comparing the poster's
                       height against space that 219px of chrome had already
                       spent, and the poster overflowed the fold by 101px on a
                       1440x900 screen and landed with exactly 0px to spare on
                       1920x1080. Any extra chrome and it clipped.

                       The cap is now a WIDTH cap derived from the height that
                       is actually left over, because width is what the column
                       binds on and the ratio turns width into height for us:

                         width = (100dvh - 219px offset - margin) * 0.707
                               = 70.7dvh - 180px

                       Written as calc(70.7dvh - 180px) and applied as max-w.
                       Underscores are Tailwind's escape for the spaces calc()
                       requires around the minus sign - without them the whole
                       declaration is invalid and the card silently reverts to
                       the full column, which is the bug this replaces.

                       This makes the fold guarantee hold at EVERY desktop
                       height. The cap itself lives on the CARD, one level up,
                       so that the frame stays a constant 28px - see the note
                       on the card. Applying it here instead was correct for the
                       fold and wrong for the frame.

                       The honest trade: on a short screen fitting the poster
                       above the fold caps it at ~371px wide, versus ~405px if
                       you allow a 20px scroll. Big poster and no scrolling are
                       genuinely exclusive on a 900px-tall screen - 780px of
                       viewport minus 219px of chrome leaves 561px, and 0.707
                       of that is 396px. Fitting was chosen because the scroll
                       was the thing that was complained about, and 371px is
                       still wider than the 294px that started all this. */}
                {/* w-full with no cap and no mx-auto on purpose. The card above
                    now owns the width constraint, so the poster just fills the
                    frame it is given. Re-adding a cap here is what produced
                    the drifting cream margin - the poster must be allowed to
                    take the full interior or the frame stops being constant. */}
                <div className="relative w-full max-md:aspect-[390/551] max-md:max-h-[52dvh] md:aspect-[707/1000] border-2 border-brand-navy shadow-(--shadow-brut-sm-strong) overflow-hidden bg-brand-off-white group mt-0 md:my-3">
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
                    {/* REMOVED: the top gradient (absolute, h-24 md:h-32, from
                        brand-off-white to transparent). It existed to fade the
                        title card into the top of the artwork. With the card
                        moved up into the identity bar it had nothing left to
                        blend with, and was just a 128px cream veil over the
                        top 30% of the poster - which is where the date and the
                        top ticket name live. */}

                    {/* Mobile zoom affordance. The poster itself is the button -
                        this badge is decoration pointing at the whole thing, not a
                        second control, so it stays a div (nesting a button inside
                        the poster button would be invalid HTML) and stays
                        aria-hidden because the button already announces itself.
                        Icon-only now: the "FULL POSTER" words were a second,
                        longer way of saying "tap me" about a 326px target. */}
                    <div
                      aria-hidden="true"
                      className="absolute bottom-2 right-2 z-20 md:hidden w-9 h-9 bg-brand-navy text-brand-accent border-2 border-brand-accent flex items-center justify-center shadow-(--shadow-brut-xs)"
                    >
                      <Maximize2 className="w-4 h-4" />
                    </div>

                  </button>
                </div>
                {/*
                  IDENTITY BAR - the title card used to sit ON TOP of the poster
                  as an absolutely positioned overlay, and the marquee ticker was
                  pinned across the bottom 24px of the artwork, so a 420px-tall
                  poster was covered top and bottom. A cream gradient was also
                  veiling the top third. The poster is the reason anyone is on
                  this page, so it now runs edge to edge with nothing on it, and
                  these facts sit under it on desktop where they get their own
                  space instead of stealing the image's.

                  The LIVE EVENT / MINI EVENT badge is deliberately NOT counted
                  here: it is positioned against this card's corner, outside the
                  poster box, so it never covered the artwork.

                  The title is kept (not dropped) because it is the h1, it comes
                  from the database rather than the artwork, and the poster text
                  is not selectable or translatable. It is simply no longer
                  fighting the image for the same pixels.

                  MOBILE KEEPS THE OLD OVERLAY, and that is deliberate. Stacking
                  this bar above the poster on a phone cost 79px of height and
                  pushed the first price from y=1039 to y=1118, because on mobile
                  the poster is already capped at 52dvh and every pixel the
                  title stops covering is a pixel of buy button pushed down.
                  Desktop is where the poster was too small and too busy;
                  mobile was accepted as-is, so max-md: puts this back on top of
                  the artwork exactly as it was.

                  WHY IT MOVED BELOW THE POSTER (desktop), when it had only just
                  been moved above it. Sitting above, the bar cost 128px of the
                  column before the artwork even started - nav 115 + EDITIONS 67
                  + main 24 + card padding 24 + bar 100 + gap 8 - which is what
                  made the whole poster need scrolling. The two options were:

                    - move it into the right column, above the tier list
                    - move it down, here, in the same column

                  The right column was rejected because that section is
                  `lg:sticky` and the booking panel inside it is itself an
                  overflow-y-auto box capped at
                  `calc(100dvh - headerBottom - 48px)`. Adding 100px above that
                  box eats directly into the panel's own scroll area on
                  exactly the short screens where the poster needs the help. It
                  would have fixed the poster by making the checkout form worse.

                  Dropping it below gets the same 128px back with none of that,
                  and it puts the poster first - the hero is the artwork, and
                  the title is metadata about it. The h1 stays first in DOM
                  order in earlier revisions of this file's history but is now
                  after the poster in source order, matching what is painted;
                  CSS `order` was rejected because it desynchronises DOM order
                  from visual order for screen readers.

                  The mobile overlay survives the move without any extra work:
                  the bar is max-md:absolute and its containing block is the
                  parent `relative flex flex-col` div, not the poster. Absolute
                  positioning lifts it out of flow wherever it sits in the DOM,
                  and top-2/left-2 land it on the poster's top-left corner
                  because the poster is that parent's first in-flow child. */}
                <div className="relative z-10 flex flex-col gap-2 max-md:absolute max-md:top-2 max-md:left-2 max-md:w-fit max-md:max-w-[90%] max-md:bg-brand-off-white/95 max-md:backdrop-blur-sm max-md:border-2 max-md:border-brand-navy max-md:p-2 max-md:shadow-(--shadow-brut-sm) max-md:pointer-events-none md:hidden">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <span className="text-[11px] md:text-xs font-black tracking-widest text-brand-navy uppercase block bg-brand-navy text-brand-off-white w-fit px-2 py-0.5 mb-1.5">
                        {eventDetails.tag}
                      </span>
                      <h1 className="text-3xl sm:text-4xl md:text-5xl font-display uppercase text-brand-navy leading-none">
                        {eventDetails.title}
                      </h1>
                      <p className="text-[11px] md:text-sm font-bold uppercase tracking-widest text-brand-navy mt-1.5 flex items-center gap-1.5 md:gap-2">
                        <span className="w-2 h-2 md:w-3 md:h-3 border-2 border-brand-navy bg-brand-accent animate-pulse shrink-0" />
                        <span className="truncate">{eventDetails.subtitle}</span>
                      </p>
                    </div>
                  </div>
                  {eventDetails.custom_schedule_text ? (
                    <div className="inline-flex w-fit items-center gap-1.5 px-2 py-0.5 border border-brand-navy bg-brand-navy text-brand-accent text-[9px] md:text-[11px] font-mono font-bold uppercase tracking-wider">
                      <Clock className="w-3 h-3 text-brand-accent shrink-0" />
                      <span>{eventDetails.custom_schedule_text}</span>
                    </div>
                  ) : eventDetails.recurrence_pattern && eventDetails.recurrence_pattern !== 'none' ? (
                    <div className="inline-flex w-fit items-center gap-1.5 px-2 py-0.5 border border-brand-navy bg-brand-navy text-brand-accent text-[9px] md:text-[11px] font-mono font-bold uppercase tracking-wider">
                      <Clock className="w-3 h-3 text-brand-accent shrink-0" />
                      <span>EVERY {eventDetails.recurrence_day?.toUpperCase()} | {eventDetails.recurrence_time}</span>
                    </div>
                  ) : null}
                </div>

                {/* Ticker - hidden on desktop since the unified broadsheet ribbon owns the event facts */}
                <div className="w-full h-6 bg-brand-accent border-2 border-brand-navy overflow-hidden hidden items-center">
                  <div className="flex animate-marquee whitespace-nowrap font-display text-lg tracking-wider text-brand-navy pt-0.5">
                    <span className="pr-4">{eventDetails.ticker_text || "NO ENTRY WITHOUT VALIDATION ✦ STRICTLY 18+ ✦ "}</span>
                    <span className="pr-4">{eventDetails.ticker_text || "NO ENTRY WITHOUT VALIDATION ✦ STRICTLY 18+ ✦ "}</span>
                  </div>
                </div>

                {/* Venue / Till details - mobile only, desktop has them in the header ribbon */}
                <div className="grid grid-cols-2 gap-3 text-xs font-black uppercase pt-1 max-md:grid md:hidden">
                  <a
                    href={directionsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => HapticFeedback.trigger("confirmation")}
                    aria-label={`Get directions to ${eventDetails.venue} on Google Maps`}
                    className="bg-brand-off-white p-3 border-2 border-brand-navy shadow-(--shadow-brut-sm-strong) min-w-0 group flex flex-col justify-between active:translate-y-[1px] active:shadow-none transition-all cursor-pointer select-none no-underline"
                  >
                    <div>
                      <div className="flex items-center justify-between border-b border-brand-navy pb-1 mb-1.5 font-mono">
                        <span className="text-[10px] text-brand-navy font-bold">LOCATION</span>
                        <span className="text-[9px] font-black uppercase tracking-wider bg-brand-accent text-brand-navy px-1 py-0.5 border border-brand-navy flex items-center gap-0.5 group-hover:bg-brand-navy group-hover:text-brand-accent transition-colors">
                          <span>📍 MAP</span>
                          <span className="text-[8px]">↗</span>
                        </span>
                      </div>
                      <span className="text-brand-navy block text-[11px] md:text-xs leading-tight break-words font-black group-hover:underline">
                        {eventDetails.venue}
                      </span>
                    </div>
                    <span className="text-[9px] font-mono font-bold tracking-wider text-brand-navy/70 group-hover:text-brand-navy flex items-center gap-1 mt-2">
                      <span>TAP FOR DIRECTIONS</span>
                      <span>→</span>
                    </span>
                  </a>
                  <div className="bg-brand-accent p-3 border-2 border-brand-navy shadow-(--shadow-brut-sm-strong) min-w-0 flex flex-col justify-between">
                    <div>
                      <span className="block text-[10px] text-brand-navy border-b border-brand-navy pb-1 mb-1.5 font-mono font-bold">PAYMENT TILL</span>
                      <span className="text-brand-navy block text-sm md:text-base font-display break-all">#{eventDetails.till_number}</span>
                    </div>
                    <span className="text-[9px] font-mono font-bold tracking-wider text-brand-navy/60 block mt-2">
                      INSTANT STK PUSH
                    </span>
                  </div>
                </div>

                {/* Desktop gallery caption */}
                <div className="hidden md:flex items-center justify-between pt-2.5 border-t-2 border-brand-navy mt-2.5 font-mono text-[10px] font-bold tracking-widest uppercase text-brand-navy">
                  <span>{eventDetails.title} ✦ OFFICIAL POSTER</span>
                  <span className="text-brand-navy/60">EDITION {eventDetails.id < 10 ? `0${eventDetails.id}` : eventDetails.id}</span>
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

                {/*
                  REMOVED: the camping discovery zone that used to sit here - the
                  "ALL-INCLUSIVE" entry callout, the "CAMP GROUNDS STATUS: 82%
                  BOOKED / ONLY 4 TENTS & 3 BEDS LEFT" ticker, and the walkthrough
                  trigger.

                  The occupancy numbers were hardcoded strings, not derived from
                  anything: they claimed 82% booked with 4 tents and 3 beds left
                  regardless of actual sales, so they were a claim the site could
                  not stand behind. Removing them rather than wiring them to real
                  inventory was the request; nothing replaces them, and the
                  camping tiers themselves are untouched below.
                */}

                <form ref={formRef} onSubmit={handleCheckout} className="space-y-3 md:space-y-3.5">
                  
                  {/* TIER SELECTION GRID */}
                  <div className="space-y-1.5 md:space-y-2">
                    <div className="bg-brand-navy text-brand-off-white inline-block px-2.5 py-0.5 font-bold text-[11px] md:text-xs uppercase tracking-widest">
                      01. SELECT {activePackageTab === "camping" ? "CAMPING PACKAGE" : "PASS TYPE"}
                    </div>
                    
                    {/* NO PASSES TODAY.
                        Reachable even though `app/page.tsx` routes a zero-tier
                        event away from checkout: the mini-festival ladder itself
                        filters to nothing. A mini with only paid passes, viewed
                        on a weekday, shows zero tiers - the weekday rule admits
                        only the free RSVP. Previously that rendered an empty
                        radiogroup with a live Pay button below it, and because
                        `totalPrice` falls back to 0 when nothing is selected,
                        pressing Pay POSTed a free RSVP with an empty
                        `ticket_type`. `handleCheckout` now refuses first; this
                        is the matching explanation on screen. */}
                    {displayedTiers.length === 0 ? (
                      <div
                        role="status"
                        className="border-4 border-dashed border-brand-navy bg-brand-off-white p-5 md:p-7 text-center"
                      >
                        <p className="font-display text-xl md:text-2xl uppercase tracking-wider text-brand-navy mb-2">
                          No passes on sale right now
                        </p>
                        <p className="font-mono text-xs md:text-sm text-brand-navy/75 leading-relaxed max-w-md mx-auto">
                          {isMiniEvent
                            ? "This session sells the discounted early RSVP on weekdays and the full passes at the weekend. Check back on Saturday, or tap Notify Me above and we&apos;ll ping you."
                            : "Every pass for this edition is either sold out or not yet released. Check back shortly, or tap Notify Me and we&apos;ll tell you the moment more open up."}
                        </p>
                      </div>
                    ) : (
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
                    )}
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

                  {/* Manual Till Payment Alternative - collapsed accordion.
                      The till number itself is already shown in the venue/till
                      strip near the top, so nothing is hidden by closing this. */}
                  {totalPrice > 0 && eventDetails?.till_number && (
                    <div className="mt-2.5 border-4 border-brand-navy bg-brand-accent/5 shadow-(--shadow-brut-sm)">
                      <button
                        type="button"
                        onClick={() => setTillOpen((v) => !v)}
                        aria-expanded={tillOpen}
                        aria-controls="till-payment-panel"
                        className="w-full p-2.5 flex items-center justify-between gap-2 cursor-pointer hover:bg-brand-accent/15 transition-colors"
                      >
                        <span className="text-[10px] font-black uppercase text-brand-navy tracking-wider text-left select-none">
                          Prefer manual M-Pesa Till payment?
                        </span>
                        <span
                          className={`shrink-0 transition-transform duration-200 ${tillOpen ? "rotate-180" : ""}`}
                          aria-hidden="true"
                        >
                          <ChevronDown className="w-4 h-4 text-brand-navy" />
                        </span>
                      </button>

                      {tillOpen && (
                        <div id="till-payment-panel" className="p-3 pt-0 flex flex-col gap-2">
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

                                      <a
                                        href={directionsUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="w-full py-2.5 border-2 border-brand-accent/60 bg-brand-navy text-brand-accent font-display text-lg uppercase hover:bg-brand-accent hover:text-brand-navy transition-all flex items-center justify-center gap-2 shadow-(--shadow-brut-xs)"
                                      >
                                        <MapPin className="w-4 h-4 shrink-0" /> GET DIRECTIONS TO VENUE ↗
                                      </a>

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

      {/*
        REMOVED: the "CAMP GROUNDS & TENT WALKTHROUGH" lightbox that used to
        live here - a video player plus a hardcoded camp-amenities panel.

        It was unreachable. Its only trigger was the walkthrough button in the
        camping discovery zone, removed when that zone (the ALL-INCLUSIVE
        callout and the "82% BOOKED" ticker) was cut, leaving
        `showCampTourModal` permanently false. Unreachable UI is worse than no
        UI: untested, unmaintained code that still has to typecheck.
      */}
    </div>
  );
}
