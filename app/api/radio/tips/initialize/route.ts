import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  isPayheroConfigured,
  initiatePayheroStkPush,
  normalizePayheroPhone,
  payheroCallbackUrl,
  getPayheroServiceWallet,
} from "@/lib/payhero";
import { alertLowPayheroWallet } from "@/lib/payhero-alerts";
import { createRadioTip } from "@/lib/radio/ops-service";

export async function POST(request: NextRequest) {
  const rl = checkRateLimit(request, "radio-tip-init", { maxRequests: 5, windowMs: 60 * 1000 });
  if (!rl.allowed) return rl.response!;

  try {
    const body = await request.json().catch(() => ({}));
    const {
      phone,
      amount,
      sender_name = "Anonymous",
      message = "",
      slot_id,
      presenter_id,
    } = body;

    const tipAmount = Math.round(Number(amount));
    if (!phone || isNaN(tipAmount) || tipAmount < 10) {
      return NextResponse.json(
        { error: "Valid phone number and amount (minimum KES 10) are required." },
        { status: 400 }
      );
    }

    if (!isPayheroConfigured()) {
      return NextResponse.json(
        { error: "Tips are temporarily unavailable. Please try again later." },
        { status: 503 }
      );
    }

    // Fee-float check
    const minBalance = Number(process.env.PAYHERO_MIN_BALANCE || 50);
    const wallet = await getPayheroServiceWallet();
    if (wallet.ok && wallet.balance !== null) {
      if (wallet.balance <= 0) {
        alertLowPayheroWallet(wallet.balance, "Fee float is EMPTY — tip collections will fail.").catch(() => {});
        return NextResponse.json(
          { error: "Tips are temporarily unavailable. Please try again in a few minutes." },
          { status: 503 }
        );
      }
      if (wallet.balance < minBalance) {
        alertLowPayheroWallet(wallet.balance, "Fee float is running low.").catch(() => {});
      }
    }

    // Reference format: TIP-XXXX (e.g. TIP-A1B2C3D4)
    const reference = "TIP-" + crypto.randomBytes(4).toString("hex").toUpperCase();
    const mpesaPhone = normalizePayheroPhone(phone);
    const phoneHash = crypto.createHash("sha256").update(mpesaPhone).digest("hex");

    // Insert pending tip row
    await createRadioTip({
      reference,
      amount: tipAmount,
      phone: mpesaPhone,
      phone_hash: phoneHash,
      sender_name: sender_name.trim() || "Anonymous",
      message: message.trim() || null,
      slot_id: slot_id ? Number(slot_id) : null,
      presenter_id: presenter_id ? Number(presenter_id) : null,
    });

    // Initiate PayHero STK Push
    const stkRes = await initiatePayheroStkPush({
      customer_name: sender_name.trim() || "Radio Listener",
      phone_number: mpesaPhone,
      amount: tipAmount,
      external_reference: reference,
      channel_id: Number(process.env.PAYHERO_CHANNEL_ID),
      provider: "m-pesa",
      network_code: "63902",
      callback_url: payheroCallbackUrl(),
    });

    if (!stkRes.ok) {
      console.error("[Radio Tips] STK push failed:", stkRes.error, stkRes.data);
      const { markRadioTipFailed } = await import("@/lib/radio/ops-service");
      await markRadioTipFailed(reference, stkRes.error || "STK dispatch failed");
      return NextResponse.json(
        { error: "Could not send STK push. Please check your phone number and try again." },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      reference,
      amount: tipAmount,
      message: "STK push sent to your phone. Please enter your M-Pesa PIN to complete.",
    });
  } catch (error: any) {
    console.error("[Radio Tips] Error initializing tip:", error);
    return NextResponse.json({ error: "Failed to initiate tip" }, { status: 500 });
  }
}
