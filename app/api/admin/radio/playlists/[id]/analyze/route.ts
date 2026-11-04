import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { neonQuery } from "@/lib/supabase-db";
import { bridgeAnalyzeAudio } from "@/lib/radio/bridge-client";

export const dynamic = "force-dynamic";

export async function POST(
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
    const body = await req.json().catch(() => ({}));
    const forceAll = Boolean(body.forceAll);

    // Fetch tracks for this playlist
    const tracksRes = await neonQuery(
      `SELECT s.id, s.title, s.audio_url, s.genre, s.bpm, s.musical_key, s.duration_sec, s.is_full_set
       FROM radio_playlist_tracks pt
       JOIN radio_sets s ON s.id = pt.track_id
       WHERE pt.playlist_id = $1 AND s.deleted_at IS NULL AND (s.is_active = true OR s.is_active IS NULL)
       ORDER BY pt.position ASC`,
      [playlistId]
    );

    const playlistTracks = tracksRes.rows || [];
    if (playlistTracks.length === 0) {
      return NextResponse.json({ error: "Playlist has no tracks to analyze" }, { status: 400 });
    }

    // Filter tracks needing analysis
    const toAnalyze = forceAll
      ? playlistTracks
      : playlistTracks.filter(
          (t: any) =>
            !t.bpm ||
            !t.musical_key ||
            !/^(1[0-2]|[1-9])[AB]$/i.test(String(t.musical_key).trim())
        );

    if (toAnalyze.length === 0) {
      return NextResponse.json({
        success: true,
        message: "All tracks in this playlist already have verified BPM and Camelot keys.",
        analyzedCount: 0,
        totalTracks: playlistTracks.length,
      });
    }

    let analyzedCount = 0;
    const failures: string[] = [];

    for (const track of toAnalyze) {
      if (!track.audio_url) {
        failures.push(`"${track.title}" has no audio URL`);
        continue;
      }

      const res = await bridgeAnalyzeAudio({
        track_id: track.id,
        audio_url: track.audio_url,
        genre: track.genre || "",
        is_full_set: Boolean(track.is_full_set),
      });

      if (res.ok && res.data && res.data.bpm && res.data.musical_key) {
        const roundedBpm = Math.round(Number(res.data.bpm));
        const keyStr = String(res.data.musical_key).trim().toUpperCase();
        const energyVal = res.data.energy ? Math.min(10, Math.max(1, Math.round(res.data.energy))) : null;
        const durSec = res.data.duration_sec ? Math.round(res.data.duration_sec) : null;

        await neonQuery(
          `UPDATE radio_sets
           SET bpm = $2,
               musical_key = $3,
               key_source = 'analyzed',
               energy = COALESCE($4, energy),
               duration_sec = COALESCE(NULLIF(duration_sec, 0), $5)
           WHERE id = $1`,
          [
            track.id,
            roundedBpm,
            keyStr,
            energyVal,
            durSec,
          ]
        );
        analyzedCount++;
      } else {
        failures.push(`"${track.title}": ${res.error || "Analysis failed"}`);
      }
    }

    return NextResponse.json({
      success: true,
      analyzedCount,
      totalRequested: toAnalyze.length,
      failures: failures.length > 0 ? failures : undefined,
      message: `Successfully analyzed ${analyzedCount} track(s) via Cloudflare tunnel.`,
    });
  } catch (err: any) {
    console.error("[api/admin/radio/playlists/[id]/analyze] Error:", err);
    return NextResponse.json({ error: err.message || "Audio analysis failed" }, { status: 500 });
  }
}
