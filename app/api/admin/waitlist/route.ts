import { NextRequest, NextResponse } from "next/server";
import { fetchEventWaitlist, fetchActiveEvent } from "@/lib/supabase-db";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const eventIdParam = searchParams.get("eventId");
    let eventId = eventIdParam ? Number(eventIdParam) : null;
    if (!eventId) {
      const active = await fetchActiveEvent();
      eventId = active?.id || 1;
    }

    const waitlist = await fetchEventWaitlist(eventId);
    const total = waitlist.length;
    const unnotified = waitlist.filter((w: any) => !w.notified).length;

    return NextResponse.json({
      success: true,
      eventId,
      total,
      unnotified,
      waitlist
    });
  } catch (error: any) {
    console.error("Admin waitlist error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
