import { NextRequest, NextResponse } from "next/server";
import { fetchActiveEvent } from "@/lib/supabase-db";

export async function GET(request: NextRequest) {
  try {
    const event = await fetchActiveEvent();
    if (!event) {
      return NextResponse.json({ error: "No active event" }, { status: 404 });
    }
    return NextResponse.json(event);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
