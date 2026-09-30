import { NextRequest, NextResponse } from "next/server";
import { fetchEventCustomers, fetchActiveEvent, neonQuery } from "@/lib/supabase-db";

// Helper to extract vendor session
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

export async function GET(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    let eventId = searchParams.get("eventId") ? parseInt(searchParams.get("eventId")!) : null;

    if (!eventId) {
      // Check if vendor has an active assignment
      try {
        const { rows } = await neonQuery(
          "SELECT event_id FROM vendor_event_assignments WHERE vendor_id = $1 AND status = 'active' ORDER BY id DESC LIMIT 1",
          [session.vendorId]
        );
        if (rows.length > 0 && rows[0].event_id) {
          eventId = rows[0].event_id;
        }
      } catch (err) {
        console.error("Error looking up vendor assignment for customers:", err);
      }
    }

    if (!eventId) {
      const activeEvent = await fetchActiveEvent();
      if (!activeEvent) {
        return NextResponse.json({ success: false, message: "No active event found" }, { status: 404 });
      }
      eventId = activeEvent.id;
    }

    const q = searchParams.get("q") || "";
    const customers = await fetchEventCustomers(eventId, q);

    return NextResponse.json({
      success: true,
      eventId,
      customers: customers || []
    });
  } catch (error: any) {
    console.error("Vendor customers GET error:", error);
    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
  }
}
