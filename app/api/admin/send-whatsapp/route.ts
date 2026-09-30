import { NextRequest, NextResponse } from "next/server";
import { sendTicketViaWhatsApp } from "@/lib/whatsapp";
import { getTicketById } from "@/lib/supabase-db";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { ticketId, phoneNumber } = body;

    if (!ticketId || !phoneNumber) {
      return NextResponse.json(
        { error: "ticketId and phoneNumber are required" },
        { status: 400 }
      );
    }

    const ticket = await getTicketById(ticketId);
    const buyerName = ticket?.buyer_name || "";
    const sent = await sendTicketViaWhatsApp(ticketId, phoneNumber, buyerName);

    if (!sent) {
      return NextResponse.json(
        { error: "WhatsApp gateway returned an error or is not configured" },
        { status: 500 }
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
