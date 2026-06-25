import { NextRequest, NextResponse } from "next/server";
import { fetchTicketTiers, fetchDeletedTicketTiers, createTicketTier } from "@/lib/supabase-db";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    if (searchParams.get("deleted") === "true") {
      const tiers = await fetchDeletedTicketTiers();
      return NextResponse.json(tiers);
    }
    const tiers = await fetchTicketTiers();
    return NextResponse.json(tiers);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const tier = await createTicketTier(body);
    return NextResponse.json(tier);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
