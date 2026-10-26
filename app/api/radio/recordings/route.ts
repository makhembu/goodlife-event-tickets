import { NextResponse } from "next/server";
import { neonQuery } from "@/lib/supabase-db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const res = await neonQuery(`
      SELECT 
        id, 
        title, 
        dj_name, 
        audio_url, 
        r2_key, 
        duration, 
        file_size, 
        bitrate, 
        genre, 
        recorded_at, 
        created_at
      FROM radio_recordings
      WHERE is_public = true
      ORDER BY recorded_at DESC
      LIMIT 50;
    `);

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
