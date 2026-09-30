import { NextRequest, NextResponse } from "next/server";
import {
  updateTicketTier,
  deleteTicketTier,
  permanentlyDeleteTicketTier,
} from "@/lib/supabase-db";
import { requireAdmin } from "@/lib/admin-auth";

/** `ticket_tiers`' primary key is `(id, event_id)`, so an update without an
 *  event scope hits every event that shares the tier id. Required. */
function readEventScope(request: NextRequest): number | null {
  const parsed = Number.parseInt(new URL(request.url).searchParams.get("eventId") ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/**
 * `middleware.ts` already rejects non-GET on this path without a session, but
 * per AGENTS.md the matcher is an explicit allowlist and handlers must not rely
 * on it alone.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const unauthorized = await requireAdmin();
  if (unauthorized) return unauthorized;

  try {
    const { id } = await params;
    const eventId = readEventScope(request);
    if (!eventId) {
      return NextResponse.json(
        { error: "An eventId is required to update a ticket tier." },
        { status: 400 }
      );
    }

    const body = await request.json();
    const tier = await updateTicketTier(id, body, eventId);
    if (!tier) {
      return NextResponse.json(
        { error: "Ticket tier not found on that event" },
        { status: 404 }
      );
    }
    return NextResponse.json(tier);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const unauthorized = await requireAdmin();
  if (unauthorized) return unauthorized;

  try {
    const { id } = await params;
    const eventId = readEventScope(request);
    if (!eventId) {
      return NextResponse.json(
        { error: "An eventId is required to delete a ticket tier." },
        { status: 400 }
      );
    }

    const { searchParams } = new URL(request.url);
    const permanent = searchParams.get("permanent") === "true";

    const success = permanent
      ? await permanentlyDeleteTicketTier(id, eventId)
      : await deleteTicketTier(id, eventId);
    return NextResponse.json({ success });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}