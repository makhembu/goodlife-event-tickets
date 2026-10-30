import { NextRequest, NextResponse } from "next/server";
import { checkPayheroStkRateLimit } from "@/lib/rate-limit";
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
    const raw = sessionCookie.value.includes(".") ? sessionCookie.value.split(".")[0] : sessionCookie.value;
    try {
      return JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    } catch {
      return JSON.parse(atob(raw));
    }
  } catch {
    return null;
  }
}

async function buildPosReference(vendorId: number, operatorName?: string): Promise<string> {
  try {
    const { query } = await import("@/lib/neon-client");
    const { rows } = await query(
      "SELECT pay_ref_prefix FROM vendors WHERE id = $1 LIMIT 1",
      [vendorId]
    );
    const prefix = rows[0]?.pay_ref_prefix || `VND${vendorId}`;
    const operatorSlug = (operatorName || "CASH")
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, 8);
    const short = Math.floor(1000 + Math.random() * 9000);
    return `${prefix}-${operatorSlug}-${short}`;
  } catch {
    return "POS-" + Math.random().toString(36).substring(2, 10).toUpperCase();
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

    // PayHero STK Abuse Protection (phone cooldown + frequency limits)
    const stkLimit = checkPayheroStkRateLimit({
      request,
      phoneNumber: normalizedPhone,
      scope: `vendor-pos:${session.vendorId}`,
    });
    if (!stkLimit.allowed) return stkLimit.response!;

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
    const finalReference = reference || await buildPosReference(session.vendorId, session.operatorName);

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
      const isUpstream =
        (stkRes.httpStatus && stkRes.httpStatus >= 500) ||
        (stkRes.error && (stkRes.error.includes("HTTP 5") || stkRes.error.includes("sql_failed")));
      return NextResponse.json(
        {
          success: false,
          reference: finalReference,
          message: isUpstream
            ? "M-Pesa payment service is temporarily unavailable. Please try again or collect cash."
            : (stkRes.error || "M-Pesa STK Push failed to initiate."),
        },
        { status: isUpstream ? 502 : 400 }
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
