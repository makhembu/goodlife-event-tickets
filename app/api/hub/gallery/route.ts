import { NextRequest, NextResponse } from 'next/server';
import { fetchEventGallery, neonQuery } from '@/lib/supabase-db';
import { requireAdmin } from "@/lib/admin-auth";
import { resolveGalleryMediaType } from "@/lib/gallery-media";

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
    const { event_id, image_url, thumbnail_url, caption, tag, media_type } = body;

    if (!event_id || !image_url || typeof image_url !== 'string') {
      return NextResponse.json({ error: 'event_id and image_url are required' }, { status: 400 });
    }

    const resolvedType = resolveGalleryMediaType(media_type, image_url);

    const query = `
      INSERT INTO event_gallery (event_id, image_url, thumbnail_url, caption, tag, media_type)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;
    const params = [
      event_id,
      image_url,
      thumbnail_url || image_url,
      caption || '',
      tag || 'PHOTO',
      resolvedType,
    ];

    const { rows } = await neonQuery(query, params);

    return NextResponse.json({ success: true, image: rows[0] });
  } catch (err: any) {
    console.error('Error adding gallery image:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const authError = await requireAdmin();
  if (authError) return authError;

  try {
    let id: number | null = null;
    const { searchParams } = new URL(request.url);
    const idParam = searchParams.get('id');
    if (idParam) {
      id = parseInt(idParam, 10);
    } else {
      const body = await request.json().catch(() => null);
      if (body && body.id) {
        id = parseInt(String(body.id), 10);
      }
    }

    if (!id || isNaN(id)) {
      return NextResponse.json({ error: 'Valid ID is required' }, { status: 400 });
    }

    await neonQuery('DELETE FROM event_gallery WHERE id = $1', [id]);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('Error deleting gallery image:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

