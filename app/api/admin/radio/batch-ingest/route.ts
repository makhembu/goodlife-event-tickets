import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { neonQuery } from "@/lib/supabase-db";

export const dynamic = "force-dynamic";

interface IngestTrack {
  video_id: string;
  title: string;
  artist: string;
  duration_sec: number;
  thumbnail_url: string;
  audio_url?: string;
  url?: string;
}

export async function POST(req: NextRequest) {
  const authErr = await requireAdmin();
  if (authErr) return authErr;

  try {
    const body = await req.json();
    const tracks: IngestTrack[] = body.tracks;
    const genre: string = body.genre || "Amapiano";
    let playlistId: number | null = body.playlist_id ? Number(body.playlist_id) : null;
    const newPlaylistName: string = body.new_playlist_name ? String(body.new_playlist_name).trim() : "";

    if (!Array.isArray(tracks) || tracks.length === 0) {
      return NextResponse.json({ error: "No tracks provided" }, { status: 400 });
    }

    // 1. If a new playlist was requested, create it first
    if (newPlaylistName) {
      const baseSlug = newPlaylistName
        .toLowerCase()
        .replace(/[^\w\s-]/g, "")
        .replace(/\s+/g, "-")
        .slice(0, 50);
      const slug = `${baseSlug || "playlist"}-${Math.floor(1000 + Math.random() * 9000)}`;

      const newPlRes = await neonQuery(
        `INSERT INTO radio_playlists (name, slug, description, genre, is_public, is_broadcast_active, created_at, updated_at)
         VALUES ($1, $2, $3, $4, true, false, NOW(), NOW())
         RETURNING id, name`,
        [newPlaylistName, slug, `Imported playlist containing ${tracks.length} tracks.`, genre]
      );
      if (newPlRes.rows.length > 0) {
        playlistId = newPlRes.rows[0].id;
      }
    }

    // 2. Insert tracks into radio_sets if not already present
    const insertedTrackIds: number[] = [];

    for (let i = 0; i < tracks.length; i++) {
      const t = tracks[i];
      const audioUrl = t.audio_url || t.url || `https://www.youtube.com/watch?v=${t.video_id}`;
      const title = t.title || `Track ${t.video_id}`;
      const djName = t.artist || "GOODLIFE Artist";
      const durationSec = t.duration_sec && t.duration_sec > 0 ? t.duration_sec : 180;
      const mins = Math.floor(durationSec / 60);
      const secs = durationSec % 60;
      const durationStr = `${mins}:${secs.toString().padStart(2, "0")}`;

      // Check if track already exists
      const existing = await neonQuery(
        `SELECT id FROM radio_sets WHERE external_id = $1 OR audio_url = $2 LIMIT 1`,
        [t.video_id, audioUrl]
      );

      let trackId: number;
      if (existing.rows.length > 0) {
        trackId = existing.rows[0].id;
      } else {
        const ins = await neonQuery(
          `INSERT INTO radio_sets (
            title, dj_name, audio_url, cover_url, external_id, source_type,
            genre, duration_sec, duration, is_active, processing_status, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true, 'ready', NOW())
          RETURNING id`,
          [
            title,
            djName,
            audioUrl,
            t.thumbnail_url || "",
            t.video_id,
            t.url?.includes("spotify") ? "spotify" : "youtube",
            genre,
            durationSec,
            durationStr,
          ]
        );
        trackId = ins.rows[0].id;
      }

      insertedTrackIds.push(trackId);

      // If playlist is selected, attach track to playlist
      if (playlistId) {
        await neonQuery(
          `INSERT INTO radio_playlist_tracks (playlist_id, track_id, position)
           VALUES ($1, $2, $3)
           ON CONFLICT DO NOTHING`,
          [playlistId, trackId, i]
        );
      }
    }

    return NextResponse.json({
      success: true,
      total_processed: tracks.length,
      playlist_id: playlistId,
      playlist_name: newPlaylistName || undefined,
    });
  } catch (err: any) {
    console.error("[batch-ingest] Error:", err);
    return NextResponse.json({ error: err.message || "Failed to batch ingest tracks" }, { status: 500 });
  }
}
