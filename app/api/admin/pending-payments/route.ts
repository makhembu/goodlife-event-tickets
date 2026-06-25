import { NextRequest, NextResponse } from "next/server";
import { fetchAllPendingPayments, resolvePendingPayment } from "@/lib/supabase-db";

export async function GET() {
  try {
    const payments = await fetchAllPendingPayments();
    return NextResponse.json(payments);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { checkout_request_id, mpesa_receipt, amount_paid } = body;

    if (!checkout_request_id || !mpesa_receipt || !amount_paid) {
      return NextResponse.json(
        { error: "Missing required fields: checkout_request_id, mpesa_receipt, amount_paid" },
        { status: 400 }
      );
    }

    const result = await resolvePendingPayment(checkout_request_id, mpesa_receipt, amount_paid);
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
