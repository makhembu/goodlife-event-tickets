import { NextRequest, NextResponse } from "next/server";
import { getPayheroTransactionStatus } from "@/lib/payhero";
import { recordPayheroFailure } from "@/lib/rate-limit";

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

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const reference = searchParams.get("reference");

    if (!reference) {
      return NextResponse.json({ success: false, message: "Missing reference parameter" }, { status: 400 });
    }

    const session = getSession(request);
    // Public (unauthenticated) polling is allowed ONLY for self-pay tab references,
    // and those checks are read-only — crediting is done exclusively by the
    // PayHero webhook (single writer). POS references require a vendor session.
    if (!session && !reference.startsWith("TABPAY_")) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    const statusRes = await getPayheroTransactionStatus(reference);

    if (!statusRes.ok || !statusRes.data) {
      return NextResponse.json({
        success: false,
        status: "PENDING",
        message: statusRes.error || "Unable to retrieve status from payment provider.",
      });
    }

    const data = statusRes.data;
    const rawStatus = String(data.status || "PENDING").toUpperCase();

    if (rawStatus === "SUCCESS") {
      const mpesaCode = data.provider_reference || data.reference || reference;

      // NOTE: Deliberately READ-ONLY. The PayHero webhook is the single writer
      // that credits tab balances (app/api/payhero/callback). Auto-crediting here
      // as well would create a double-credit race with the webhook.

      return NextResponse.json({
        success: true,
        status: "SUCCESS",
        mpesa_code: String(mpesaCode),
        message: data.message || "Payment verified successfully",
      });
    }

    if (rawStatus === "FAILED" || rawStatus === "CANCELLED" || rawStatus === "TIMEOUT") {
      recordPayheroFailure({
        reference,
        reason: data.message || data.result_desc || `Payment ${rawStatus.toLowerCase()}`,
      });

      return NextResponse.json({
        success: false,
        status: rawStatus,
        message: data.message || data.result_desc || `Payment ${rawStatus.toLowerCase()}.`,
      });
    }

    return NextResponse.json({
      success: false,
      status: rawStatus || "PENDING",
      message: data.message || "Waiting for customer PIN entry...",
    });
  } catch (error: any) {
    console.error("Vendor MPesa status GET error:", error);
    return NextResponse.json(
      { success: false, status: "ERROR", message: error?.message || "Internal server error" },
      { status: 500 }
    );
  }
}
