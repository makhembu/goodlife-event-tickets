import { NextRequest, NextResponse } from "next/server";
import { fulfillPayheroPayment, markPayheroPaymentFailed } from "@/lib/payhero-fulfill";

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
 * Auth: optional shared token via ?token= (PAYHERO_CALLBACK_TOKEN) or x-callback-token header.
 * Per docs: respond 200 quickly; heavy work happens after acknowledgement.
 */
export async function POST(request: NextRequest) {
  try {
    const expectedToken = process.env.PAYHERO_CALLBACK_TOKEN;
    if (expectedToken) {
      const url = new URL(request.url);
      const provided =
        url.searchParams.get("token") || request.headers.get("x-callback-token") || "";
      if (provided !== expectedToken) {
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

    if (status === "success") {
      const amountPaid = Number(payload?.amount) || 0;
      const providerReference = String(payload?.provider_reference || payload?.reference);

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
