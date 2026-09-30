import { NextRequest, NextResponse } from "next/server";
import { fulfillPayheroPayment, markPayheroPaymentFailed } from "@/lib/payhero-fulfill";
import { getPayheroTransactionStatus, payheroStatusIsSuccess, payheroStatusIsFailed } from "@/lib/payhero";
import { recordPayheroFailure } from "@/lib/rate-limit";

/**
 * Polling endpoint the checkout page hits while waiting for the customer's PIN entry.
 * Mirrors app/api/paystack/verify: DB-first, then a live PayHero status lookup.
 * Accepts either our merchant reference or PayHero's reference.
 */
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
      `SELECT status, ticket_id, buyer_name, phone_number, ticket_type, quantity, amount, whatsapp_number
       FROM pending_payments WHERE checkout_request_id = $1 LIMIT 1`,
      [reference]
    );

    // 1. Already completed in our database — return immediately
    if (rows.length > 0 && rows[0].status === "completed" && rows[0].ticket_id) {
      await pool.end();
      const ticketIds = String(rows[0].ticket_id)
        .split(",")
        .map((s: string) => s.trim())
        .filter(Boolean);
      return NextResponse.json({
        status: "completed",
        ticket_id: ticketIds[0],
        ticket_ids: ticketIds,
      });
    }

    // 2. Already marked failed — return immediately
    if (rows.length > 0 && rows[0].status === "failed") {
      await pool.end();
      return NextResponse.json({
        status: "failed",
        message: "Payment was declined or cancelled.",
      });
    }

    // 3. Fall back to a live PayHero status lookup
    const statusRes = await getPayheroTransactionStatus(reference);

    if (statusRes.ok && statusRes.data) {
      const d = statusRes.data;

      if (payheroStatusIsSuccess(d)) {
        const amountPaid = Number(d.amount) || Number(rows[0]?.amount) || 0;
        const providerReference = String(d.provider_reference || d.reference || reference);
        // Prefer our external_reference if PayHero echoes it; else assume `reference` IS ours
        const ourReference = String(d.external_reference || reference);

        const result = await fulfillPayheroPayment({
          reference: ourReference,
          providerReference,
          amountPaid,
          source: "polling",
          raw: d,
        });

        await pool.end().catch(() => {});

        if (result.fulfilled) {
          return NextResponse.json({
            status: "completed",
            ticket_id: result.ticketIds[0],
            ticket_ids: result.ticketIds,
          });
        }
        return NextResponse.json({ status: "pending" });
      }

      if (payheroStatusIsFailed(d)) {
        recordPayheroFailure({
          phone: (d as any).phone || (d as any).phone_number,
          reference: String(d.external_reference || reference),
          reason: d.message || d.result_desc || "Status check reported failure/cancellation",
        });

        const ourReference = String(d.external_reference || reference);
        await markPayheroPaymentFailed(
          ourReference,
          d.message || d.result_desc || "PayHero status polling reported failure",
          d
        );
        await pool.end();
        return NextResponse.json({
          status: "failed",
          message: d.message || d.result_desc || "Payment was declined or cancelled.",
        });
      }
    }

    await pool.end();
    return NextResponse.json({ status: "pending" });
  } catch (error: any) {
    console.error("PayHero verify error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
