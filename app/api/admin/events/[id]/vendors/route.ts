import { NextResponse } from 'next/server';
import { query } from '@/lib/neon-client';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const resolvedParams = await params;
    const eventId = parseInt(resolvedParams.id, 10);
    if (isNaN(eventId)) {
      return NextResponse.json({ error: 'Invalid event ID' }, { status: 400 });
    }

    const { rows } = await query(
      `SELECT v.*, vea.id as assignment_id, vea.commission_rate, vea.flat_fee, vea.status as assignment_status, 
vea.total_sales, vea.commission_owed, vea.settled_amount
       FROM vendors v
       JOIN vendor_event_assignments vea ON v.id = vea.vendor_id
       WHERE vea.event_id = $1 AND v.deleted_at IS NULL
       ORDER BY v.name ASC`,
      [eventId]
    );

    return NextResponse.json(rows);
  } catch (err: any) {
    console.error('Error fetching vendors for event:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
