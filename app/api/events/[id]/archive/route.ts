import { NextRequest, NextResponse } from "next/server";
import { archiveEvent, closeEvent, setActiveEvent } from "@/lib/supabase-db";

/**
 * Event lifecycle transitions.
 *
 * `mode` is explicit because the three actions are genuinely different and used
 * to be conflated:
 *
 *  - `activate` - make this the live homepage event, un-hiding it if archived.
 *  - `close`    - conclude it. It happened, payment stops, the recap page shows.
 *  - `archive`  - hide it from the public site entirely (404, off the switcher).
 *
 * The old body took a boolean `activate`, so "not activate" fell through to
 * `archiveEvent` - meaning the dashboard's END/CLOSE button archived the event
 * as well as closing it, and a concluded edition 404'd on the homepage.
 *
 * `activate: true` is still accepted so any older caller keeps working.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: idStr } = await params;
    const id = parseInt(idStr);
    if (Number.isNaN(id)) {
      return NextResponse.json({ error: "Invalid event id" }, { status: 400 });
    }
    const body = await request.json().catch(() => ({}));

    const mode: "activate" | "close" | "archive" =
      body.mode ??
      (body.activate ? "activate" : "archive");

    if (mode === "activate") {
      const success = await setActiveEvent(id);
      if (!success) {
        return NextResponse.json({ error: "Failed to activate event" }, { status: 500 });
      }
      return NextResponse.json({ success: true, message: "Event activated" });
    }

    if (mode === "close") {
      const success = await closeEvent(id);
      if (!success) {
        return NextResponse.json({ error: "Failed to close event" }, { status: 500 });
      }
      return NextResponse.json({ success: true, message: "Event closed" });
    }

    const success = await archiveEvent(id);
    if (!success) {
      return NextResponse.json({ error: "Failed to archive event" }, { status: 500 });
    }
    return NextResponse.json({ success: true, message: "Event archived" });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
