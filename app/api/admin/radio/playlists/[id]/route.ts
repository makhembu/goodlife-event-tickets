import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { neonQuery } from "@/lib/supabase-db";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authErr = await requireAdmin();
  if (authErr) return authErr;

  const resolvedParams = await params;
  const playlistId = parseInt(resolvedParams.id, 10);
  if (isNaN(playlistId)) {
    return NextResponse.json({ error: "Invalid playlist ID" }, { status: 400 });
  }

  try {
    const playlistRes = await neonQuery(
      `SELECT * FROM radio_playlists WHERE id = $1 AND deleted_at IS NULL`,
      [playlistId]
    );

    if (playlistRes.rows.length === 0) {
      return NextResponse.json({ error: "Playlist not found" }, { status: 404 });
    }

    const tracksRes = await neonQuery(
      `SELECT 
        pt.id as playlist_track_id,
        pt.position,
        pt.added_at,
        s.id,
        s.title,
        s.dj_name,
        s.audio_url,
        s.cover_url,
        s.duration,
        s.duration_sec,
        s.genre,
        s.external_id
      FROM radio_playlist_tracks pt
      JOIN radio_sets s ON s.id = pt.track_id
      WHERE pt.playlist_id = $1 AND s.deleted_at IS NULL
      ORDER BY pt.position ASC, pt.id ASC`,
      [playlistId]
    );

    return NextResponse.json({
      success: true,
      playlist: playlistRes.rows[0],
      tracks: tracksRes.rows || [],
    });
  } catch (err: any) {
    console.error("[api/admin/radio/playlists/[id]] GET error:", err);
    return NextResponse.json({ error: err.message || "Failed to load playlist" }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authErr = await requireAdmin();
  if (authErr) return authErr;

  const resolvedParams = await params;
  const playlistId = parseInt(resolvedParams.id, 10);
  if (isNaN(playlistId)) {
    return NextResponse.json({ error: "Invalid playlist ID" }, { status: 400 });
  }

  try {
    const body = await req.json();
    const { name, description, genre, cover_url, is_public, display_order } = body;

    const updateQuery = `
      UPDATE radio_playlists
      SET 
        name = COALESCE($2, name),
        description = COALESCE($3, description),
        genre = COALESCE($4, genre),
        cover_url = COALESCE($5, cover_url),
        is_public = COALESCE($6, is_public),
        display_order = COALESCE($7, display_order),
        updated_at = NOW()
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING *
    `;

    const res = await neonQuery(updateQuery, [
      playlistId,
      name !== undefined ? name.trim() : null,
      description !== undefined ? description?.trim() : null,
      genre !== undefined ? genre?.trim() : null,
      cover_url !== undefined ? cover_url?.trim() : null,
      is_public !== undefined ? Boolean(is_public) : null,
      display_order !== undefined ? Number(display_order) : null,
    ]);

    if (res.rows.length === 0) {
      return NextResponse.json({ error: "Playlist not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, playlist: res.rows[0] });
  } catch (err: any) {
    console.error("[api/admin/radio/playlists/[id]] PUT error:", err);
    return NextResponse.json({ error: err.message || "Failed to update playlist" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authErr = await requireAdmin();
  if (authErr) return authErr;

  const resolvedParams = await params;
  const playlistId = parseInt(resolvedParams.id, 10);
  if (isNaN(playlistId)) {
    return NextResponse.json({ error: "Invalid playlist ID" }, { status: 400 });
  }

  try {
    const res = await neonQuery(
      `UPDATE radio_playlists 
       SET deleted_at = NOW(), is_broadcast_active = false, activated_at = NULL 
       WHERE id = $1 AND deleted_at IS NULL 
       RETURNING id`,
      [playlistId]
    );

    if (res.rows.length === 0) {
      return NextResponse.json({ error: "Playlist not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: "Playlist deleted" });
  } catch (err: any) {
    console.error("[api/admin/radio/playlists/[id]] DELETE error:", err);
    return NextResponse.json({ error: err.message || "Failed to delete playlist" }, { status: 500 });
  }
}
