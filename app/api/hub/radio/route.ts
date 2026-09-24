import { NextResponse } from 'next/server';
import { fetchRadioSets } from '@/lib/supabase-db';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const eventId = searchParams.get('eventId');
    
    let radioSets;
    if (eventId) {
      radioSets = await fetchRadioSets(parseInt(eventId, 10));
    } else {
      radioSets = await fetchRadioSets();
    }
    
    return NextResponse.json(radioSets);
  } catch (err: any) {
    console.error('Error fetching radio sets:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
