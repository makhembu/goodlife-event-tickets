import { NextRequest, NextResponse } from "next/server";
import { fetchActiveEvent, fetchAllEvents, neonQuery } from "@/lib/supabase-db";
import { checkRateLimit } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  const rl = checkRateLimit(request, "scanner-auth", { maxRequests: 15, windowMs: 15 * 60 * 1000 });
  if (!rl.allowed) return rl.response!;

  try {
    const body = await request.json().catch(() => ({}));
    const { pin, steward_name, gate_name, event_id } = body;

    if (!pin || typeof pin !== "string") {
      return NextResponse.json({ success: false, message: "PIN is required" }, { status: 400 });
    }

    // Gate PIN can be configured in event_details, via environment variable GATE_SCANNER_PIN, or defaults to 2026.
    // The master admin password (GoodlifeAdmin2026!) is also accepted as superuser bypass.
    let dbPin = "2026";
    try {
      const { rows } = await neonQuery("SELECT gate_pin FROM event_details WHERE id = 1 LIMIT 1");
      if (rows && rows.length > 0 && rows[0].gate_pin) {
        dbPin = String(rows[0].gate_pin).trim();
      }
    } catch {}

    const validPin = (process.env.GATE_SCANNER_PIN || "2026").trim();
    const masterAdminPass = "GoodlifeAdmin2026!";

    const isPinMatch = pin.trim() === dbPin || pin.trim() === validPin || pin.trim() === masterAdminPass;

    if (!isPinMatch) {
      return NextResponse.json({ success: false, message: "Invalid Gate Access PIN" }, { status: 401 });
    }

    const stewardName = (steward_name || "Gate Steward").trim();
    const gateName = (gate_name || "Main Gate").trim();

    // Resolve event
    let targetEventId = event_id ? Number(event_id) : null;
    let eventTitle = "GOODLIFE FESTIVAL";

    const allEvents = await fetchAllEvents();
    if (targetEventId) {
      const found = allEvents.find((e) => e.id === targetEventId);
      if (found) eventTitle = found.title;
    } else {
      const active = allEvents.find((e) => e.is_active) || allEvents[0];
      if (active) {
        targetEventId = active.id;
        eventTitle = active.title;
      }
    }

    const sessionData = {
      role: "scanner",
      stewardName,
      gateName,
      eventId: targetEventId,
      eventTitle,
      loginAt: new Date().toISOString()
    };

    const response = NextResponse.json({
      success: true,
      message: `Welcome, ${stewardName}! Gate terminal active at ${gateName}.`,
      session: sessionData
    });

    // Set secure scanner session cookie
    response.cookies.set("goodlife_scanner_session", btoa(JSON.stringify(sessionData)), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 16 // 16 hours
    });

    return response;
  } catch (error: any) {
    console.error("Scanner auth error:", error);
    return NextResponse.json({ success: false, message: "Authentication failed" }, { status: 500 });
  }
}
