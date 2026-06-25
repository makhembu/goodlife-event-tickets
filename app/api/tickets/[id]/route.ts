import { NextRequest, NextResponse } from "next/server";
import { getTicketById } from "@/lib/supabase-db";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    // Next.js 15 requires awaiting dynamic route params
    const { id } = await params;
    const ticket = await getTicketById(id);
    
    if (!ticket) {
      return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
    }
    
    // Return only non-sensitive metadata for public rendering
    return NextResponse.json({
      id: ticket.id,
      ticket_type: ticket.ticket_type,
      amount_paid: ticket.amount_paid,
      buyer_name: ticket.buyer_name,
      purchase_time: ticket.purchase_time,
    }, { status: 200 });
  } catch (error: any) {
    console.error("Error fetching ticket metadata:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
