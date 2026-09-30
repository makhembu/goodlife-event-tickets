import { NextResponse } from 'next/server';
import { fetchSettlementsForEvent, recordSettlement, fetchActiveEvent, neonQuery } from '@/lib/supabase-db';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const eventParam = searchParams.get('eventId');
    
    let eventId: number | null = null;
    if (eventParam && eventParam !== 'all' && eventParam !== '') {
      const parsed = parseInt(eventParam, 10);
      if (!isNaN(parsed) && parsed > 0) {
        eventId = parsed;
      }
    } else if (eventParam === null) {
      // Default to active event only when param is not passed at all
      const active = await fetchActiveEvent();
      if (active) {
        eventId = active.id;
      }
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
    let { assignmentId, vendor_id, event_id, amount, mode } = body;

    if ((!assignmentId || assignmentId === 0) && vendor_id && event_id) {
      const { rows } = await neonQuery(
        "SELECT id FROM vendor_event_assignments WHERE vendor_id = $1 AND event_id = $2 LIMIT 1",
        [vendor_id, event_id]
      );
      if (rows.length > 0) {
        assignmentId = rows[0].id;
      } else {
        const { rows: newAss } = await neonQuery(
          `INSERT INTO vendor_event_assignments (vendor_id, event_id, commission_rate, total_sales, commission_owed, settled_amount, status)
           VALUES ($1, $2, 10.0, 0, 0, 0, 'active')
           RETURNING id`,
          [vendor_id, event_id]
        );
        if (newAss.length > 0) {
          assignmentId = newAss[0].id;
        }
      }
    }

    if (!assignmentId || amount === undefined) {
      return NextResponse.json({ error: 'Missing assignmentId or amount' }, { status: 400 });
    }

    const success = await recordSettlement(assignmentId, amount, mode || 'add');
    if (!success) {
      return NextResponse.json({ error: 'Failed to record settlement' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('Error recording settlement:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
