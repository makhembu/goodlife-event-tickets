import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const url = process.env.WHATSAPP_GATEWAY_URL || "https://waha.darajadigital.com";
  const apiKey = process.env.WHATSAPP_API_KEY || "goodlife_waha_secret_2026";
  const sessionId = process.env.WHATSAPP_SESSION_ID || "default";

  try {
    const { phoneNumber, message } = await request.json();
    if (!phoneNumber) {
      return NextResponse.json({ error: "Phone number is required" }, { status: 400 });
    }

    let formattedPhone = phoneNumber.replace(/[^0-9]/g, "");
    if (formattedPhone.startsWith("0")) formattedPhone = "254" + formattedPhone.slice(1);
    if (formattedPhone.length === 9) formattedPhone = "254" + formattedPhone;

    const baseUrl = url.replace(/\/+$/, "");
    const testText = message || `🎉 GOODLIFE FESTIVAL — WhatsApp Gateway Test\n\nYour WhatsApp gateway is LIVE and operational on session: ${sessionId}.\nTimestamp: ${new Date().toISOString()}`;

    const res = await fetch(`${baseUrl}/api/sendText`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": apiKey
      },
      body: JSON.stringify({
        session: sessionId,
        chatId: `${formattedPhone}@c.us`,
        text: testText
      }),
      signal: AbortSignal.timeout(10000)
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return NextResponse.json({
        success: false,
        error: data.message || `WhatsApp Gateway returned HTTP ${res.status}`
      }, { status: res.status });
    }

    return NextResponse.json({
      success: true,
      message: `Test message dispatched to ${formattedPhone}`,
      data
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
