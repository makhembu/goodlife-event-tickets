import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { fetchActiveEvent, fetchEventDetails, fetchTicketTiers, fetchAllEvents, getEventById, isEventSellable } from "@/lib/supabase-db";
import { publicState, canonicalStatus, isHiddenFromSite } from "@/lib/event-availability";
import TicketCheckoutPage from "./CheckoutClientPage";
import ClosedEventClientPage from "./ClosedEventClientPage";
import ScheduledEventClientPage from "./ScheduledEventClientPage";

export const dynamic = "force-dynamic";

/**
 * Page-level metadata, so `/?event=3` is titled for event 3.
 *
 * `app/layout.tsx` sets the site-wide defaults from the `event_details`
 * singleton, which describes whichever event is currently featured — GOODLIFE 4
 * at the time of writing. It cannot know about `?event=`, so every edition in
 * the switcher inherited the featured event's title, venue and OG image. A
 * visitor who tapped "SUNDAY PARK & CHILL" from the Facebook ad saw a tab
 * reading "GOODLIFE 4 - MARARA CAMP, THIKA | NOV 7" above Park & Chill content,
 * and shared links carried the wrong event to WhatsApp.
 *
 * The layout template is `%s | GOODLIFE 4`, so a child that supplies `title` as
 * a string gets the featured event's name appended. Overriding the whole object
 * here is the only way to fully own the title for an edition page.
 */
export async function generateMetadata(props: {
  searchParams?: Promise<{ event?: string }>;
}): Promise<Metadata> {
  const searchParams = props.searchParams ? await props.searchParams : {};
  const eventParam = searchParams?.event;

  // Never throw: this runs during rendering and metadata resolution.
  try {
    let target: Awaited<ReturnType<typeof getEventById>> = null;
    if (eventParam) {
      const parsedId = Number.parseInt(eventParam, 10);
      if (Number.isFinite(parsedId)) {
        target = await getEventById(parsedId);
      }
    }
    if (!target) {
      const routable = (await fetchAllEvents()).filter((e) => !isHiddenFromSite(e));
      target =
        routable.find((e) => e.category === "flagship" && e.is_active && canonicalStatus(e.status) === "live") ??
        routable.find((e) => e.category === "flagship" && canonicalStatus(e.status) === "live") ??
        routable.find((e) => e.category === "flagship") ??
        routable[0] ??
        null;
    }
    if (!target) return {};

    const baseUrl = process.env.APP_URL || "https://goodlife.smwhr.space";
    const title = target.title;
    const venue = target.venue || "MARARA CAMP, THIKA";
    const description =
      `Official tickets for ${title} at ${venue}. ` +
      `Instant M-Pesa checkout and instant WhatsApp PDF ticket delivery.`;
    // The flyer is a per-event field, not the site-wide singleton's, so an
    // edition link shares that edition's artwork.
    const flyer = target.flyer_url || "/flyer.png";
    const image = flyer.startsWith("http") ? flyer : `${baseUrl}${flyer}`;

    return {
      title: `${title} - ${venue}`,
      description,
      openGraph: {
        title: `${title} - ${venue}`,
        description,
        url: baseUrl,
        type: "website",
        images: [
          {
            url: image,
            width: 1200,
            height: 1600,
            alt: `${title} official event flyer`,
          },
        ],
      },
      twitter: {
        card: "summary_large_image",
        title: `${title} - ${venue}`,
        description,
        images: [image],
      },
    };
  } catch {
    // Fall back to the layout's site-wide defaults.
    return {};
  }
}

