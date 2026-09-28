import { NextRequest, NextResponse } from "next/server";
import { fetchTabWithTransactions } from "@/lib/supabase-db";

function getSession(request: NextRequest) {
  const sessionCookie = request.cookies.get("goodlife_vendor_session");
  if (!sessionCookie || !sessionCookie.value) return null;
  try {
    return JSON.parse(atob(sessionCookie.value));
  } catch {
    return null;
  }
}

export async function GET(
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

    const tab = await fetchTabWithTransactions(tabId);
    if (!tab) {
      return NextResponse.json({ success: false, message: "Tab not found" }, { status: 404 });
    }

    // Ensure vendor can only view tabs belonging to their vendor account if vendor_id is present
    if (tab.vendor_id && tab.vendor_id !== session.vendorId) {
      return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json({
      success: true,
      tab,
    });
  } catch (error: any) {
    console.error("Tab GET error:", error);
    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
  }
}
