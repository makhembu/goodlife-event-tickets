import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { neonQuery } from "@/lib/supabase-db";
import { probeAudioMetadata, formatAudioDuration } from "@/lib/radio/audio-prober";

export async function POST(req: NextRequest) {
  const authErr = await requireAdmin(req);
  if (authErr) return authErr;

  try {
    const body = await req.json();
    const title = body.title;
    const dj_name = body.dj_name || body.djName;
    const audio_url = body.audio_url || body.audioUrl;
    const r2_key = body.r2_key || body.r2Key || body.key || "";
    const cover_url = body.cover_url || body.coverUrl || "";
    const duration_sec = body.duration_sec ?? body.durationSec ?? 180;
    const genre = body.genre || "Afro House";
    const file_size = body.file_size ?? body.fileSize ?? 0;
    const bitrate = body.bitrate ?? 192;
    const event_id = body.event_id || body.eventId || 2;
    const is_high_quality = body.is_high_quality ?? body.isHighQuality;
    const is_full_set = Boolean(body.is_full_set ?? body.isFullSet);
    const bpm = typeof body.bpm === "number" && body.bpm > 0 ? Math.round(body.bpm) : null;
    const musical_key = body.musical_key || body.musicalKey || null;
    const targetPlaylistId = body.playlist_id ? Number(body.playlist_id) : (body.playlistId ? Number(body.playlistId) : null);

    if (!title || typeof title !== "string" || !title.trim()) {
      return NextResponse.json({ error: "Track title is required" }, { status: 400 });
    }
    if (!audio_url || typeof audio_url !== "string" || !audio_url.trim()) {
      return NextResponse.json({ error: "audio_url is required" }, { status: 400 });
    }

    let durSec = typeof duration_sec === "number" && duration_sec > 0 ? Math.round(duration_sec) : 0;
    let targetBitrate = typeof bitrate === "number" && bitrate > 0 ? bitrate : (Boolean(is_high_quality) ? 320 : 192);

    // If duration was not provided or defaulted to generic 180s, probe stream metadata
    if (durSec <= 0 || durSec === 180) {
      try {
        const probed = await probeAudioMetadata(audio_url.trim(), file_size);
        if (probed && probed.durationSec > 0) {
          durSec = probed.durationSec;
          if (probed.bitrateKbps > 0) targetBitrate = probed.bitrateKbps;
        }
      } catch (e) {
        console.warn("[register-upload] Auto-probe fallback failed:", e);
      }
    }

    const durationStr = formatAudioDuration(durSec);
    const isHq = Boolean(is_high_quality);
    const targetFileSize = typeof file_size === "number" && file_size > 0 ? file_size : 0;

    const query = `
      INSERT INTO radio_sets (
        event_id, title, dj_name, audio_url, audio_high_url, r2_key, r2_high_key, cover_url, 
        duration, duration_sec, genre, file_size, file_size_high, bitrate, bitrate_high, 
        source_type, processing_status, display_order, is_active, is_full_set, bpm, musical_key
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8,
        $9, $10, $11, $12, $13, $14, $15,
        'r2', 'ready', 0, true, $16, $17, $18
      )
      RETURNING id, title, dj_name, audio_url, r2_key, created_at, is_full_set, bpm, musical_key;
    `;

    const params = [
      event_id || 2,
      title.trim(),
      (dj_name && typeof dj_name === "string" && dj_name.trim()) || "Resident DJ",
      audio_url.trim(),
      isHq ? audio_url.trim() : "",
      r2_key || null,
      isHq ? (r2_key || null) : null,
      cover_url || "",
      durationStr,
      durSec,
      genre || "Afro House",
      targetFileSize,
      isHq ? targetFileSize : 0,
      targetBitrate,
      isHq ? targetBitrate : 320,
      is_full_set,
      bpm,
      musical_key,
    ];

    const { rows } = await neonQuery(query, params);
    const newTrack = rows[0];

    if (targetPlaylistId && newTrack?.id) {
      await neonQuery(
        `INSERT INTO radio_playlist_tracks (playlist_id, track_id, position)
         VALUES ($1, $2, (SELECT COALESCE(MAX(position), -1) + 1 FROM radio_playlist_tracks WHERE playlist_id = $1))
         ON CONFLICT (playlist_id, track_id) DO NOTHING`,
        [targetPlaylistId, newTrack.id]
      );
    }

    return NextResponse.json({ success: true, item: newTrack, playlist_id: targetPlaylistId });
  } catch (err: any) {
    console.error("[register-upload] Error registering track:", err);
    return NextResponse.json({ error: err.message || "Failed to register upload in database" }, { status: 500 });
  }
}
