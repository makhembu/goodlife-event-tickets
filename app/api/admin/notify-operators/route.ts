import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";

export async function POST(request: NextRequest) {
  const authError = await requireAdmin();
  if (authError) return authError;
  try {
    const body = await request.json().catch(() => ({}));
    const { buyerName, ticketType, quantity, amountPaid, reference } = body;
    const { notifyOperators } = await import("@/lib/whatsapp");
    await notifyOperators(buyerName, ticketType, quantity, amountPaid, reference);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("notify-operators error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
