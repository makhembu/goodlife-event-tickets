import { NextRequest, NextResponse } from "next/server";
import { processTicketScan } from "@/lib/supabase-db";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ ticketId: string }> }
) {
  try {
    const { ticketId } = await params;
    if (!ticketId) {
      return NextResponse.json(
        { success: false, message: "Missing ticket identifier." },
        { status: 400 }
      );
    }
    const { getTicketById } = await import("@/lib/supabase-db");
    const ticket = await getTicketById(ticketId);
    if (!ticket) {
      return NextResponse.json(
        { success: false, message: "Ticket not found." },
        { status: 404 }
      );
    }
    return NextResponse.json({
      success: true,
      ticket: {
        id: ticket.id,
        ticket_type: ticket.ticket_type,
        buyer_name: ticket.buyer_name,
        is_scanned: ticket.is_scanned,
        scanned_at: ticket.scanned_at,
        scanned_by: ticket.scanned_by,
        guest_count: ticket.guest_count,
        admitted_count: ticket.admitted_count,
        event_id: ticket.event_id
      }
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ ticketId: string }> }
) {
  try {
    const { ticketId } = await params;
    const { scanned_by = "Admin Guard", event_id, admit_count = 1 } = await request.json().catch(() => ({}));

    if (!ticketId) {
      return NextResponse.json(
        { success: false, message: "Missing or invalid ticket identifier." },
        { status: 400 }
      );
    }

    const result = await processTicketScan(
      ticketId, 
      scanned_by, 
      event_id ? Number(event_id) : undefined,
      admit_count ? Number(admit_count) : 1
    );

    if (result.success) {
      return NextResponse.json({
        success: true,
        message: result.message,
        ticket: result.ticket,
        camping_instruction: result.camping_instruction,
        admitted_count: result.admitted_count,
        guest_count: result.guest_count
      }, { status: 200 });
    } else {
      return NextResponse.json({
        success: false,
        alreadyScanned: result.alreadyScanned,
        message: result.message,
        ticket: result.ticket
      }, { status: 200 }); // Retaining 200 HTTP for logical scan responses is cleaner for client-side diagnostics
    }

  } catch (error: any) {
    console.error("Gate verification error:", error);
    return NextResponse.json(
      { success: false, message: "Internal scanning system error: " + error.message },
      { status: 500 }
    );
  }
}
