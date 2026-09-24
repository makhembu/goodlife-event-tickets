import { NextRequest, NextResponse } from "next/server";
import { rejectPendingPayment } from "@/lib/supabase-db";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { checkout_request_id } = body;

    if (!checkout_request_id) {
      return NextResponse.json(
        { error: "Missing required field: checkout_request_id" },
        { status: 400 }
      );
    }

    const ok = await rejectPendingPayment(checkout_request_id);
    return NextResponse.json({ success: ok });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
