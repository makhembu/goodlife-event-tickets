import { NextRequest, NextResponse } from "next/server";
import { approveTillPayment } from "@/lib/supabase-db";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { checkout_request_id, mpesa_reference } = body;

    if (!checkout_request_id || !mpesa_reference) {
      return NextResponse.json(
        { error: "Missing required fields: checkout_request_id, mpesa_reference" },
        { status: 400 }
      );
    }

    const result = await approveTillPayment(checkout_request_id, mpesa_reference);
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
