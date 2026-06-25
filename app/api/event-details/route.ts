import { NextRequest, NextResponse } from "next/server";
import { fetchEventDetails, updateEventDetails } from "@/lib/supabase-db";

export async function GET() {
  try {
    const details = await fetchEventDetails();
    return NextResponse.json(details);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const updated = await updateEventDetails(body);
    return NextResponse.json(updated);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
