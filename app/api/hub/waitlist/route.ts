import { NextResponse } from 'next/server';
import { joinEventWaitlist } from '@/lib/supabase-db';

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { eventId, phoneNumber } = body;

    if (!eventId || !phoneNumber) {
      return NextResponse.json({ error: 'Missing eventId or phoneNumber' }, { status: 400 });
    }

    const success = await joinEventWaitlist(eventId, phoneNumber);
    if (!success) {
      return NextResponse.json({ error: 'Failed to join waitlist' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('Error joining waitlist:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
