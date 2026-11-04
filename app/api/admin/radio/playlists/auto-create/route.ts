import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { neonQuery } from "@/lib/supabase-db";
import {
  AutoPlaylistVibe,
  VIBE_DEFINITIONS,
  buildHarmonicSequence,
  TrackWithHarmony,
} from "@/lib/radio/harmonic-graph";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const unauthorized = await requireAdmin(req);
  if (unauthorized) return unauthorized;

  try {
    const body = await req.json();
    const vibeKey = (body.vibe as AutoPlaylistVibe) || "late_night";
    const vibeDef = VIBE_DEFINITIONS[vibeKey] || VIBE_DEFINITIONS.late_night;

    const name = (body.name || vibeDef.name).trim();
    const description = (body.description || vibeDef.description).trim();
    const genre = (body.genre || vibeDef.genres[0] || "Amapiano").trim();
    const coverUrl = body.cover_url || vibeDef.suggestedCover || "/flyer.png";
    const targetCount = typeof body.track_count === "number" && body.track_count > 0 ? body.track_count : 15;

    // 1. Fetch active festival tracks from Neon Postgres
    const { rows: allTracks } = await neonQuery(
      `SELECT id, title, dj_name, genre, bpm, musical_key, duration_sec, cover_url, audio_url
       FROM radio_sets
       WHERE deleted_at IS NULL AND is_active = true
       ORDER BY id ASC`
    );

    if (!allTracks || allTracks.length === 0) {
      return NextResponse.json(
        { error: "No active radio sets available in library." },
        { status: 400 }
      );
    }

    // 2. Filter candidates based on vibe criteria
    const genresLower = (body.genres && Array.isArray(body.genres) && body.genres.length > 0)
      ? body.genres.map((g: string) => g.toLowerCase().trim())
      : vibeDef.genres.map((g) => g.toLowerCase().trim());

    const minBpm = typeof body.min_bpm === "number" ? body.min_bpm : (vibeDef.minBpm || 80);
    const maxBpm = typeof body.max_bpm === "number" ? body.max_bpm : (vibeDef.maxBpm || 140);

    let candidates: TrackWithHarmony[] = allTracks.filter((t: any) => {
      const matchGenre = !genresLower.length || genresLower.some((g: string) => (t.genre || "").toLowerCase().includes(g));
      const bpm = t.bpm || 115;
      const matchBpm = bpm >= minBpm - 5 && bpm <= maxBpm + 5;
      return matchGenre && matchBpm;
    });

    // Fallback if filter is too restrictive: widen candidates from whole catalog
    if (candidates.length < Math.min(targetCount, 8)) {
      candidates = allTracks;
    }

    // 3. Build Camelot Harmonic Sequence
    const harmonizedTracks = buildHarmonicSequence(candidates, {
      energyCurve: vibeDef.energyCurve,
      targetLength: targetCount,
    });

    if (harmonizedTracks.length === 0) {
      return NextResponse.json(
        { error: "Could not generate harmonic sequence from catalog." },
        { status: 400 }
      );
    }

    // 4. Create new playlist in radio_playlists (GUARD: is_broadcast_active = false)
    const playlistRes = await neonQuery(
      `INSERT INTO radio_playlists (
        name, description, genre, cover_url, is_broadcast_active, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, false, NOW(), NOW()
      ) RETURNING id, name, description, genre, cover_url, is_broadcast_active, created_at`,
      [name, description, genre, coverUrl]
    );

    const newPlaylist = playlistRes.rows[0];
    if (!newPlaylist) {
      return NextResponse.json({ error: "Failed to create playlist in database" }, { status: 500 });
    }

    // 5. Insert ordered tracks into radio_playlist_tracks
    for (let i = 0; i < harmonizedTracks.length; i++) {
      const track = harmonizedTracks[i];
      await neonQuery(
        `INSERT INTO radio_playlist_tracks (
          playlist_id, track_id, position, created_at
        ) VALUES (
          $1, $2, $3, NOW()
        )`,
        [newPlaylist.id, track.id, i + 1]
      );
    }

    return NextResponse.json({
      success: true,
      playlist: {
        ...newPlaylist,
        track_count: harmonizedTracks.length,
      },
      tracks: harmonizedTracks,
    });
  } catch (err: any) {
    console.error("[api/admin/radio/playlists/auto-create] Error:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error creating auto-playlist." },
      { status: 500 }
    );
  }
}
