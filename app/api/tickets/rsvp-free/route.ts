import { NextRequest, NextResponse } from "next/server";
import { createTicket, fetchTicketTiers, getEventById, fetchActiveEvent, isEventSellable } from "@/lib/supabase-db";
import { sendTicketViaWhatsApp } from "@/lib/whatsapp";
import { checkRateLimit } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  const rl = checkRateLimit(request, "rsvp-free", { maxRequests: 5, windowMs: 60 * 1000 });
  if (!rl.allowed) return rl.response!;

  try {
    const { buyer_name, phone_number, whatsapp_number = "", event_id, tier_id } = await request.json();

    if (!buyer_name || !phone_number || !tier_id) {
      return NextResponse.json(
        { error: "Missing required fields: buyer_name, phone_number, tier_id." },
        { status: 400 }
      );
    }

    let targetEvent = event_id ? await getEventById(Number(event_id)) : await fetchActiveEvent();
    if (!targetEvent) {
      return NextResponse.json({ error: "Active event not found." }, { status: 404 });
    }

    // A closed event must not be able to take reservations. The date window
    // alone is not sufficient: GOODLIFE XP is status='closed' with no
    // sales_close_date, so it satisfied every date check.
    if (!isEventSellable(targetEvent)) {
      return NextResponse.json(
        { error: "Ticket sales are not open for this event." },
        { status: 400 }
      );
    }

    // Verify sales open/close dates
    const now = new Date();
    if (targetEvent.sales_open_date && now < new Date(targetEvent.sales_open_date)) {
      return NextResponse.json({ error: "Ticket sales have not opened yet." }, { status: 400 });
    }
    if (targetEvent.sales_close_date && now > new Date(targetEvent.sales_close_date)) {
      return NextResponse.json({ error: "Online ticket reservations have closed." }, { status: 400 });
    }

    const tiers = await fetchTicketTiers(targetEvent.id);
    const matchedTier = tiers.find((t) => t.id === tier_id);
    if (!matchedTier) {
      return NextResponse.json({ error: "Invalid ticket tier selected." }, { status: 400 });
    }

    if (Number(matchedTier.price) !== 0) {
      return NextResponse.json(
        { error: "This tier requires payment. Please use M-Pesa checkout." },
        { status: 400 }
      );
    }

    if (matchedTier.max_quantity != null && (matchedTier.sold_count || 0) >= matchedTier.max_quantity) {
      return NextResponse.json({ error: "Free RSVP quota for this tier is fully booked." }, { status: 400 });
    }

    const reference = `RSVP-${Math.random().toString(36).substring(2, 10).toUpperCase()}`;
    const ticket = await createTicket({
      id: reference,
      mpesa_receipt: `RSVP-FREE-${Date.now()}`,
      phone_number,
      ticket_type: matchedTier.name,
      amount_paid: 0,
      buyer_name,
      whatsapp_number: whatsapp_number || phone_number,
      event_id: targetEvent.id,
      guest_count: matchedTier.admits_quantity || 1,
      is_camping: Boolean(matchedTier.is_camping_bundle),
      camping_type: matchedTier.camping_type || "none"
    });

    // Dispatch via WhatsApp in background
    sendTicketViaWhatsApp(ticket.id, whatsapp_number || phone_number, buyer_name).catch((err) => {
      console.error("Failed to send free RSVP via WhatsApp:", err);
    });

    return NextResponse.json({
      success: true,
      ticket,
      message: "RSVP Confirmed! Your free ticket pass has been issued."
    });
  } catch (error: any) {
    console.error("Free RSVP error:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}
