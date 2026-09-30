import { NextResponse } from "next/server";

export async function GET() {
  const url = process.env.WHATSAPP_GATEWAY_URL || "https://waha.darajadigital.com";
  const apiKey = process.env.WHATSAPP_API_KEY || "goodlife_waha_secret_2026";
  const sessionId = process.env.WHATSAPP_SESSION_ID || "default";

  try {
    const baseUrl = url.replace(/\/+$/, "");

    // 1. Check version / heartbeat
    let versionData: any = null;
    try {
      const vRes = await fetch(`${baseUrl}/api/server/version`, {
        headers: { "X-Api-Key": apiKey },
        signal: AbortSignal.timeout(5000)
      });
      if (vRes.ok) {
        versionData = await vRes.json();
      }
    } catch (e: any) {
      console.warn("WAHA version check failed:", e?.message);
    }

    // 2. Check session status
    let sessionData: any = null;
    try {
      const sRes = await fetch(`${baseUrl}/api/sessions/${sessionId}`, {
        headers: { "X-Api-Key": apiKey },
        signal: AbortSignal.timeout(5000)
      });
      if (sRes.ok) {
        sessionData = await sRes.json();
      }
    } catch (e: any) {
      console.warn("WAHA session check failed:", e?.message);
    }

    const isOnline = Boolean(versionData || sessionData);
    const sessionStatus = sessionData?.status || (isOnline ? "STARTING" : "OFFLINE");
    const me = sessionData?.me || null;

    return NextResponse.json({
      online: isOnline,
      status: sessionStatus,
      me,
      sessionId,
      gatewayUrl: baseUrl,
      version: versionData?.version || null,
      engine: versionData?.engine || "WEBJS"
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        online: false,
        status: "ERROR",
        error: error.message,
        sessionId,
        gatewayUrl: url
      },
      { status: 500 }
    );
  }
}
