import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { fulfillPayheroPayment, markPayheroPaymentFailed } from "@/lib/payhero-fulfill";
import { recordPayheroFailure } from "@/lib/rate-limit";
import { getPayheroTransactionStatus, payheroStatusIsSuccess } from "@/lib/payhero";
import { persistWebhookToOutbox } from "@/lib/webhook-outbox";

/**
 * PayHero payment webhook.
 * PayHero POSTs the final transaction result here (callback_url provided at initiate).
 *
 * Success payload (per docs):
 * {
 *   "success": true, "status": "success",
 *   "reference": "UFD004453187.iI",          <- PayHero reference
 *   "external_reference": "GL-XXXXXXXX",     <- our pending_payments.checkout_request_id
 *   "amount": 1, "currency": "KES",
 *   "provider_reference": "UFU51A2XO2",      <- real M-Pesa receipt code
 *   "provider": "mpesa_dc", "transaction_type": "inbound_payment"
 * }
 *
 * Failure payload: { "success": false, "status": "failed", "message": "..." , ... }
 *
 * Auth: shared token via ?token= (PAYHERO_CALLBACK_TOKEN) or x-callback-token / Authorization header.
 * Per docs: respond 200 quickly; heavy work happens after acknowledgement.
 */
export async function POST(request: NextRequest) {
  try {
    const rawExpected = process.env.PAYHERO_CALLBACK_TOKEN?.replace(/^["']|["']$/g, "").trim();
    if (!rawExpected) {
      console.warn("[payhero/callback] WARNING: PAYHERO_CALLBACK_TOKEN is unset on the server. Skipping token verification.");
    } else {
      const url = new URL(request.url);
      const queryToken = url.searchParams.get("token") || "";
      const headerToken =
        request.headers.get("x-callback-token") ||
        request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
        "";
      const provided = queryToken || headerToken;

      const provBuf = Buffer.from(provided);
      const expBuf = Buffer.from(rawExpected);
      if (provBuf.length !== expBuf.length || !timingSafeEqual(provBuf, expBuf)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    const rawBody = await request.text();
    let payload: any;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const status = String(payload?.status || (payload?.success ? "success" : "failed")).toLowerCase();
    // external_reference is our checkout_request_id; fall back to PayHero's reference
    const ourReference: string = payload?.external_reference || payload?.reference || "";

    if (!ourReference) {
      console.warn("PayHero callback without reference:", rawBody.slice(0, 300));
      return NextResponse.json({ message: "No reference — ignored" });
    }

    // Persist raw inbound payload to durable Postgres outbox table and Cloudflare R2
    // before performing transaction verification or fulfillment
    persistWebhookToOutbox(payload?.reference || "", ourReference, status, rawBody).catch((err) => {
      console.error("[PayHero Callback] Outbox persistence error:", err);
    });

    if (status === "success") {
      // Security re-verification: always query PayHero transaction-status endpoint
      // before fulfilling tickets to prevent forged callbacks or man-in-the-middle attacks.
      const lookupRef = payload?.reference || ourReference;
      const verifyCheck = await getPayheroTransactionStatus(lookupRef);
      if (!verifyCheck.ok || !verifyCheck.data || !payheroStatusIsSuccess(verifyCheck.data)) {
        console.warn("[PayHero Callback] Re-verification failed for ref:", lookupRef, verifyCheck);
        return NextResponse.json(
          { error: "Callback re-verification failed with PayHero" },
          { status: 400 }
        );
      }

      const verifiedData = verifyCheck.data;
      const amountPaid = Number(verifiedData.amount) || Number(payload?.amount) || 0;
      const providerReference = String(
        verifiedData.provider_reference || payload?.provider_reference || payload?.reference
      );

      // Check if this is a Tab Remote Self-Pay payment
      if (ourReference.startsWith("TABPAY_")) {
        const parts = ourReference.split("_");
        const tabId = parseInt(parts[1], 10);
        if (!isNaN(tabId)) {
          const { payTab, insertPaymentLog } = await import("@/lib/supabase-db");
          const credited = await payTab(
            tabId,
            amountPaid,
            "mpesa",
            providerReference,
            null
          );

          await insertPaymentLog({
            checkout_request_id: ourReference,
            mpesa_receipt: providerReference,
            phone_number: payload?.phone_number || "",
            amount: amountPaid,
            status: "success",
            result_desc: `PayHero callback tab payment credited: ${credited ? "success" : "failed"}`,
            raw_payload: payload,
          });

          return NextResponse.json({
            message: "Tab payment processed",
            tabId,
            credited,
            providerReference,
            amount: amountPaid,
          });
        }
      }

      // Check if this is a Vendor POS M-Pesa payment (reference starts with vendor prefix, not GL- or TABPAY_)
      if (!ourReference.startsWith("GL-") && !ourReference.startsWith("TABPAY_")) {
        const { query } = await import("@/lib/neon-client");
        const { rows: vendorRows } = await query(
          `SELECT id, name FROM vendors WHERE $1 LIKE (pay_ref_prefix || '%') AND pay_ref_prefix IS NOT NULL AND pay_ref_prefix != '' LIMIT 1`,
          [ourReference]
        );
        if (vendorRows.length > 0) {
          const { insertPaymentLog } = await import("@/lib/supabase-db");
          await insertPaymentLog({
            checkout_request_id: ourReference,
            mpesa_receipt: providerReference,
            phone_number: payload?.phone_number || "",
            amount: amountPaid,
            status: "success",
            result_desc: `Vendor POS M-Pesa: vendor_id=${vendorRows[0].id} (${vendorRows[0].name}) ref=${ourReference}`,
            raw_payload: payload,
          });
          return NextResponse.json({ message: "Vendor POS payment logged", ref: ourReference });
        }
      }

      const result = await fulfillPayheroPayment({
        reference: ourReference,
        providerReference,
        amountPaid,
        source: "callback",
        raw: payload,
      });

      return NextResponse.json({ message: "Processed", ...result });
    }

    // failed / cancelled
    recordPayheroFailure({
      phone: payload?.phone || payload?.phone_number,
      reference: ourReference,
      reason: payload?.message || payload?.result_desc || "PayHero callback failure",
    });

    await markPayheroPaymentFailed(
      ourReference,
      payload?.message || "PayHero callback reported failure",
      payload
    );
    return NextResponse.json({ message: "Failure recorded" });
  } catch (error: any) {
    console.error("PayHero callback error:", error);
    // Still 200 so PayHero doesn't retry forever; the failure is logged.
    return NextResponse.json({ message: "Internal error (logged)" }, { status: 200 });
  }
}
