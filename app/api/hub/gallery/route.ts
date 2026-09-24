import { NextResponse } from 'next/server';
import { fetchEventGallery } from '@/lib/supabase-db';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const eventId = searchParams.get('eventId');
    
    if (!eventId) {
      return NextResponse.json({ error: 'Missing eventId' }, { status: 400 });
    }

    const gallery = await fetchEventGallery(parseInt(eventId, 10));
    return NextResponse.json(gallery);
  } catch (err: any) {
    console.error('Error fetching gallery:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
