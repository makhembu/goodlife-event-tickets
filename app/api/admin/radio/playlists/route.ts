import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { neonQuery } from "@/lib/supabase-db";

export const dynamic = "force-dynamic";

export async function GET() {
  const authErr = await requireAdmin();
  if (authErr) return authErr;

  try {
    const query = `
      SELECT 
        p.id,
        p.name,
        p.slug,
        p.description,
        p.genre,
        p.cover_url,
        p.is_public,
        p.is_broadcast_active,
        p.activated_at,
        p.display_order,
        p.ingest_job_id,
        p.ingest_source_url,
        p.created_at,
        p.updated_at,
        COUNT(pt.id)::int as track_count,
        COALESCE(SUM(s.duration_sec), 0)::int as total_duration_sec
      FROM radio_playlists p
      LEFT JOIN radio_playlist_tracks pt ON pt.playlist_id = p.id
      LEFT JOIN radio_sets s ON s.id = pt.track_id AND s.deleted_at IS NULL
      WHERE p.deleted_at IS NULL
      GROUP BY p.id
      ORDER BY p.is_broadcast_active DESC, p.display_order ASC, p.id DESC
    `;

    const res = await neonQuery(query);
    return NextResponse.json(
      { success: true, playlists: res.rows || [] },
      { headers: { "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate" } }
    );
  } catch (err: any) {
    console.error("[api/admin/radio/playlists] GET error:", err);
    return NextResponse.json({ error: err.message || "Failed to fetch playlists" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const authErr = await requireAdmin(req);
  if (authErr) return authErr;

  try {
    const body = await req.json();
    const playlistId = Number(body.playlist_id);
    if (!playlistId) {
      return NextResponse.json({ error: "playlist_id required" }, { status: 400 });
    }
    if (body.clear_ingest_job) {
      await neonQuery(
        `UPDATE radio_playlists SET ingest_job_id = NULL, updated_at = NOW() WHERE id = $1`,
        [playlistId]
      );
    }
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Update failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const authErr = await requireAdmin();
  if (authErr) return authErr;

  try {
    const body = await req.json();
    const { name, description, genre, cover_url, is_public } = body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "Playlist name is required" }, { status: 400 });
    }

    const cleanName = name.trim();
    let baseSlug = cleanName
      .toLowerCase()
      .replace(/[^\w\s-]/g, "")
      .replace(/\s+/g, "-")
      .slice(0, 50);

    if (!baseSlug) baseSlug = `playlist-${Date.now()}`;
    const slug = `${baseSlug}-${Math.floor(1000 + Math.random() * 9000)}`;

    const insertQuery = `
      INSERT INTO radio_playlists (name, slug, description, genre, cover_url, is_public)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;

    const res = await neonQuery(insertQuery, [
      cleanName,
      slug,
      description?.trim() || null,
      genre?.trim() || "Amapiano",
      cover_url?.trim() || null,
      is_public !== undefined ? Boolean(is_public) : true,
    ]);

    return NextResponse.json({ success: true, playlist: res.rows[0] }, { status: 201 });
  } catch (err: any) {
    console.error("[api/admin/radio/playlists] POST error:", err);
    return NextResponse.json({ error: err.message || "Failed to create playlist" }, { status: 500 });
  }
}
