import { NextRequest, NextResponse } from "next/server";
import { sendTicketViaWhatsApp } from "@/lib/whatsapp";

export async function POST(request: NextRequest) {
  try {
    const { ticketId, phoneNumber } = await request.json();

    if (!ticketId || !phoneNumber) {
      return NextResponse.json(
        { error: "ticketId and phoneNumber are required" },
        { status: 400 }
      );
    }

    const sent = await sendTicketViaWhatsApp(ticketId, phoneNumber);

    if (!sent) {
      return NextResponse.json(
        { error: "WhatsApp gateway returned an error or is not configured" },
        { status: 502 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("send-whatsapp API error:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}
