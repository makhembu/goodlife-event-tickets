import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { fulfillRadioTip, markRadioTipFailed } from "@/lib/radio/ops-service";

export async function POST(request: NextRequest) {
  try {
    const rawExpected = process.env.PAYHERO_CALLBACK_TOKEN?.replace(/^["']|["']$/g, "").trim();
    if (rawExpected) {
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
    const reference: string = payload?.external_reference || payload?.reference || "";

    if (!reference) {
      return NextResponse.json({ message: "No reference — ignored" });
    }

    if (status === "success") {
      const amountPaid = Number(payload?.amount) || 0;
      const providerReference = String(payload?.provider_reference || payload?.reference || "");
      const payheroRef = String(payload?.reference || "");

      const result = await fulfillRadioTip({
        reference,
        payheroReference: payheroRef,
        mpesaReceipt: providerReference,
        amountPaid,
      });

      return NextResponse.json({ message: "Tip processed", ...result });
    } else {
      await markRadioTipFailed(reference, payload?.message || "Payment cancelled or failed");
      return NextResponse.json({ message: "Tip failed recorded", reference });
    }
  } catch (error: any) {
    console.error("[Radio Tips Callback] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
