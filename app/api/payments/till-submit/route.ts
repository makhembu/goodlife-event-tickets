import { NextRequest, NextResponse } from "next/server";
import { createPendingPayment } from "@/lib/supabase-db";
import { notifyOperators } from "@/lib/whatsapp";
import { checkRateLimit } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  const rl = checkRateLimit(request, "till-submit", { maxRequests: 10, windowMs: 60 * 1000 });
  if (!rl.allowed) return rl.response!;

  try {
    const body = await request.json();
    const { buyer_name, phone_number, ticket_type, quantity, whatsapp_number, mpesa_reference } = body;

    if (!buyer_name || !phone_number || !ticket_type || !quantity || !mpesa_reference) {
      return NextResponse.json(
        { error: "Missing required fields: buyer_name, phone_number, ticket_type, quantity, mpesa_reference" },
        { status: 400 }
      );
    }

    // Look up the tier price
    let tierPrice = 500;
    try {
      const { Pool } = require("pg");
      const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false },
      });
      const { rows } = await pool.query(
        "SELECT price FROM ticket_tiers WHERE id = $1 AND deleted_at IS NULL LIMIT 1",
        [ticket_type]
      );
      if (rows.length > 0) tierPrice = Number(rows[0].price);
      await pool.end();
    } catch {
      // fallback to default price
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
      mpesa_reference
    });

    let tierName = "Standard";
    try {
      const { Pool } = require("pg");
      const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false },
      });
      const { rows } = await pool.query(
        "SELECT name FROM ticket_tiers WHERE id = $1 AND deleted_at IS NULL LIMIT 1",
        [ticket_type]
      );
      if (rows.length > 0) tierName = rows[0].name;
      await pool.end();
    } catch {}

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
