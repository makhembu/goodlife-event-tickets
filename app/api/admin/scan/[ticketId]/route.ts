import { NextRequest, NextResponse } from "next/server";
import { processTicketScan } from "@/lib/supabase-db";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ ticketId: string }> }
) {
  try {
    const { ticketId } = await params;
    const { scanned_by = "Admin Guard" } = await request.json().catch(() => ({}));

    if (!ticketId) {
      return NextResponse.json(
        { success: false, message: "Missing or invalid ticket identifier." },
        { status: 400 }
      );
    }

    const result = await processTicketScan(ticketId, scanned_by);

    if (result.success) {
      return NextResponse.json({
        success: true,
        message: result.message,
        ticket: result.ticket
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
