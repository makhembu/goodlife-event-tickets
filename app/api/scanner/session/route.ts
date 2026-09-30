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

export async function PATCH(request: NextRequest) {
  const scannerCookie = request.cookies.get("goodlife_scanner_session")?.value;
  const adminCookie = request.cookies.get("goodlife_admin_session")?.value;

  if (!scannerCookie && adminCookie !== "true") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const { eventId, gateName, stewardName } = body;

    let existingSession: any = {};
    if (scannerCookie) {
      try {
        existingSession = JSON.parse(atob(scannerCookie));
      } catch {}
    }

    let eventTitle = existingSession.eventTitle || "GOODLIFE FESTIVAL";
    if (eventId) {
      const allEvents = await fetchAllEvents();
      const ev = allEvents.find((e) => e.id === Number(eventId));
      if (ev) eventTitle = ev.title;
    }

    const updatedSession = {
      role: existingSession.role || (adminCookie === "true" ? "admin" : "scanner"),
      stewardName: (stewardName || existingSession.stewardName || "Gate Steward").trim(),
      gateName: (gateName || existingSession.gateName || "Main Gate").trim(),
      eventId: eventId ? Number(eventId) : existingSession.eventId,
      eventTitle,
      updatedAt: new Date().toISOString()
    };

    const response = NextResponse.json({
      success: true,
      message: `Station switched to ${updatedSession.gateName} for ${updatedSession.eventTitle}`,
      session: updatedSession
    });

    response.cookies.set("goodlife_scanner_session", btoa(JSON.stringify(updatedSession)), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 16
    });

    return response;
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to update session" }, { status: 500 });
  }
}
