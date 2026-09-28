import { NextRequest, NextResponse } from "next/server";
import {
  isPayheroConfigured,
  initiatePayheroStkPush,
  normalizePayheroPhone,
  payheroCallbackUrl,
} from "@/lib/payhero";

function getSession(request: NextRequest) {
  const sessionCookie = request.cookies.get("goodlife_vendor_session");
  if (!sessionCookie || !sessionCookie.value) return null;
  try {
    return JSON.parse(atob(sessionCookie.value));
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    let body: any;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ success: false, message: "Invalid JSON payload" }, { status: 400 });
    }

    const { phone, amount, reference } = body || {};

    const numAmount = Number(amount);
    if (!phone || isNaN(numAmount) || !Number.isFinite(numAmount) || numAmount <= 0) {
      return NextResponse.json(
        { success: false, message: "Valid positive amount and phone number are required." },
        { status: 400 }
      );
    }

    const normalizedPhone = normalizePayheroPhone(phone);
    if (!normalizedPhone || normalizedPhone.length !== 12 || !normalizedPhone.startsWith("254")) {
      return NextResponse.json(
        { success: false, message: "Invalid Kenyan phone number format. Please provide a valid Safaricom number (e.g. 0712345678 or 254712345678)." },
        { status: 400 }
      );
    }

    if (!isPayheroConfigured()) {
      return NextResponse.json(
        { success: false, message: "PayHero not configured — missing PAYHERO credentials." },
        { status: 500 }
      );
    }

    const channelId = Number(process.env.PAYHERO_CHANNEL_ID);
    if (!channelId) {
      return NextResponse.json(
        { success: false, message: "PayHero channel ID not configured." },
        { status: 500 }
      );
    }

    const wholeAmount = Math.round(numAmount);
    const finalReference = reference || "POS-" + Math.random().toString(36).substring(2, 10).toUpperCase();

    const stkRes = await initiatePayheroStkPush({
      customer_name: session.vendorName || "POS Customer",
      phone_number: normalizedPhone,
      amount: wholeAmount,
      external_reference: finalReference,
      channel_id: channelId,
      provider: "m-pesa",
      network_code: "63902",
      callback_url: payheroCallbackUrl(),
    });

    if (!stkRes.ok) {
      return NextResponse.json(
        {
          success: false,
          reference: finalReference,
          message: stkRes.error || "M-Pesa STK Push failed to initiate.",
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      reference: stkRes.data?.reference || finalReference,
      message: "STK push initiated successfully.",
    });
  } catch (error: any) {
    console.error("Vendor MPesa STK POST error:", error);
    return NextResponse.json(
      { success: false, message: error?.message || "Internal server error" },
      { status: 500 }
    );
  }
}
