import { NextRequest, NextResponse } from "next/server";
import { createTicket, insertPaymentLog, fetchActiveEvent } from "@/lib/supabase-db";
import { sendTicketViaWhatsApp, notifyOperators } from "@/lib/whatsapp";

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
const PAYSTACK_API = "https://api.paystack.co";

export async function GET(request: NextRequest) {
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
      "SELECT status, ticket_id, buyer_name, phone_number, ticket_type, quantity, amount, whatsapp_number FROM pending_payments WHERE checkout_request_id = $1 LIMIT 1",
      [reference]
    );

    // 1. If already completed in database, return immediately
    if (rows.length > 0 && rows[0].status === "completed" && rows[0].ticket_id) {
      await pool.end();
      const ticketIds = rows[0].ticket_id.includes(",")
        ? rows[0].ticket_id.split(",").map((s: string) => s.trim()).filter(Boolean)
        : [rows[0].ticket_id];
      return NextResponse.json({
        status: "completed",
        ticket_id: ticketIds[0],
        ticket_ids: ticketIds,
      });
    }

    // 2. If already marked failed in database, return immediately
    if (rows.length > 0 && rows[0].status === "failed") {
      await pool.end();
      return NextResponse.json({
        status: "failed",
        message: "Payment was declined or cancelled.",
      });
    }

    // 3. Fallback: Query Paystack API directly
    if (PAYSTACK_SECRET_KEY) {
      const paystackRes = await fetch(`${PAYSTACK_API}/transaction/verify/${reference}`, {
        headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}` },
      });
      const paystackData = await paystackRes.json();

      if (paystackData.status && paystackData.data) {
        const psStatus = paystackData.data.status;
        const gatewayResponse = paystackData.data.gateway_response || paystackData.data.message || "";

        if (psStatus === "success") {
          const data = paystackData.data;
          const amountPaid = data.amount / 100;
          const metadata = data.metadata || {};
          const ticketType = metadata.ticket_type || rows[0]?.ticket_type || "ADV 500";
          const quantity = Number(metadata.quantity) || rows[0]?.quantity || 1;
          const buyerName = metadata.buyer_name || rows[0]?.buyer_name || data.customer?.email || "";
          const phoneNumber = metadata.phone_number || rows[0]?.phone_number || "";
          const whatsappNumber = metadata.whatsapp_number || rows[0]?.whatsapp_number || "";

          const eventId = metadata.event_id || rows[0]?.event_id || (await fetchActiveEvent())?.id || 1;

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
