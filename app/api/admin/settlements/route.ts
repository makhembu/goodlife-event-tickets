import { NextResponse } from 'next/server';
import { fetchSettlementsForEvent, recordSettlement, fetchActiveEvent, neonQuery } from '@/lib/supabase-db';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    let eventId = searchParams.get('eventId') ? parseInt(searchParams.get('eventId')!, 10) : null;
    
    if (!eventId) {
      const active = await fetchActiveEvent();
      if (active) {
        eventId = active.id;
      }
    }

    if (!eventId) {
      const { rows } = await neonQuery(
        `SELECT vea.*, v.name as vendor_name, e.title as event_title
         FROM vendor_event_assignments vea
         JOIN vendors v ON vea.vendor_id = v.id
         LEFT JOIN events e ON vea.event_id = e.id
         ORDER BY vea.created_at DESC`
      );
      return NextResponse.json(rows || []);
    }

    const settlements = await fetchSettlementsForEvent(eventId);
    return NextResponse.json(Array.isArray(settlements) ? settlements : []);
  } catch (err: any) {
    console.error('Error fetching settlements:', err);
    return NextResponse.json([], { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    let { assignmentId, vendor_id, event_id, amount } = body;

    if (!assignmentId && vendor_id && event_id) {
      const { rows } = await neonQuery(
        "SELECT id FROM vendor_event_assignments WHERE vendor_id = $1 AND event_id = $2 LIMIT 1",
        [vendor_id, event_id]
      );
      if (rows.length > 0) {
        assignmentId = rows[0].id;
      }
    }

    if (!assignmentId || amount === undefined) {
      return NextResponse.json({ error: 'Missing assignmentId or amount' }, { status: 400 });
    }

    const success = await recordSettlement(assignmentId, amount);
    if (!success) {
      return NextResponse.json({ error: 'Failed to record settlement' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('Error recording settlement:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
