import { NextRequest, NextResponse } from "next/server";
import { createPendingPayment } from "@/lib/supabase-db";
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
      const { rows } = await pool.query("SELECT * FROM events WHERE is_active = TRUE LIMIT 1");
      if (rows.length > 0) {
        targetEvent = rows[0];
        resolvedEventId = targetEvent.id;
      } else {
        resolvedEventId = 1;
      }
    }

    const now = new Date();
    if (targetEvent?.sales_open_date && now < new Date(targetEvent.sales_open_date)) {
      await pool.end();
      return NextResponse.json({ error: "Ticket sales have not opened yet for this event." }, { status: 400 });
    }
    if (targetEvent?.sales_close_date && now > new Date(targetEvent.sales_close_date)) {
      await pool.end();
      return NextResponse.json({ error: "Online ticket sales have closed. Gate tickets available at entrance." }, { status: 400 });
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
