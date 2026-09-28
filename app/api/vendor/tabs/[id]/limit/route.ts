import { NextRequest, NextResponse } from "next/server";
import { updateTabCreditLimit } from "@/lib/supabase-db";

function getSession(request: NextRequest) {
  const sessionCookie = request.cookies.get("goodlife_vendor_session");
  if (!sessionCookie || !sessionCookie.value) return null;
  try {
    return JSON.parse(atob(sessionCookie.value));
  } catch {
    return null;
  }
}

async function handleUpdateLimit(
  request: NextRequest,
  params: Promise<{ id: string }>
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

    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ success: false, message: "Invalid JSON payload" }, { status: 400 });
    }

    const { newLimit } = body || {};
    const parsedLimit = Number(newLimit);

    if (isNaN(parsedLimit) || parsedLimit < 0) {
      return NextResponse.json({ success: false, message: "Invalid credit limit amount" }, { status: 400 });
    }

    // Vendor-ownership guard: operators may only modify their own vendor's tabs.
    const { fetchTabWithTransactions } = await import("@/lib/supabase-db");
    const tab = await fetchTabWithTransactions(tabId);
    if (!tab) {
      return NextResponse.json({ success: false, message: "Tab not found" }, { status: 404 });
    }
    if (tab.vendor_id && tab.vendor_id !== session.vendorId) {
      return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
    }

    const result = await updateTabCreditLimit(tabId, parsedLimit);

    if (result.success) {
      return NextResponse.json({
        success: true,
        message: "Credit limit updated successfully",
      });
    } else {
      return NextResponse.json(
        { success: false, message: result.message || "Failed to update credit limit" },
        { status: 400 }
      );
    }
  } catch (error: any) {
    console.error("Tab limit update error:", error);
    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return handleUpdateLimit(request, params);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return handleUpdateLimit(request, params);
}
