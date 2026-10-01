/**
 * Shared fulfillment flow for successful PayHero payments.
 * Used by both the webhook (app/api/payhero/callback) and the polling
 * endpoint (app/api/payhero/verify) so tickets are created exactly once.
 */
import { Pool } from "pg";
import { createTicket, insertPaymentLog, fetchActiveEvent } from "@/lib/supabase-db";
import { sendTicketViaWhatsApp, notifyOperators } from "@/lib/whatsapp";

export interface FulfillPayheroParams {
  /** Our reference — pending_payments.checkout_request_id (external_reference echoed by PayHero) */
  reference: string;
  /** Real M-Pesa receipt code from PayHero (provider_reference) */
  providerReference: string;
  amountPaid: number;
  /** Where fulfillment was triggered from, for the payment log */
  source: "callback" | "polling";
  raw: unknown;
}

function newPool() {
  return new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
}

async function getPending(reference: string) {
  const pool = newPool();
  try {
    const { rows } = await pool.query(
      `SELECT status, ticket_id, buyer_name, phone_number, ticket_type, quantity, amount, whatsapp_number, event_id
       FROM pending_payments WHERE checkout_request_id = $1 LIMIT 1`,
      [reference]
    );
    return rows[0] || null;
  } finally {
    await pool.end().catch(() => {});
  }
}

/**
 * Idempotent fulfillment: creates payment log + tickets, updates pending_payments,
 * dispatches tickets via WhatsApp and notifies operators.
 */
export async function fulfillPayheroPayment(
  p: FulfillPayheroParams
): Promise<{ fulfilled: boolean; ticketIds: string[]; reason?: string }> {
  const pending = await getPending(p.reference);
  if (!pending) {
    return { fulfilled: false, ticketIds: [], reason: "pending payment not found" };
  }
  if (pending.status === "completed" && pending.ticket_id) {
    const existing = String(pending.ticket_id)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    return { fulfilled: true, ticketIds: existing, reason: "already completed" };
  }

  const quantity = Math.max(1, Number(pending.quantity) || 1);
  const buyerName = pending.buyer_name || "";
  const phoneNumber = pending.phone_number || "";
  const whatsappNumber = pending.whatsapp_number || "";
  const ticketType = pending.ticket_type || "";
  const eventId = pending.event_id || (await fetchActiveEvent())?.id;
  if (!eventId) {
    return { fulfilled: false, ticketIds: [], reason: "Could not resolve valid event ID for fulfillment" };
  }
  const amountPaid = Number(p.amountPaid) > 0 ? Number(p.amountPaid) : Number(pending.amount) || 0;
  const receipt = p.providerReference || p.reference;

  await insertPaymentLog({
    checkout_request_id: p.reference,
    mpesa_receipt: receipt,
    phone_number: phoneNumber,
    amount: amountPaid,
    status: "success",
    result_desc: `PayHero ${p.source} success`,
    raw_payload: p.raw as any,
    event_id: eventId,
  });

  const perTicketAmount = amountPaid / quantity;
  const createdTickets: Array<{ id: string; buyer_name: string }> = [];

  for (let i = 1; i <= quantity; i++) {
    const ticketId = quantity === 1 ? p.reference : `${p.reference}-${i}`;
    const ticket = await createTicket({
      id: ticketId,
      mpesa_receipt: receipt,
      phone_number: phoneNumber,
      ticket_type: ticketType,
      amount_paid: perTicketAmount,
      buyer_name: buyerName,
      event_id: eventId,
    });
    createdTickets.push(ticket);
  }

  const allTicketIds = createdTickets.map((t) => t.id).join(",");
  const pool = newPool();
  try {
    await pool.query(
      `UPDATE pending_payments
       SET status = 'completed',
           ticket_id = $1,
           whatsapp_number = COALESCE(NULLIF(whatsapp_number, ''), $3)
       WHERE checkout_request_id = $2`,
      [allTicketIds, p.reference, whatsappNumber]
    );
  } finally {
    await pool.end().catch(() => {});
  }

  // WhatsApp dispatch with inter-message delay to prevent gateway socket collisions
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

  try {
    await notifyOperators(buyerName, ticketType, quantity, amountPaid, p.reference);
  } catch (opErr) {
    console.error("Operator notification broadcast failed:", opErr);
  }

  return { fulfilled: true, ticketIds: createdTickets.map((t) => t.id) };
}

/** Mark a pending payment as failed (webhook/polling reported failure or cancellation). */
export async function markPayheroPaymentFailed(reference: string, reason: string, raw: unknown) {
  const pool = newPool();
  try {
    await pool.query(
      "UPDATE pending_payments SET status = 'failed' WHERE checkout_request_id = $1 AND status <> 'completed'",
      [reference]
    );
  } finally {
    await pool.end().catch(() => {});
  }

  try {
    await insertPaymentLog({
      checkout_request_id: reference,
      mpesa_receipt: reference,
      phone_number: "",
      amount: 0,
      status: "failed",
      result_desc: reason || "PayHero payment failed",
      raw_payload: raw as any,
    });
  } catch (e) {
    console.error("Failed to record PayHero failure log:", e);
  }
}
