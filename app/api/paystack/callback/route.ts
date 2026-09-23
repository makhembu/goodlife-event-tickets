import { NextRequest, NextResponse } from "next/server";
import { createTicket, insertPaymentLog, fetchActiveEvent } from "@/lib/supabase-db";
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

    if (event === "charge.failed") {
      const reference = payload.data?.reference;
      if (reference) {
        try {
          const { Pool } = require("pg");
          const pool = new Pool({
            connectionString: process.env.DATABASE_URL,
            ssl: { rejectUnauthorized: false },
          });
          await pool.query(
            "UPDATE pending_payments SET status = 'failed' WHERE checkout_request_id = $1",
            [reference]
          );
          await pool.end();
          await insertPaymentLog({
            checkout_request_id: reference,
            mpesa_receipt: reference,
            phone_number: payload.data?.metadata?.phone_number || "",
            amount: (payload.data?.amount || 0) / 100,
            status: "failed",
            result_desc: payload.data?.gateway_response || payload.data?.message || "Paystack charge.failed webhook",
            raw_payload: payload,
          });
        } catch (e) {
          console.error("Failed to record charge.failed webhook:", e);
        }
      }
      return NextResponse.json({ message: "Charge failed event recorded" });
    }

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

    const eventId = metadata.event_id || (await fetchActiveEvent())?.id || 1;

    await insertPaymentLog({
      checkout_request_id: reference,
      mpesa_receipt: reference,
      phone_number: phoneNumber,
      amount: amountPaid,
      status: "success",
      result_desc: "Paystack charge.success webhook",
      raw_payload: payload,
      event_id: eventId,
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
        event_id: eventId,
      });
      createdTickets.push(ticket);
    }

    // Update pending_payment status with all ticket IDs
    const allTicketIds = createdTickets.map(t => t.id).join(",");
    try {
      const { Pool } = require("pg");
      const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false },
      });
      await pool.query(
        "UPDATE pending_payments SET status = 'completed', ticket_id = $1, whatsapp_number = COALESCE(NULLIF(whatsapp_number, ''), $3) WHERE checkout_request_id = $2",
        [allTicketIds, reference, whatsappNumber]
      );
      await pool.end();
    } catch (e) {
      console.error("Failed to update pending_payments:", e);
    }

    // WhatsApp dispatch with inter-message delay to prevent WAHA socket collision
    const deliveryPhone = whatsappNumber || phoneNumber;
    for (let i = 0; i < createdTickets.length; i++) {
      const ticket = createdTickets[i];
      if (i > 0) {
        await new Promise((r) => setTimeout(r, 1500));
      }
      try {
        await sendTicketViaWhatsApp(ticket.id, deliveryPhone, ticket.buyer_name);
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
