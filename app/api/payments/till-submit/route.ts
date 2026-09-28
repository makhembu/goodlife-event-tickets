import { NextRequest, NextResponse } from "next/server";
import { createPendingPayment } from "@/lib/supabase-db";
import { getEventAvailability, unavailabilityMessage } from "@/lib/event-availability";
import { notifyOperators } from "@/lib/whatsapp";
import { checkRateLimit } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  const rl = checkRateLimit(request, "till-submit", { maxRequests: 10, windowMs: 60 * 1000 });
  if (!rl.allowed) return rl.response!;

  try {
    const body = await request.json();
    const { buyer_name, phone_number, ticket_type, quantity, whatsapp_number, mpesa_reference, event_id } = body;

    if (!buyer_name || !phone_number || !ticket_type || !quantity || !mpesa_reference) {
      return NextResponse.json(
        { error: "Missing required fields: buyer_name, phone_number, ticket_type, quantity, mpesa_reference" },
        { status: 400 }
      );
    }

    const { Pool } = require("pg");
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    });

    let resolvedEventId = event_id ? Number(event_id) : null;
    let targetEvent: any = null;
    if (resolvedEventId) {
      const { rows } = await pool.query("SELECT * FROM events WHERE id = $1 LIMIT 1", [resolvedEventId]);
      if (rows.length > 0) targetEvent = rows[0];
    }
    if (!targetEvent) {
      // Same tiebreak as fetchActiveEvent(): is_active is the homepage slot,
      // and mini-festival rows must never win it. Kept in sync deliberately -
      // this is the one place that resolves the active event with a raw query
      // instead of going through fetchActiveEvent().
      const { rows } = await pool.query(
        "SELECT * FROM events WHERE is_active = TRUE ORDER BY (COALESCE(category, '') = 'mini') ASC, created_at DESC, id DESC LIMIT 1"
      );
      if (rows.length > 0) {
        targetEvent = rows[0];
        resolvedEventId = targetEvent.id;
      }
    }

    // A closed event must not be able to take money. The rule lives in
    // lib/event-availability.ts; this route only picks the wording. The
    // previous copy-pasted date checks here were a third copy of the same
    // condition. This also replaces a fallback that defaulted resolvedEventId
    // to 1, which failed OPEN onto a closed event.
    const availability = getEventAvailability(targetEvent);
    if (!availability.sellable) {
      await pool.end();
      return NextResponse.json(
        { error: unavailabilityMessage(availability.reason!) },
        { status: 400 }
      );
    }

    // Look up the tier price and name
    let tierPrice = 500;
    let tierName = "Standard";
    try {
      const tierQuery = resolvedEventId 
        ? "SELECT price, name FROM ticket_tiers WHERE (id = $1 OR LOWER(TRIM(name)) = LOWER(TRIM($1))) AND event_id = $2 AND deleted_at IS NULL LIMIT 1"
        : "SELECT price, name FROM ticket_tiers WHERE id = $1 AND deleted_at IS NULL LIMIT 1";
      const tierParams = resolvedEventId ? [ticket_type, resolvedEventId] : [ticket_type];
      const { rows: tRows } = await pool.query(tierQuery, tierParams);
      if (tRows.length > 0) {
        tierPrice = Number(tRows[0].price);
        tierName = tRows[0].name;
      }
    } catch {
      // fallback
    } finally {
      await pool.end();
    }

    const checkout_request_id = `TILL-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    const amount = tierPrice * quantity;

    await createPendingPayment({
      checkout_request_id,
      phone_number,
      ticket_type,
      quantity,
      buyer_name,
      amount,
      status: "till_pending",
      whatsapp_number: whatsapp_number || "",
      mpesa_reference,
      event_id: resolvedEventId
    });

    notifyOperators(buyer_name, tierName, quantity, amount, mpesa_reference).catch(() => {});

    return NextResponse.json({
      success: true,
      message: "Payment request submitted. Admin will verify your M-Pesa payment and send your ticket.",
      checkout_request_id
    });
  } catch (error: any) {
    console.error("Till submit error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
