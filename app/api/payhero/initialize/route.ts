import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { fetchTicketTiers, fetchActiveEvent, neonQuery } from "@/lib/supabase-db";
import { getEventAvailability, unavailabilityMessage } from "@/lib/event-availability";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  isPayheroConfigured,
  initiatePayheroStkPush,
  normalizePayheroPhone,
  payheroCallbackUrl,
  getPayheroServiceWallet,
  getPayheroTransactionStatus,
  payheroStatusIsSuccess,
  payheroStatusIsFailed,
} from "@/lib/payhero";
import { alertLowPayheroWallet } from "@/lib/payhero-alerts";

export async function POST(request: NextRequest) {
  const rl = checkRateLimit(request, "payhero-init", { maxRequests: 10, windowMs: 60 * 1000 });
  if (!rl.allowed) return rl.response!;

  try {
    const {
      phone_number,
      ticket_type,
      buyer_name,
      quantity = 1,
      whatsapp_number = "",
      event_id,
      idempotency_key,
    } = await request.json();

    if (!phone_number || !ticket_type || !buyer_name) {
      return NextResponse.json(
        { error: "Phone number, ticket type, and buyer name are required." },
        { status: 400 }
      );
    }

    // 1. If client provided an idempotency_key, check for existing payment record first
    if (idempotency_key && typeof idempotency_key === "string" && idempotency_key.trim()) {
      const cleanKey = idempotency_key.trim();
      const existing = await neonQuery(
        `SELECT checkout_request_id, status, ticket_id, amount, phone_number, created_at
         FROM pending_payments
         WHERE idempotency_key = $1
         LIMIT 1`,
        [cleanKey]
      );

      if (existing && existing.rows && existing.rows.length > 0) {
        const row = existing.rows[0];
        // If already completed, return existing ticket immediately
        if (row.status === "completed" && row.ticket_id) {
          const ids = String(row.ticket_id).split(",").map((s) => s.trim()).filter(Boolean);
          return NextResponse.json({
            success: true,
            status: "completed",
            reference: row.checkout_request_id,
            merchant_reference: row.checkout_request_id,
            ticket_id: ids[0],
            ticket_ids: ids,
            amount: Number(row.amount),
          });
        }

        // If pending, check live PayHero status first to avoid initiating another STK push
        if (row.status === "pending") {
          try {
            const check = await getPayheroTransactionStatus(row.checkout_request_id);
            if (check.ok && check.data) {
              if (payheroStatusIsSuccess(check.data)) {
                // Let verify or callback complete it, or return pending with existing reference
                return NextResponse.json({
                  success: true,
                  status: "QUEUED",
                  reference: row.checkout_request_id,
                  merchant_reference: row.checkout_request_id,
                  amount: Number(row.amount),
                });
              }
            }
          } catch {
            // Ignore status check error and return existing reference
          }

          return NextResponse.json({
            success: true,
            status: "QUEUED",
            reference: row.checkout_request_id,
            merchant_reference: row.checkout_request_id,
            amount: Number(row.amount),
          });
        }
      }
    }

    if (!isPayheroConfigured()) {
      console.error("[PayHero Init] PayHero not configured — missing PAYHERO credentials in environment.");
      return NextResponse.json(
        { error: "Payments are temporarily unavailable. Try again in a few minutes or message us on WhatsApp." },
        { status: 500 }
      );
    }

    // Fee-float guard: PayHero deducts collection fees from the service wallet.
    // Empty float = payments fail. Block early with a clear message; warn below threshold.
    const minBalance = Number(process.env.PAYHERO_MIN_BALANCE || 50);
    const wallet = await getPayheroServiceWallet();
    if (wallet.ok && wallet.balance !== null) {
      if (wallet.balance <= 0) {
        alertLowPayheroWallet(
          wallet.balance,
          "Fee float is EMPTY — customer payments will fail right now."
        ).catch(() => {});
        return NextResponse.json(
          {
            error:
              "Mobile money payments are temporarily unavailable. Please use the manual till option below or contact support.",
          },
          { status: 503 }
        );
      }
      if (wallet.balance < minBalance) {
        alertLowPayheroWallet(wallet.balance, "Fee float is running low.").catch(() => {});
      }
    }

    let targetEvent: any = null;
    if (event_id) {
      const { getEventById } = await import("@/lib/supabase-db");
      targetEvent = await getEventById(Number(event_id));
    }
    if (!targetEvent) {
      targetEvent = await fetchActiveEvent();
    }

    const now = new Date();
    const availability = getEventAvailability(targetEvent, now);
    if (!availability.sellable) {
      return NextResponse.json(
        { error: unavailabilityMessage(availability.reason!) },
        { status: 400 }
      );
    }
    const eventId = targetEvent.id;

    const allTiers = await fetchTicketTiers(eventId);
    const matchedTier = allTiers.find((t) => t.id === ticket_type || t.name.toLowerCase() === ticket_type.toLowerCase());
    if (!matchedTier) {
      return NextResponse.json({ error: "Invalid ticket type selected." }, { status: 400 });
    }

    // Time window / capacity guard
    if (matchedTier.available_from && now < new Date(matchedTier.available_from)) {
      return NextResponse.json({ error: "This ticket tier is not yet available for purchase." }, { status: 400 });
    }
    if (matchedTier.available_until && now > new Date(matchedTier.available_until)) {
      return NextResponse.json({ error: "This ticket tier sale window has closed." }, { status: 400 });
    }
    if (matchedTier.max_quantity != null && (matchedTier.sold_count || 0) >= matchedTier.max_quantity) {
      return NextResponse.json({ error: "This ticket tier is sold out." }, { status: 400 });
    }
    const cost = matchedTier.price * Number(quantity);
    // PayHero expects whole KES shillings
    const amount = Math.round(cost);

    // Cryptographically secure reference generation
    const reference = "GL-" + crypto.randomBytes(6).toString("hex").toUpperCase();
    const mpesaPhone = normalizePayheroPhone(phone_number);
    const cleanIdempotencyKey = idempotency_key ? String(idempotency_key).trim() : null;

    // Atomic insert into pending_payments with UNIQUE idempotency_key
    try {
      await neonQuery(
        `INSERT INTO pending_payments (checkout_request_id, phone_number, ticket_type, quantity, buyer_name, amount, whatsapp_number, status, event_id, idempotency_key)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', $8, $9)`,
        [
          reference,
          phone_number,
          ticket_type,
          Number(quantity),
          buyer_name,
          cost,
          whatsapp_number || "",
          eventId,
          cleanIdempotencyKey,
        ]
      );
    } catch (insertErr: any) {
      // If unique constraint violation on idempotency_key (Postgres error code 23505)
      if (insertErr.code === "23505" && cleanIdempotencyKey) {
        const { rows } = await neonQuery(
          `SELECT checkout_request_id, status, ticket_id, amount
           FROM pending_payments
           WHERE idempotency_key = $1
           LIMIT 1`,
          [cleanIdempotencyKey]
        );
        if (rows && rows.length > 0) {
          const row = rows[0];
          return NextResponse.json({
            success: true,
            status: row.status === "completed" ? "completed" : "QUEUED",
            reference: row.checkout_request_id,
            merchant_reference: row.checkout_request_id,
            amount: Number(row.amount),
          });
        }
      }
      throw insertErr;
    }

    const stkRes = await initiatePayheroStkPush({
      customer_name: buyer_name,
      phone_number: mpesaPhone,
      amount,
      external_reference: reference,
      channel_id: Number(process.env.PAYHERO_CHANNEL_ID),
      provider: "m-pesa",
      network_code: "63902",
      callback_url: payheroCallbackUrl(),
    });

    if (!stkRes.ok) {
      console.error("PayHero STK push failed:", stkRes.error, stkRes.data);
      // Mark as failed in DB so it doesn't linger as pending
      await neonQuery(
        `UPDATE pending_payments SET status = 'failed' WHERE checkout_request_id = $1`,
        [reference]
      ).catch(() => {});

      const isUpstreamError =
        (stkRes.httpStatus && stkRes.httpStatus >= 500) ||
        (stkRes.error && (stkRes.error.includes("HTTP 5") || stkRes.error.includes("sql_failed")));

      const userMessage = isUpstreamError
        ? "Payments are temporarily unavailable. Try again in a few minutes or message us on WhatsApp."
        : (stkRes.error || "M-Pesa STK Push failed.");

      return NextResponse.json(
        { error: userMessage },
        { status: isUpstreamError ? 502 : 400 }
      );
    }

    return NextResponse.json({
      success: true,
      // PayHero reference for status polling
      reference: stkRes.data?.reference || reference,
      // Our own reference, kept for parity with the Paystack flow
      merchant_reference: reference,
      amount: cost,
      status: stkRes.data?.status || "QUEUED",
    });
  } catch (error: any) {
    console.error("PayHero initialize exception:", error);
    return NextResponse.json(
      { error: "Payments are temporarily unavailable. Try again in a few minutes or message us on WhatsApp." },
      { status: 500 }
    );
  }
}
