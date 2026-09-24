import { NextRequest, NextResponse } from "next/server";
import { fetchVendorItems, createVendorItem, fetchActiveEvent } from "@/lib/supabase-db";

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

    const items = await fetchVendorItems(session.vendorId, eventId);
    
    return NextResponse.json({
      success: true,
      items: items || []
    });
  } catch (error: any) {
    console.error("Vendor items GET error:", error);
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

    let { event_id, name, category, price, stock_qty, low_stock_threshold, image_url, modifiers, is_available, sort_order } = body || {};

    if (!event_id) {
      const activeEvent = await fetchActiveEvent();
      if (!activeEvent) {
        return NextResponse.json({ success: false, message: "No active event found" }, { status: 404 });
      }
      event_id = activeEvent.id;
    }

    if (!name || typeof name !== "string" || price === undefined || typeof price !== "number") {
      return NextResponse.json({ success: false, message: "Missing or invalid required fields: name, price" }, { status: 400 });
    }

    const newItem = await createVendorItem({
      vendor_id: session.vendorId,
      event_id,
      name,
      category: category || 'General',
      price,
      stock_qty: stock_qty !== undefined ? stock_qty : null,
      low_stock_threshold: low_stock_threshold || 5,
      image_url: image_url || '',
      modifiers: modifiers || [],
      is_available: is_available !== undefined ? is_available : true,
      sort_order: sort_order || 0
    });
    
    return NextResponse.json({
      success: true,
      item: newItem
    });
  } catch (error: any) {
    console.error("Vendor items POST error:", error);
    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
  }
}
