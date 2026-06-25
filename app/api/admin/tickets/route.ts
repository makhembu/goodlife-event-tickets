import { NextRequest, NextResponse } from "next/server";
import { fetchAllTickets, fetchDeletedTickets, createTicket } from "@/lib/supabase-db";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    if (searchParams.get("deleted") === "true") {
      const tickets = await fetchDeletedTickets();
      return NextResponse.json(tickets);
    }
    const tickets = await fetchAllTickets();
    return NextResponse.json(tickets);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const ticket = await createTicket(body);
    return NextResponse.json(ticket);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
