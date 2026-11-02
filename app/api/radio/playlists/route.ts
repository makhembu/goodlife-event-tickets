import { NextResponse } from "next/server";
import { neonQuery } from "@/lib/supabase-db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const query = `
      SELECT 
        p.id,
        p.name,
        p.slug,
        p.description,
        p.genre,
        p.cover_url,
        p.is_broadcast_active,
        COUNT(pt.id)::int as track_count,
        COALESCE(SUM(s.duration_sec), 0)::int as total_duration_sec
      FROM radio_playlists p
      LEFT JOIN radio_playlist_tracks pt ON pt.playlist_id = p.id
      LEFT JOIN radio_sets s ON s.id = pt.track_id AND s.deleted_at IS NULL AND s.is_active = true
      WHERE p.deleted_at IS NULL AND p.is_public = true
      GROUP BY p.id
      HAVING COUNT(pt.id) > 0
      ORDER BY p.is_broadcast_active DESC, p.display_order ASC, p.id DESC
    `;

    const res = await neonQuery(query);
    return NextResponse.json(
      { success: true, playlists: res.rows || [] },
      { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60" } }
    );
  } catch (err: any) {
    console.error("[api/radio/playlists] GET error:", err);
    return NextResponse.json({ error: err.message || "Failed to load playlists" }, { status: 500 });
  }
}
