import { NextRequest, NextResponse } from "next/server";
import { closeTab } from "@/lib/supabase-db";

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
    // own vendor account.
    const { fetchTabWithTransactions } = await import("@/lib/supabase-db");
    const tab = await fetchTabWithTransactions(tabId);
    if (!tab) {
      return NextResponse.json({ success: false, message: "Tab not found" }, { status: 404 });
    }
    if (tab.vendor_id && tab.vendor_id !== session.vendorId) {
      return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
    }

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
