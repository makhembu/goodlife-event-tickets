import { NextRequest, NextResponse } from "next/server";
import { createTicket, insertPaymentLog } from "@/lib/supabase-db";
import { sendTicketViaWhatsApp, notifyOperators } from "@/lib/whatsapp";
import crypto from "crypto";

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
const PAYSTACK_API = "https://api.paystack.co";

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    const signature = request.headers.get("x-paystack-signature");

    if (!PAYSTACK_SECRET_KEY) {
      console.warn("PAYSTACK_SECRET_KEY not set — webhook skipped");
      return NextResponse.json({ error: "Not configured" }, { status: 500 });
    }

    const expectedSig = crypto
      .createHmac("sha512", PAYSTACK_SECRET_KEY)
      .update(rawBody)
      .digest("hex");

    if (signature !== expectedSig) {
      console.warn("Paystack webhook signature mismatch");
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    const payload = JSON.parse(rawBody);
    const event = payload.event;

    if (event !== "charge.success") {
      return NextResponse.json({ message: "Event ignored" });
    }

    const data = payload.data;
    const reference = data.reference;
    const amountPaidKobo = data.amount;
    const amountPaid = amountPaidKobo / 100;
    const email = data.customer?.email || "";
    const metadata = data.metadata || {};
    const ticketType = metadata.ticket_type || "ADV 500";
    const quantity = Number(metadata.quantity) || 1;
    const buyerName = metadata.buyer_name || email;
    const phoneNumber = metadata.phone_number || email;
    const whatsappNumber = metadata.whatsapp_number || "";

    // Verify transaction with Paystack
    const verifyRes = await fetch(`${PAYSTACK_API}/transaction/verify/${reference}`, {
      headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}` },
    });
    const verifyData = await verifyRes.json();

    if (!verifyData.status || verifyData.data.status !== "success") {
      console.warn(`Paystack verification failed for ${reference}`);
      return NextResponse.json({ error: "Verification failed" }, { status: 400 });
    }

    await insertPaymentLog({
      checkout_request_id: reference,
      mpesa_receipt: reference,
      phone_number: phoneNumber,
      amount: amountPaid,
      status: "success",
      result_desc: "Paystack charge.success webhook",
      raw_payload: payload,
    });

    const perTicketAmount = amountPaid / quantity;
    const createdTickets = [];

    for (let i = 1; i <= quantity; i++) {
      const ticketId = quantity === 1 ? reference : `${reference}-${i}`;
      const ticket = await createTicket({
        id: ticketId,
        mpesa_receipt: reference,
        phone_number: phoneNumber,
        ticket_type: ticketType,
        amount_paid: perTicketAmount,
        buyer_name: buyerName,
      });
      createdTickets.push(ticket);
    }

    // Update pending_payment status
    try {
      const { Pool } = require("pg");
      const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false },
      });
      await pool.query(
        "UPDATE pending_payments SET status = 'completed', ticket_id = $1, whatsapp_number = COALESCE(NULLIF(whatsapp_number, ''), $3) WHERE checkout_request_id = $2",
        [createdTickets[0].id, reference, whatsappNumber]
      );
      await pool.end();
    } catch (e) {
      console.error("Failed to update pending_payments:", e);
    }

    // WhatsApp dispatch
    const deliveryPhone = whatsappNumber || phoneNumber;
    for (const ticket of createdTickets) {
      try {
        await sendTicketViaWhatsApp(ticket.id, deliveryPhone);
      } catch (wsErr) {
        console.error(`WhatsApp delivery failed for ticket ${ticket.id}:`, wsErr);
      }
    }

    // Notify operators of the purchase
    try {
      await notifyOperators(buyerName, ticketType, quantity, amountPaid, reference);
    } catch (opErr) {
      console.error("Operator notification broadcast failed:", opErr);
    }

    return NextResponse.json({ success: true, tickets: createdTickets.length });
  } catch (error: any) {
    console.error("Paystack webhook error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
