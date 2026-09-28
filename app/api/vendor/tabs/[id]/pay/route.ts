import { NextRequest, NextResponse } from "next/server";
import { payTab } from "@/lib/supabase-db";

function getSession(request: NextRequest) {
  const sessionCookie = request.cookies.get("goodlife_vendor_session");
  if (!sessionCookie || !sessionCookie.value) return null;
  try {
    return JSON.parse(atob(sessionCookie.value));
  } catch {
    return null;
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    const resolvedParams = await params;
    const tabId = parseInt(resolvedParams.id, 10);
    if (isNaN(tabId)) {
      return NextResponse.json({ success: false, message: "Invalid tab ID" }, { status: 400 });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ success: false, message: "Invalid JSON payload" }, { status: 400 });
    }

    const { amount, method, mpesaRef } = body || {};
    const parsedAmount = Number(amount);

    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return NextResponse.json({ success: false, message: "Amount must be greater than zero" }, { status: 400 });
    }

    const validMethods = ["cash", "mpesa"];
    const paymentMethod = validMethods.includes(method) ? method : "cash";

    // Vendor-ownership guard: an operator may only record payments against tabs
    // belonging to their own vendor account.
    const { fetchTabWithTransactions } = await import("@/lib/supabase-db");
    const tab = await fetchTabWithTransactions(tabId);
    if (!tab) {
      return NextResponse.json({ success: false, message: "Tab not found" }, { status: 404 });
    }
    if (tab.vendor_id && tab.vendor_id !== session.vendorId) {
      return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
    }

    const success = await payTab(
      tabId,
      parsedAmount,
      paymentMethod,
      mpesaRef || "",
      session?.operatorId || null
    );

    if (success) {
      return NextResponse.json({
        success: true,
        message: `Payment of KES ${parsedAmount} via ${paymentMethod.toUpperCase()} recorded successfully!`
      });
    } else {
      return NextResponse.json({ success: false, message: "Failed to record tab payment" }, { status: 500 });
    }
  } catch (error: any) {
    console.error("Tab payment POST error:", error);
    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
  }
}
