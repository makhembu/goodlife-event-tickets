import { NextRequest, NextResponse } from "next/server";
import { fetchActiveEvent, fetchAllEvents } from "@/lib/supabase-db";

export async function GET(request: NextRequest) {
  const scannerCookie = request.cookies.get("goodlife_scanner_session")?.value;
  const adminCookie = request.cookies.get("goodlife_admin_session")?.value;

  if (scannerCookie) {
    try {
      const session = JSON.parse(atob(scannerCookie));
      return NextResponse.json({
        authenticated: true,
        role: "scanner",
        session
      });
    } catch {}
  }

  if (adminCookie === "true") {
    const active = await fetchActiveEvent();
    return NextResponse.json({
      authenticated: true,
      role: "admin",
      session: {
        role: "admin",
        stewardName: "Admin Master",
        gateName: "Main Gate",
        eventId: active?.id || null,
        eventTitle: active?.title || "GOODLIFE FESTIVAL"
      }
    });
  }

  return NextResponse.json({ authenticated: false, session: null }, { status: 401 });
}
