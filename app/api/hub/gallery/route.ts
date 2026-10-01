import { NextResponse } from 'next/server';
import { fetchEventGallery, neonQuery } from '@/lib/supabase-db';
import { requireAdmin } from "@/lib/admin-auth";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const eventId = searchParams.get('eventId');

    let gallery;
    if (eventId) {
      gallery = await fetchEventGallery(parseInt(eventId, 10));
    } else {
      gallery = await fetchEventGallery();
    }
    return NextResponse.json(gallery);
  } catch (err: any) {
    console.error('Error fetching gallery:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const authError = await requireAdmin();
  if (authError) return authError;
  try {
    const body = await req.json();
    const { event_id, image_url, thumbnail_url, caption } = body;

    const query = `
      INSERT INTO event_gallery (event_id, image_url, thumbnail_url, caption)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `;
    const params = [event_id, image_url, thumbnail_url || image_url, caption || ''];

    const { rows } = await neonQuery(query, params);

    return NextResponse.json({ success: true, image: rows[0] });
  } catch (err: any) {
    console.error('Error adding gallery image:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
