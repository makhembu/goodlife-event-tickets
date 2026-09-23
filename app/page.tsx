import { fetchActiveEvent, fetchEventDetails, fetchTicketTiers } from "@/lib/supabase-db";
import TicketCheckoutPage from "./CheckoutClientPage";

export const dynamic = "force-dynamic";

export default async function Page() {
  // Try to get active event, fallback to event_details
  const activeEvent = await fetchActiveEvent();
  let eventDetails;
  
  if (activeEvent) {
    // Convert Event to EventDetails format for backward compatibility
    eventDetails = {
      id: activeEvent.id,
      title: activeEvent.title,
      subtitle: activeEvent.subtitle,
      tag: activeEvent.tag,
      venue: activeEvent.venue,
      till_number: activeEvent.till_number,
      flyer_url: activeEvent.flyer_url,
      regulations: activeEvent.regulations,
      ticker_text: activeEvent.ticker_text,
      logo_url: activeEvent.logo_url,
      event_date: activeEvent.event_date,
    };
  } else {
    // Fallback to event_details table
    eventDetails = await fetchEventDetails();
  }

  const ticketTiers = await fetchTicketTiers();

  return (
    <TicketCheckoutPage 
      initialEventDetails={eventDetails} 
      initialTicketTiers={ticketTiers} 
    />
  );
}
