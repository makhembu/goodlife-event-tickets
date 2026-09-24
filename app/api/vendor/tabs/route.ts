import { NextRequest, NextResponse } from "next/server";
import { fetchTabsForVendor, createTab, fetchActiveEvent } from "@/lib/supabase-db";

// Helper to get session data
function getSession(request: NextRequest) {
  const sessionCookie = request.cookies.get("goodlife_vendor_session");
  if (!sessionCookie || !sessionCookie.value) return null;
  try {
    return JSON.parse(atob(sessionCookie.value));
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    let eventId = searchParams.get("eventId") ? parseInt(searchParams.get("eventId")!) : null;

    if (!eventId) {
      const activeEvent = await fetchActiveEvent();
      if (!activeEvent) {
        return NextResponse.json({ success: false, message: "No active event found" }, { status: 404 });
      }
      eventId = activeEvent.id;
    }

    const tabs = await fetchTabsForVendor(session.vendorId, eventId);
    
    return NextResponse.json({
      success: true,
      tabs: tabs || []
    });
  } catch (error: any) {
    console.error("Vendor tabs GET error:", error);
    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
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
    
    let { event_id, customer_name, customer_phone, credit_limit } = body || {};

    if (!event_id) {
      const activeEvent = await fetchActiveEvent();
      if (!activeEvent) {
        return NextResponse.json({ success: false, message: "No active event found" }, { status: 404 });
      }
      event_id = activeEvent.id;
    }

    if (!customer_name || typeof customer_name !== "string") {
      return NextResponse.json({ success: false, message: "Missing or invalid customer_name" }, { status: 400 });
    }
    
    if (credit_limit !== undefined && typeof credit_limit !== "number") {
      return NextResponse.json({ success: false, message: "Invalid credit_limit" }, { status: 400 });
    }

    const newTab = await createTab({
      customer_name,
      customer_phone: customer_phone || "",
      vendor_id: session.vendorId,
      event_id,
      credit_limit: credit_limit || 5000
    });
    
    return NextResponse.json({
      success: true,
      tab: newTab
    });
  } catch (error: any) {
    console.error("Vendor tabs POST error:", error);
    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
  }
}
