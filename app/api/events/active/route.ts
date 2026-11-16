import { NextRequest, NextResponse } from "next/server";
import { fetchActiveEvent } from "@/lib/supabase-db";

export async function GET(request: NextRequest) {
  try {
    const event = await fetchActiveEvent();
    return NextResponse.json(event ?? null, { status: 200 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
