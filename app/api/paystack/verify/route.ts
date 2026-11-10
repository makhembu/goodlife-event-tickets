import { NextRequest, NextResponse } from "next/server";
import { createTicket, insertPaymentLog, fetchActiveEvent } from "@/lib/supabase-db";
import { sendTicketViaWhatsApp, notifyOperators } from "@/lib/whatsapp";

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
const PAYSTACK_API = "https://api.paystack.co";

function isPaystackEnabled(): boolean {
  const flag = (process.env.ENABLE_PAYSTACK || process.env.NEXT_PUBLIC_ENABLE_PAYSTACK || "").toLowerCase().trim();
  const secret = process.env.PAYSTACK_SECRET_KEY?.trim();
  return Boolean(secret && (flag === "true" || flag === "1"));
}

export async function GET(request: NextRequest) {
  if (!isPaystackEnabled()) {
    return NextResponse.json(
      { error: "Paystack payment verification is not enabled on this server." },
      { status: 503 }
    );
  }

  const { searchParams } = new URL(request.url);
  const reference = searchParams.get("reference");

  if (!reference) {
    return NextResponse.json({ error: "Missing reference" }, { status: 400 });
  }

  try {
    const { Pool } = require("pg");
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    });

    const { rows } = await pool.query(
      "SELECT status, ticket_id, buyer_name, phone_number, ticket_type, quantity, amount, whatsapp_number, event_id FROM pending_payments WHERE checkout_request_id = $1 LIMIT 1",
      [reference]
    );

    // Enforce that a pending order exists in database before allowing verification
    if (rows.length === 0) {
      await pool.end();
      return NextResponse.json({ error: "Order reference not found" }, { status: 404 });
    }

    const pending = rows[0];

    // 1. If already completed in database, return immediately (idempotent)
    if (pending.status === "completed" && pending.ticket_id) {
      await pool.end();
      const ticketIds = pending.ticket_id.includes(",")
        ? pending.ticket_id.split(",").map((s: string) => s.trim()).filter(Boolean)
        : [pending.ticket_id];
      return NextResponse.json({
        status: "completed",
        ticket_id: ticketIds[0],
        ticket_ids: ticketIds,
      });
    }

    // 2. If already marked failed in database, return immediately
    if (pending.status === "failed") {
      await pool.end();
      return NextResponse.json({
        status: "failed",
        message: "Payment was declined or cancelled.",
      });
    }

    // 3. Query Paystack API directly and verify reference + amount
    if (PAYSTACK_SECRET_KEY) {
      const paystackRes = await fetch(`${PAYSTACK_API}/transaction/verify/${encodeURIComponent(reference)}`, {
        headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}` },
      });
      const paystackData = await paystackRes.json();

      if (paystackData.status && paystackData.data) {
        const data = paystackData.data;
        const psStatus = data.status;
        const gatewayResponse = data.gateway_response || data.message || "";

        // Verify the external reference matches exactly
        if (data.reference !== reference) {
          console.error(`Paystack verify: reference mismatch (${data.reference} vs ${reference})`);
          await pool.end();
          return NextResponse.json({ error: "Reference mismatch" }, { status: 400 });
        }

        if (psStatus === "success") {
          const amountPaid = Number(data.amount) / 100;
          const expectedAmount = Number(pending.amount) || 0;

          // Verify amount paid covers the pending order amount
          if (expectedAmount > 0 && amountPaid < expectedAmount) {
            console.error(`Paystack verify: underpayment (paid ${amountPaid} KES, expected ${expectedAmount} KES)`);
            await pool.end();
            return NextResponse.json({ error: "Underpayment detected" }, { status: 400 });
          }

          const metadata = data.metadata || {};
          const ticketType = pending.ticket_type || metadata.ticket_type;
          if (!ticketType) {
            console.error(`Paystack verify: Missing ticket_type for reference ${reference}`);
            await pool.end();
            return NextResponse.json({ error: "Missing ticket tier specification" }, { status: 400 });
          }
          const quantity = Number(pending.quantity) || Number(metadata.quantity) || 1;
          const buyerName = pending.buyer_name || metadata.buyer_name || data.customer?.email || "";
          const phoneNumber = pending.phone_number || metadata.phone_number || "";
          const whatsappNumber = pending.whatsapp_number || metadata.whatsapp_number || "";
          const eventId = pending.event_id || metadata.event_id || (await fetchActiveEvent())?.id || 1;

          // Insert payment log
          await insertPaymentLog({
            checkout_request_id: reference,
            mpesa_receipt: reference,
            phone_number: phoneNumber,
            amount: amountPaid,
            status: "success",
            result_desc: "Paystack verify polling success",
            raw_payload: paystackData,
            event_id: eventId,
          });

          // Create tickets
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

          // Update pending_payments with all ticket IDs
          const allTicketIds = createdTickets.map(t => t.id).join(",");
          await pool.query(
            "UPDATE pending_payments SET status = 'completed', ticket_id = $1 WHERE checkout_request_id = $2",
            [allTicketIds, reference]
          );
          await pool.end();

          // WhatsApp dispatch with inter-message delay
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

          // Notify operators
          try {
            await notifyOperators(buyerName, ticketType, quantity, amountPaid, reference);
          } catch (opErr) {
            console.error("Operator notification broadcast failed:", opErr);
          }

          return NextResponse.json({
            status: "completed",
            ticket_id: createdTickets[0].id,
            ticket_ids: createdTickets.map(t => t.id),
          });
        } else if (psStatus === "failed" || psStatus === "abandoned" || psStatus === "reversed") {
          await pool.query(
            "UPDATE pending_payments SET status = 'failed' WHERE checkout_request_id = $1",
            [reference]
          );
          await pool.end();

          return NextResponse.json({
            status: "failed",
            message: gatewayResponse || "Payment failed or was cancelled.",
          });
        }
      }
    }

    await pool.end();
    return NextResponse.json({ status: "pending" });
  } catch (error: any) {
    console.error("Paystack verify error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
