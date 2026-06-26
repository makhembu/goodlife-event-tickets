import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const { buyerName, ticketType, quantity, amountPaid, reference } = await request.json();
    const { notifyOperators } = await import("@/lib/whatsapp");
    await notifyOperators(buyerName, ticketType, quantity, amountPaid, reference);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("notify-operators error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
