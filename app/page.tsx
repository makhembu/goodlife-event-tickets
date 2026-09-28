import { fetchActiveEvent, fetchEventDetails, fetchTicketTiers, fetchAllEvents, getEventById, isEventSellable } from "@/lib/supabase-db";
import TicketCheckoutPage from "./CheckoutClientPage";
import ClosedEventClientPage from "./ClosedEventClientPage";

export const dynamic = "force-dynamic";

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

  // CORE RULE: Root homepage (no ?event=) ALWAYS anchors to Flagship GOODLIFE!
  if (!targetEvent) {
    // 1. Look for live or active flagship event
    targetEvent = allEvents.find(e => e.category === 'flagship' && (e.is_active || e.status === 'live'));
    // 2. If no live flagship, find the latest scheduled or closed flagship event
    if (!targetEvent) {
      targetEvent = allEvents.find(e => e.category === 'flagship');
    }
    // 3. Fallback to active event
    if (!targetEvent) {
      targetEvent = await fetchActiveEvent();
    }
    // 4. Fallback to first event in DB
    if (!targetEvent && allEvents.length > 0) {
      targetEvent = allEvents[0];
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

  const isClosed = targetEvent.status === 'closed' || targetEvent.status === 'scheduled';
  const availableEvents = allEvents.filter(e => e.status === 'live' || e.status === 'scheduled' || e.is_active);
  // Must use the same predicate the payment routes use, or this banner
  // advertises a "LIVE NOW ... FREE RSVP AVAILABLE" event that then refuses
  // payment at checkout. It previously used `status === 'live' || is_active`,
  // which qualified an event that was live but inactive: an unbuyable dead end.
  const liveMiniEvents = allEvents.filter(e => e.category === 'mini' && isEventSellable(e));

  if (isClosed) {
    return (
      <ClosedEventClientPage
        eventDetails={eventDetails as any}
        availableEvents={availableEvents as any}
        liveMiniEvents={liveMiniEvents as any}
      />
    );
  }

  // Active event, sales open — show checkout
  const ticketTiers = await fetchTicketTiers(targetEvent.id);

  return (
    <TicketCheckoutPage
      initialEventDetails={eventDetails as any}
      initialTicketTiers={ticketTiers}
      availableEvents={availableEvents as any}
      initialTierParam={tierParam}
    />
  );
}
