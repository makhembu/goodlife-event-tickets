import { NextRequest, NextResponse } from "next/server";
import { createPosSale, fetchActiveEvent } from "@/lib/supabase-db";

// Helper to get session data
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

export async function POST(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ success: false, message: "Invalid JSON payload" }, { status: 400 });
    }
    
    let { event_id, subtotal, total, notes, items, payments, splitPayments } = body || {};
    payments = payments || splitPayments;

    if (!event_id) {
      const activeEvent = await fetchActiveEvent();
      if (!activeEvent) {
        return NextResponse.json({ success: false, message: "No active event found" }, { status: 404 });
      }
      event_id = activeEvent.id;
    }

    if (!Array.isArray(items) || items.length === 0 || !Array.isArray(payments) || payments.length === 0) {
      return NextResponse.json({ success: false, message: "Missing or invalid items or payments data" }, { status: 400 });
    }
    
    if (typeof subtotal !== 'number' || typeof total !== 'number') {
      return NextResponse.json({ success: false, message: "Invalid subtotal or total" }, { status: 400 });
    }

    // Generate POS Sale ID
    const random4 = Math.floor(1000 + Math.random() * 9000);
    const saleId = `POS-${Date.now()}-${random4}`;

    const sale = {
      id: saleId,
      vendor_id: session.vendorId,
      event_id,
      operator_id: session.operatorId,
      subtotal,
      total,
      notes: notes || ""
    };

    const formattedPayments = payments.map((p: any) => ({
      method: p.method,
      amount: Number(p.amount),
      payer_name: p.payer_name || "",
      payer_phone: p.payer_phone || "",
      mpesa_ref: p.mpesa_ref || "",
      tab_id: p.tab_id ? Number(p.tab_id) : null,
    }));

    const success = await createPosSale(sale, items, formattedPayments);

    if (success) {
      return NextResponse.json({
        success: true,
        saleId,
        message: "Sale completed successfully"
      });
    } else {
      return NextResponse.json({ success: false, message: "Failed to create sale" }, { status: 500 });
    }
  } catch (error: any) {
    console.error("Vendor checkout POST error:", error);
    return NextResponse.json({ success: false, message: error.message || "Failed to process sale" }, { status: 400 });
  }
}
