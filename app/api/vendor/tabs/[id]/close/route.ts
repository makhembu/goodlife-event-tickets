import { NextRequest, NextResponse } from "next/server";
import { closeTab } from "@/lib/supabase-db";
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
    const tabId = parseInt(resolvedParams.id);
    if (isNaN(tabId)) {
      return NextResponse.json({ success: false, message: "Invalid tab ID" }, { status: 400 });
    }

    let body = {};
    try {
      body = await request.json();
    } catch {
      // body optional if balance is zero
    }

    const { settlementReason } = (body as any) || {};

    // Vendor-ownership guard: operators may only close tabs belonging to their
    // own vendor account. An admin may close any tab.
    const { fetchTabWithTransactions } = await import("@/lib/supabase-db");
    const tab = await fetchTabWithTransactions(tabId);
    if (!tab) {
      return NextResponse.json({ success: false, message: "Tab not found" }, { status: 404 });
    }
    const forbidden = tabOwnershipGuard(tab.vendor_id, actor);
    if (forbidden) return forbidden;

    // Mandatory write-off reason for closing a tab with an outstanding balance.
    if (Number(tab.balance) > 0 && !(settlementReason || "").trim()) {
      return NextResponse.json(
        { success: false, message: "Settlement reason is required to close a tab with an outstanding balance." },
        { status: 400 }
      );
    }

    const success = await closeTab(tabId, settlementReason || "");

    if (success) {
      return NextResponse.json({
        success: true,
        message: "Tab settled",
      });
    } else {
      return NextResponse.json({ success: false, message: "Failed to close tab" }, { status: 500 });
    }
  } catch (error: any) {
    console.error("Tab close POST error:", error);
    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
  }
}
