import { NextRequest, NextResponse } from "next/server";
import { neonQuery } from "@/lib/supabase-db";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const sessionCookie = request.cookies.get("goodlife_vendor_session");
    if (!sessionCookie || !sessionCookie.value) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const raw = sessionCookie.value.includes(".") ? sessionCookie.value.split(".")[0] : sessionCookie.value;
    let sessionData: any = null;
    try {
      sessionData = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    } catch {
      sessionData = JSON.parse(atob(raw));
    }

    const vendorId = sessionData?.vendorId || sessionData?.vendor_id;
    if (!vendorId) {
      return NextResponse.json({ error: "Invalid vendor session" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const eventIdParam = searchParams.get("eventId");
    let query = `
      SELECT ee.*, e.title as event_title, vo.name as operator_name
      FROM event_expenses ee
      LEFT JOIN events e ON e.id = ee.event_id
      LEFT JOIN vendor_operators vo ON vo.id = ee.operator_id
      WHERE ee.vendor_id = $1 AND ee.status != 'cancelled'
    `;
    const params: any[] = [vendorId];

    if (eventIdParam && eventIdParam !== "all") {
      const eid = parseInt(eventIdParam, 10);
      if (!isNaN(eid)) {
        query += ` AND ee.event_id = $2`;
        params.push(eid);
      }
    }

    query += ` ORDER BY ee.paid_at DESC, ee.created_at DESC`;

    const { rows } = await neonQuery(query, params);
    return NextResponse.json({ success: true, expenses: rows });
  } catch (err: any) {
    console.error("Vendor expenses fetch error:", err);
    return NextResponse.json({ error: err.message || "Failed to fetch vendor expenses" }, { status: 500 });
  }
}
