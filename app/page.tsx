import { fetchActiveEvent, fetchEventDetails, fetchTicketTiers } from "@/lib/supabase-db";
import TicketCheckoutPage from "./CheckoutClientPage";
import ClosedEventClientPage from "./ClosedEventClientPage";

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
      status: activeEvent.status,
      sales_open_date: activeEvent.sales_open_date,
      sales_close_date: activeEvent.sales_close_date,
      next_event_title: activeEvent.next_event_title,
      recap_video_url: activeEvent.recap_video_url,
    };
  } else {
    // Fallback to event_details table
    eventDetails = await fetchEventDetails();
  }

  // Determine if sales are closed
  const isClosed = eventDetails.status === 'closed' || eventDetails.status === 'scheduled';
  
  if (isClosed) {
    return <ClosedEventClientPage eventDetails={eventDetails as any} />;
  }

  const ticketTiers = await fetchTicketTiers();

  return (
    <TicketCheckoutPage 
      initialEventDetails={eventDetails as any} 
      initialTicketTiers={ticketTiers} 
    />
  );
}
