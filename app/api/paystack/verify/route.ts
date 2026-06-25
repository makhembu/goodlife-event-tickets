import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const reference = searchParams.get("reference");

  if (!reference) {
    return NextResponse.json({ error: "Missing reference" }, { status: 400 });
  }

  try {
    const { Pool } = require("pg");
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    });
    const { rows } = await pool.query(
      "SELECT status, ticket_id FROM pending_payments WHERE checkout_request_id = $1 LIMIT 1",
      [reference]
    );
    await pool.end();

    if (rows.length === 0) {
      return NextResponse.json({ status: "pending" });
    }

    return NextResponse.json({
      status: rows[0].status,
      ticket_id: rows[0].ticket_id,
    });
  } catch (error: any) {
    console.error("Paystack verify error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
