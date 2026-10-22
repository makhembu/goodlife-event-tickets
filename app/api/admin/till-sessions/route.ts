import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { getTillSessionsForVendor } from "@/lib/supabase-db";

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth) return auth;
  const { searchParams } = new URL(request.url);
  const vendorId = Number(searchParams.get("vendorId"));
  const eventId = Number(searchParams.get("eventId"));
  if (!vendorId || !eventId) return NextResponse.json({ error: "vendorId and eventId required" }, { status: 400 });
  try {
    const sessions = await getTillSessionsForVendor(vendorId, eventId);
    return NextResponse.json({ sessions });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
