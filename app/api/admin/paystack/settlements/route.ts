import { NextRequest, NextResponse } from "next/server";

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
const PAYSTACK_API = "https://api.paystack.co";

export async function GET(request: NextRequest) {
  if (!PAYSTACK_SECRET_KEY) {
    return NextResponse.json({ error: "Paystack not configured" }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const perPage = searchParams.get("perPage") || "10";
  const page = searchParams.get("page") || "1";
  const from = searchParams.get("from") || "";
  const to = searchParams.get("to") || "";

  let query = `perPage=${perPage}&page=${page}`;
  if (from) query += `&from=${from}`;
  if (to) query += `&to=${to}`;

  try {
    const res = await fetch(`${PAYSTACK_API}/settlement?${query}`, {
      headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}` },
    });
    const data = await res.json();
    return NextResponse.json(data);
  } catch (err: any) {
    console.error("Paystack settlements fetch error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
