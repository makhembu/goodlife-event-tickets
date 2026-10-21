import { NextRequest, NextResponse } from "next/server";
import { neonQuery } from "@/lib/supabase-db";
import { normalizePayheroPhone } from "@/lib/payhero";

/**
 * Secure Ticket & Order Lookup Endpoint.
 * Requires BOTH the order reference (or ticket ID) AND the customer's phone number.
 * Never allows querying by phone number alone, preventing mass data enumeration.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { reference, ticket_id, phone_number } = body || {};

    if (!phone_number || (!reference && !ticket_id)) {
      return NextResponse.json(
        { error: "Both phone number and order reference (or ticket ID) are required." },
        { status: 400 }
      );
    }

    const normalizedPhone = normalizePayheroPhone(phone_number);
    const lookupRef = String(reference || ticket_id).trim();

    // 1. First check if it matches a completed ticket directly
    const ticketRes = await neonQuery(
      `SELECT t.id, t.ticket_type, t.amount_paid, t.buyer_name, t.purchase_time, t.phone_number, t.event_id,
              e.title as event_title, e.event_date, e.venue
       FROM tickets t
       LEFT JOIN events e ON t.event_id = e.id
       WHERE t.id = $1 AND (t.phone_number = $2 OR t.phone_number LIKE $3)`,
      [lookupRef, normalizedPhone, `%${normalizedPhone.slice(-9)}`]
    );

    if (ticketRes && ticketRes.rows && ticketRes.rows.length > 0) {
      const t = ticketRes.rows[0];
      return NextResponse.json({
        success: true,
        status: "completed",
        tickets: [
          {
            id: t.id,
            ticket_type: t.ticket_type,
            amount_paid: t.amount_paid,
            buyer_name: t.buyer_name,
            purchase_time: t.purchase_time,
            event_title: t.event_title,
            event_date: t.event_date,
            venue: t.venue,
          },
        ],
      });
    }

    // 2. Check pending_payments by checkout_request_id + phone
    const pendingRes = await neonQuery(
      `SELECT checkout_request_id, status, ticket_id, amount, buyer_name, phone_number, ticket_type, quantity, event_id
       FROM pending_payments
       WHERE checkout_request_id = $1 AND (phone_number = $2 OR phone_number LIKE $3)
       LIMIT 1`,
      [lookupRef, normalizedPhone, `%${normalizedPhone.slice(-9)}`]
    );

    if (!pendingRes || !pendingRes.rows || pendingRes.rows.length === 0) {
      return NextResponse.json(
        { error: "No matching order found for this reference and phone number." },
        { status: 404 }
      );
    }

    const order = pendingRes.rows[0];
    if (order.status === "completed" && order.ticket_id) {
      const ticketIds = String(order.ticket_id).split(",").map((s) => s.trim()).filter(Boolean);
      // Fetch details for these tickets
      const allTickets = await neonQuery(
        `SELECT t.id, t.ticket_type, t.amount_paid, t.buyer_name, t.purchase_time,
                e.title as event_title, e.event_date, e.venue
         FROM tickets t
         LEFT JOIN events e ON t.event_id = e.id
         WHERE t.id = ANY($1::text[])`,
        [ticketIds]
      );

      return NextResponse.json({
        success: true,
        status: "completed",
        tickets: allTickets.rows || [],
      });
    }

    return NextResponse.json({
      success: true,
      status: order.status || "pending",
      reference: order.checkout_request_id,
      amount: order.amount,
      message:
        order.status === "failed"
          ? "Payment was declined or cancelled."
          : "Payment is pending confirmation.",
    });
  } catch (error: any) {
    console.error("Ticket lookup error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
