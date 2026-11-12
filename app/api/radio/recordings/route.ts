import { NextRequest, NextResponse } from "next/server";
import { neonQuery } from "@/lib/supabase-db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const showParam = searchParams.get("show"); // can be show_id or show_slug
    const presenterParam = searchParams.get("presenter"); // can be presenter_id or presenter_slug

    let query = `
      SELECT 
        r.id, 
        r.title, 
        COALESCE(r.dj_name, p.dj_name, 'GOODLIFE Resident') as dj_name,
        r.audio_url, 
        r.r2_key, 
        r.duration, 
        r.file_size, 
        r.bitrate, 
        COALESCE(r.genre, s.genre, 'Festival Live Set') as genre, 
        r.recorded_at, 
        r.created_at,
        r.show_id,
        s.title as show_title,
        s.slug as show_slug,
        p.id as presenter_id,
        p.slug as presenter_slug
      FROM radio_recordings r
      LEFT JOIN shows s ON r.show_id = s.id
      LEFT JOIN presenters p ON r.presenter_id = p.id
      WHERE r.is_public = true
    `;

    const values: any[] = [];
    if (showParam) {
      if (/^\d+$/.test(showParam)) {
        values.push(parseInt(showParam, 10));
        query += ` AND (r.show_id = $${values.length} OR s.id = $${values.length})`;
      } else {
        values.push(showParam);
        query += ` AND s.slug = $${values.length}`;
      }
    }

    if (presenterParam) {
      if (/^\d+$/.test(presenterParam)) {
        values.push(parseInt(presenterParam, 10));
        query += ` AND (r.presenter_id = $${values.length} OR p.id = $${values.length})`;
      } else {
        values.push(presenterParam);
        query += ` AND p.slug = $${values.length}`;
      }
    }

    query += ` ORDER BY r.recorded_at DESC LIMIT 50;`;

    const res = await neonQuery(query, values);

    const recordings = (res?.rows || []).map((row: any) => ({
      id: row.id,
      title: row.title,
      dj_name: row.dj_name,
      audio_url: row.audio_url,
      r2_key: row.r2_key,
      duration: row.duration,
      duration_formatted: formatDuration(row.duration),
      file_size: row.file_size,
      bitrate: row.bitrate,
      genre: row.genre || "Festival Live Set",
      recorded_at: row.recorded_at,
      show_id: row.show_id,
      show_title: row.show_title || null,
      show_slug: row.show_slug || null,
      presenter_id: row.presenter_id || null,
      presenter_slug: row.presenter_slug || null,
    }));

    return NextResponse.json(recordings, {
      headers: {
        "Cache-Control": "s-maxage=30, stale-while-revalidate=60",
      },
    });
  } catch (err: any) {
    // If table doesn't exist yet prior to migration, fail open gracefully
    console.warn("[api/radio/recordings] Error querying radio_recordings:", err.message);
    return NextResponse.json([], { status: 200 });
  }
}

function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return "Live Set";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes} min`;
}
