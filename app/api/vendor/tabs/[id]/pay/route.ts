import { NextRequest, NextResponse } from "next/server";
import { payTab } from "@/lib/supabase-db";
import { getTabActor, tabOwnershipGuard } from "@/lib/vendor-tab-auth";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = getTabActor(request);
    if (!actor) {
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
    // belonging to their own vendor account. An admin may settle any tab.
    const { fetchTabWithTransactions } = await import("@/lib/supabase-db");
    const tab = await fetchTabWithTransactions(tabId);
    if (!tab) {
      return NextResponse.json({ success: false, message: "Tab not found" }, { status: 404 });
    }
    const forbidden = tabOwnershipGuard(tab.vendor_id, actor);
    if (forbidden) return forbidden;

    const success = await payTab(
      tabId,
      parsedAmount,
      paymentMethod,
      mpesaRef || "",
      actor.operatorId
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
