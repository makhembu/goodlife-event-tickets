import { NextRequest, NextResponse } from "next/server";
import { archiveEvent, setActiveEvent } from "@/lib/supabase-db";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: idStr } = await params;
    const id = parseInt(idStr);
    const body = await request.json().catch(() => ({}));

    // If activate flag is set, set as active event
    if (body.activate) {
      const success = await setActiveEvent(id);
      if (!success) {
        return NextResponse.json({ error: "Failed to activate event" }, { status: 500 });
      }
      return NextResponse.json({ success: true, message: "Event activated" });
    }

    // Otherwise, archive the event
    const success = await archiveEvent(id);
    if (!success) {
      return NextResponse.json({ error: "Failed to archive event" }, { status: 500 });
    }
    return NextResponse.json({ success: true, message: "Event archived" });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
