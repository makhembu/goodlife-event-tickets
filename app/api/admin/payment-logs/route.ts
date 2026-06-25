import { NextRequest, NextResponse } from "next/server";
import { fetchPaymentLogs } from "@/lib/supabase-db";

export async function GET() {
  try {
    const logs = await fetchPaymentLogs();
    return NextResponse.json(logs);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
