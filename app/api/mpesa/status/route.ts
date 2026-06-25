import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const checkoutRequestId = searchParams.get("checkoutRequestId");

  if (!checkoutRequestId) {
    return NextResponse.json({ error: "Missing checkoutRequestId" }, { status: 400 });
  }

  try {
    const { Pool } = require("pg");
    const _pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    });
    const { rows } = await _pool.query("SELECT status, ticket_id FROM pending_payments WHERE checkout_request_id = $1 LIMIT 1", [checkoutRequestId]);
    await _pool.end();

    if (rows.length === 0) {
      return NextResponse.json({ status: "not_found" });
    }

    return NextResponse.json({ status: rows[0].status, ticket_id: rows[0].ticket_id });
  } catch (error: any) {
    console.error("M-Pesa status query error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
