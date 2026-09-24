import { NextResponse } from 'next/server';
import { fetchSettlementsForEvent, recordSettlement } from '@/lib/supabase-db';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const eventId = searchParams.get('eventId');
    
    if (!eventId) {
      return NextResponse.json({ error: 'Missing eventId' }, { status: 400 });
    }

    const settlements = await fetchSettlementsForEvent(parseInt(eventId, 10));
    return NextResponse.json(settlements);
  } catch (err: any) {
    console.error('Error fetching settlements:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { assignmentId, amount } = body;

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
