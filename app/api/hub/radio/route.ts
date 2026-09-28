import { NextResponse } from 'next/server';
import { fetchRadioSets, neonQuery } from '@/lib/supabase-db';

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

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { title, dj_name, audio_url, cover_url, duration, genre, event_id } = body;
    
    const query = `
      INSERT INTO radio_sets (title, dj_name, audio_url, cover_url, duration, genre, event_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `;
    const params = [
      title || 'Untitled Set',
      dj_name || 'Resident DJ',
      audio_url || '',
      cover_url || '',
      duration || '00:00',
      genre || 'Electronic',
      event_id || 1
    ];
    
    const { rows } = await neonQuery(query, params);
    return NextResponse.json({ success: true, set: rows[0] });
  } catch (err: any) {
    console.error('Error adding radio set:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
