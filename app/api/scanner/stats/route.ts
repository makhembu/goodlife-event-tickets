import { NextRequest, NextResponse } from "next/server";
import { neonQuery, fetchActiveEvent } from "@/lib/supabase-db";

export async function GET(request: NextRequest) {
  try {
    const scannerCookie = request.cookies.get("goodlife_scanner_session")?.value;
    const adminCookie = request.cookies.get("goodlife_admin_session")?.value;

    if (!scannerCookie && adminCookie !== "true") {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    let stewardGate = "";
    if (scannerCookie) {
      try {
        const parsed = JSON.parse(atob(scannerCookie));
        stewardGate = parsed.stewardName || "";
      } catch {}
    }

    const { searchParams } = new URL(request.url);
    let eventId = searchParams.get("eventId") ? Number(searchParams.get("eventId")) : null;
    const query = searchParams.get("q")?.trim() || "";

    if (!eventId) {
      const active = await fetchActiveEvent();
      eventId = active?.id || null;
    }

    if (!eventId) {
      return NextResponse.json({ success: false, message: "No event found" }, { status: 404 });
    }

    // If query is provided, search tickets for this event
    if (query) {
      const cleanPhone = query.replace(/\D/g, "");
      let searchQuery = `
        SELECT 
          id, 
          ticket_type, 
          buyer_name, 
          phone_number, 
          mpesa_receipt, 
          is_scanned, 
          scanned_at, 
          scanned_by, 
          guest_count, 
          admitted_count, 
          is_camping, 
          camping_type
        FROM tickets 
        WHERE event_id = $1 AND deleted_at IS NULL AND (
          LOWER(id) LIKE LOWER($2) OR
          LOWER(buyer_name) LIKE LOWER($2) OR
          LOWER(mpesa_receipt) LIKE LOWER($2)
      `;
      const searchParamsArr: any[] = [eventId, `%${query}%`];

      if (cleanPhone && cleanPhone.length >= 6) {
        searchParamsArr.push(`%${cleanPhone}%`);
        searchQuery += ` OR phone_number LIKE $${searchParamsArr.length}`;
      }

      searchQuery += `) ORDER BY is_scanned ASC, purchase_time DESC LIMIT 30`;

      const { rows: searchResults } = await neonQuery(searchQuery, searchParamsArr);

      return NextResponse.json({
        success: true,
        tickets: searchResults
      });
    }

    // Gate Stats calculation
    const { rows: statsRows } = await neonQuery(
      `SELECT 
         COUNT(*) as total_tickets,
         COUNT(CASE WHEN is_scanned = TRUE THEN 1 END) as total_scanned,
         COALESCE(SUM(guest_count), 0) as total_expected_guests,
         COALESCE(SUM(admitted_count), 0) as total_admitted_guests,
         COUNT(CASE WHEN is_camping = TRUE OR camping_type != 'none' THEN 1 END) as total_camping
       FROM tickets 
       WHERE event_id = $1 AND deleted_at IS NULL`,
      [eventId]
    );

    // Recent scans for this event
    const { rows: recentRows } = await neonQuery(
      `SELECT 
         id, 
         ticket_type, 
         buyer_name, 
         phone_number, 
         mpesa_receipt, 
         is_scanned, 
         scanned_at, 
         scanned_by, 
         guest_count, 
         admitted_count, 
         is_camping, 
         camping_type
       FROM tickets 
       WHERE event_id = $1 AND scanned_at IS NOT NULL AND deleted_at IS NULL
       ORDER BY scanned_at DESC 
       LIMIT 20`,
      [eventId]
    );

    const stats = statsRows[0] || {};

    return NextResponse.json({
      success: true,
      stats: {
        total_tickets: Number(stats.total_tickets || 0),
        total_scanned: Number(stats.total_scanned || 0),
        total_expected_guests: Number(stats.total_expected_guests || 0),
        total_admitted_guests: Number(stats.total_admitted_guests || 0),
        total_camping: Number(stats.total_camping || 0)
      },
      recent_scans: recentRows
    });

  } catch (error: any) {
    console.error("Scanner stats error:", error);
    return NextResponse.json({ success: false, message: error.message || "Failed to load gate stats" }, { status: 500 });
  }
}
