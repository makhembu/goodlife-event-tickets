import { NextRequest, NextResponse } from "next/server";
import { updateTicketTier, deleteTicketTier } from "@/lib/supabase-db";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const tier = await updateTicketTier(id, body);
    if (!tier) {
      return NextResponse.json({ error: "Ticket tier not found" }, { status: 404 });
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
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const permanent = searchParams.get("permanent") === "true";

    let success = false;
    if (permanent) {
      const { permanentlyDeleteTicketTier } = await import("@/lib/supabase-db");
      success = await permanentlyDeleteTicketTier(id);
    } else {
      success = await deleteTicketTier(id);
    }
    return NextResponse.json({ success });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
