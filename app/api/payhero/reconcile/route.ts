import { NextRequest, NextResponse } from "next/server";
import { neonQuery } from "@/lib/supabase-db";
import {
  getPayheroTransactionStatus,
  payheroStatusIsSuccess,
  payheroStatusIsFailed,
} from "@/lib/payhero";
import { fulfillPayheroPayment, markPayheroPaymentFailed } from "@/lib/payhero-fulfill";

/**
 * Reconciliation Cron Job.
 * Can be called by Vercel Cron, GitHub Actions, or periodic monitoring.
 * Re-checks pending_payments older than 3 minutes (and younger than 24 hours).
 * Guarded by CRON_SECRET or ADMIN_PASSWORD.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET || process.env.ADMIN_PASSWORD;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    const url = new URL(request.url);
    const token = url.searchParams.get("secret");
    if (token !== cronSecret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    // Find pending payments created between 3 minutes ago and 24 hours ago
    const { rows: stalePending } = await neonQuery(
      `SELECT checkout_request_id, phone_number, ticket_type, quantity, buyer_name, amount, created_at, event_id
       FROM pending_payments
       WHERE status = 'pending'
         AND created_at < (NOW() - INTERVAL '3 minutes')
         AND created_at > (NOW() - INTERVAL '24 hours')
       ORDER BY created_at ASC
       LIMIT 25`
    );

    if (!stalePending || stalePending.length === 0) {
      return NextResponse.json({ message: "No stale pending payments to reconcile", count: 0 });
    }

    const results: Array<{ reference: string; outcome: string; status?: string }> = [];

    for (const payment of stalePending) {
      const ref = payment.checkout_request_id;
      try {
        const statusRes = await getPayheroTransactionStatus(ref);
        if (!statusRes.ok || !statusRes.data) {
          results.push({ reference: ref, outcome: "payhero_status_check_failed" });
          continue;
        }

        const data = statusRes.data;
        if (payheroStatusIsSuccess(data)) {
          const amountPaid = Number(data.amount) || Number(payment.amount) || 0;
          const providerReference = String(data.provider_reference || data.reference || ref);
          const fulfilled = await fulfillPayheroPayment({
            reference: ref,
            providerReference,
            amountPaid,
            source: "polling",
            raw: data,
          });
          results.push({ reference: ref, outcome: "fulfilled", status: "SUCCESS" });
        } else if (payheroStatusIsFailed(data)) {
          await markPayheroPaymentFailed(
            ref,
            data.message || data.result_desc || "Reconciliation marked failed",
            data
          );
          results.push({ reference: ref, outcome: "marked_failed", status: data.status });
        } else {
          // Documented QUEUED or unknown - if older than 30 minutes and still pending/queued in PayHero, mark timed out
          const createdAt = new Date(payment.created_at).getTime();
          const ageMinutes = (Date.now() - createdAt) / (1000 * 60);
          if (ageMinutes > 30) {
            await markPayheroPaymentFailed(
              ref,
              "Payment timed out after 30 minutes with no PIN entry",
              data
            );
            results.push({ reference: ref, outcome: "expired_over_30m", status: "TIMED_OUT" });
          } else {
            results.push({ reference: ref, outcome: "still_pending_in_payhero", status: data.status });
          }
        }
      } catch (err: any) {
        results.push({ reference: ref, outcome: "error: " + err.message });
      }
    }

    return NextResponse.json({
      success: true,
      reconciled_count: results.length,
      results,
    });
  } catch (error: any) {
    console.error("Reconciliation job error:", error);
    return NextResponse.json({ error: "Reconciliation failed: " + error.message }, { status: 500 });
  }
}