export default async function Page(props: { searchParams?: Promise<{ event?: string; tier?: string }> }) {
  const searchParams = props.searchParams ? await props.searchParams : {};
  const eventParam = searchParams?.event;
  const tierParam = searchParams?.tier;

  const allEvents = await fetchAllEvents();

  let targetEvent = null;
  if (eventParam) {
    const parsedId = parseInt(eventParam, 10);
    if (!isNaN(parsedId)) {
      targetEvent = await getEventById(parsedId);
    }
  }

  // An archived event is not routable, so it must never be chosen as the
  // homepage anchor. Picking one here would 404 the entire site on a
  // mis-sequenced archive.
  const routable = allEvents.filter(e => !isHiddenFromSite(e));

  // CORE RULE: Root homepage (no ?event=) ALWAYS anchors to Flagship GOODLIFE!
  if (!targetEvent) {
    // 1. The live flagship, preferring the designated homepage event.
    targetEvent =
      routable.find(e => e.category === 'flagship' && e.is_active && canonicalStatus(e.status) === 'live') ??
      routable.find(e => e.category === 'flagship' && canonicalStatus(e.status) === 'live');
    // 2. Still nothing live: the most recent flagship we are allowed to show.
    //    `publicState` decides whether that becomes a coming-soon page or a recap.
    if (!targetEvent) {
      targetEvent = routable.find(e => e.category === 'flagship');
    }
    // 3. No flagship at all (mini-festival-only install): the active event.
    if (!targetEvent) {
      targetEvent = await fetchActiveEvent();
      if (isHiddenFromSite(targetEvent)) {
        targetEvent = null;
      }
    }
    // 4. Last resort: the newest routable row.
    if (!targetEvent && routable.length > 0) {
      targetEvent = routable[0];
    }
  }

  // No event at all → fallback to eventDetails
  if (!targetEvent) {
    const eventDetails = await fetchEventDetails();
    return <ClosedEventClientPage eventDetails={eventDetails as any} />;
  }

  const eventDetails = {
    id: targetEvent.id,
    title: targetEvent.title,
    subtitle: targetEvent.subtitle,
    tag: targetEvent.tag,
    venue: targetEvent.venue,
    till_number: targetEvent.till_number,
    flyer_url: targetEvent.flyer_url,
    regulations: targetEvent.regulations,
    ticker_text: targetEvent.ticker_text,
    logo_url: targetEvent.logo_url,
    event_date: targetEvent.event_date,
    status: targetEvent.status,
    category: targetEvent.category,
    recurrence_pattern: targetEvent.recurrence_pattern,
    recurrence_day: targetEvent.recurrence_day,
    recurrence_time: targetEvent.recurrence_time,
    custom_schedule_text: targetEvent.custom_schedule_text,
    sales_open_date: targetEvent.sales_open_date,
    sales_close_date: targetEvent.sales_close_date,
    next_event_title: targetEvent.next_event_title,
    recap_video_url: targetEvent.recap_video_url,
    max_tent_inventory: targetEvent.max_tent_inventory,
    max_shared_beds: targetEvent.max_shared_beds,
  };

  // The editions switcher. `canonicalStatus` folds the legacy `'active'`
  // spelling, so an event saved through the old admin dropdown still appears
  // here instead of vanishing from the list unless it happened to be
  // `is_active`. Archived events are excluded on purpose — they are not
  // routable, so a link to one is a 404.
  const availableEvents = routable.filter(e => {
    const s = canonicalStatus(e.status);
    return s === 'live' || s === 'scheduled' || s === 'closed' || e.is_active;
  });
  // Must use the same predicate the payment routes use, or this banner
  // advertises a "PASSES ON SALE" event that then refuses payment at checkout.
  // It previously used `status === 'live' || is_active`, which qualified an
  // event that was live but inactive: an unbuyable dead end.
  const liveMiniEvents = allEvents.filter(e => e.category === 'mini' && !isHiddenFromSite(e) && isEventSellable(e));

  // Which page this event gets. Decided in one place (`publicState`) so the
  // homepage can never disagree with the payment routes about the same event.
  const decidedState = publicState(targetEvent);
  let state = decidedState;

  // Archived is not routable at all.
  if (state === "unavailable") notFound();

  // A checkout with no tiers renders CheckoutClientPage's built-in default
  // price ladder, so an event whose tiers have not been created yet would sell
  // tickets at invented prices. Holding the customer on the countdown is
  // strictly better than that, and it is what makes the `sales_open_date`
  // auto-open safe.
  let ticketTiers: Awaited<ReturnType<typeof fetchTicketTiers>> = [];
  let tiersPending = false;
  if (state === "checkout") {
    ticketTiers = await fetchTicketTiers(targetEvent.id);
    if (!ticketTiers || ticketTiers.length === 0) {
      state = "coming_soon";
      // Remember WHY. "Not on sale yet" and "on sale but no passes built yet"
      // need different copy, and the client must not work this out by reading
      // its own clock.
      tiersPending = decidedState === "checkout";
    }
  }

  if (state === "coming_soon") {
    return (
      <ScheduledEventClientPage
        eventDetails={eventDetails as any}
        availableEvents={availableEvents as any}
        liveMiniEvents={liveMiniEvents as any}
        tiersPending={tiersPending}
      />
    );
  }

  if (state === "recap") {
    return (
      <ClosedEventClientPage
        eventDetails={eventDetails as any}
        availableEvents={availableEvents as any}
        liveMiniEvents={liveMiniEvents as any}
      />
    );
  }

  // Sales open — show checkout
  return (
    <TicketCheckoutPage
      initialEventDetails={eventDetails as any}
      initialTicketTiers={ticketTiers}
      availableEvents={availableEvents as any}
      liveMiniEvents={liveMiniEvents as any}
      initialTierParam={tierParam}
    />
  );
}