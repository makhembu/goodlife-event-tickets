import { NextRequest, NextResponse } from "next/server";
import { neonQuery } from "@/lib/supabase-db";

export const dynamic = "force-dynamic";

/**
 * GET /api/radio/shoutouts/mine
 * Returns the listener's own recent submissions using their goodlife_listener_id session cookie.
 * Allows the sender to track: Submitted -> Seen -> Read on Air / Queued / Played / Declined.
 */
export async function GET(req: NextRequest) {
  const listenerCookie = req.cookies.get("goodlife_listener_id")?.value;
  if (!listenerCookie) {
    return NextResponse.json([], { status: 200 });
  }

  try {
    const res = await neonQuery(
      `SELECT 
        s.id,
        s.sender_name,
        s.message,
        s.request_track,
        s.status,
        s.is_featured,
        s.request_status,
        s.created_at,
        p.dj_name as presenter_dj_name
       FROM radio_shoutouts s
       LEFT JOIN presenters p ON s.presenter_id = p.id
       WHERE s.sender_hash = $1
       ORDER BY s.created_at DESC
       LIMIT 5;`,
      [listenerCookie]
    );

    return NextResponse.json(res?.rows || [], {
      headers: { "Cache-Control": "private, no-cache" },
    });
  } catch (err: any) {
    return NextResponse.json([], { status: 200 });
  }
}
