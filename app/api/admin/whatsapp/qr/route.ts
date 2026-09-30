import { NextResponse } from "next/server";

export async function GET() {
  const url = process.env.WHATSAPP_GATEWAY_URL || "https://waha.darajadigital.com";
  const apiKey = process.env.WHATSAPP_API_KEY || "goodlife_waha_secret_2026";
  const sessionId = process.env.WHATSAPP_SESSION_ID || "default";

  try {
    const baseUrl = url.replace(/\/+$/, "");

    // Check session status first
    const sRes = await fetch(`${baseUrl}/api/sessions/${sessionId}`, {
      headers: { "X-Api-Key": apiKey },
      signal: AbortSignal.timeout(6000)
    });

    if (!sRes.ok) {
      return NextResponse.json({
        status: "NOT_FOUND",
        message: `Session '${sessionId}' is not active or starting up.`
      }, { status: 502 });
    }

    const sessionData = await sRes.json();
    if (sessionData.status === "WORKING" || sessionData.status === "CONNECTED" || sessionData.me) {
      return NextResponse.json({
        status: "CONNECTED",
        me: sessionData.me,
        sessionId
      });
    }

    // Fetch live QR code (raw format)
    const qrRes = await fetch(`${baseUrl}/api/${sessionId}/auth/qr?format=raw`, {
      headers: { "X-Api-Key": apiKey },
      signal: AbortSignal.timeout(6000)
    });

    if (!qrRes.ok) {
      return NextResponse.json({
        status: sessionData.status || "SCAN_QR_CODE",
        qrRaw: null,
        message: "Waiting for QR generation from WhatsApp engine..."
      });
    }

    const qrData = await qrRes.json();

    return NextResponse.json({
      status: "SCAN_QR_CODE",
      qrRaw: qrData.value || null,
      sessionId,
      timestamp: Date.now()
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        status: "ERROR",
        error: error.message
      },
      { status: 500 }
    );
  }
}
