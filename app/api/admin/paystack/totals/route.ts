import { NextResponse } from "next/server";

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
const PAYSTACK_API = "https://api.paystack.co";

export async function GET() {
  if (!PAYSTACK_SECRET_KEY) {
    return NextResponse.json({ error: "Paystack not configured" }, { status: 500 });
  }

  try {
    const res = await fetch(`${PAYSTACK_API}/transaction/totals`, {
      headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}` },
    });
    const data = await res.json();
    return NextResponse.json(data);
  } catch (err: any) {
    console.error("Paystack totals fetch error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
