import { NextRequest, NextResponse } from "next/server";
import { fetchAllEvents, createEvent } from "@/lib/supabase-db";

export async function GET(request: NextRequest) {
  try {
    const events = await fetchAllEvents();
    return NextResponse.json(events);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const event = await createEvent(body);
    return NextResponse.json(event, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
