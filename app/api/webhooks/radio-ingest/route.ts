import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { neonQuery } from "@/lib/supabase-db";
import { slotTrackAsPlaylistUpNext } from "@/lib/radio/playlist-slotter";
import { probeAudioMetadata, formatAudioDuration } from "@/lib/radio/audio-prober";

const rawSecret = process.env.RADIO_BRIDGE_SECRET?.replace(/^["']|["']$/g, "").trim();

export async function POST(req: NextRequest) {
  try {
    if (!rawSecret) {
      console.error("[radio-ingest webhook] RADIO_BRIDGE_SECRET not configured on server. Failing closed.");
      return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
    }

    const timestamp = req.headers.get("X-Bridge-Timestamp");
    const signature = req.headers.get("X-Bridge-Signature");

    if (!timestamp || !signature) {
      return NextResponse.json({ error: "Missing authentication headers" }, { status: 401 });
    }

    const reqTime = parseInt(timestamp, 10);
    const now = Math.floor(Date.now() / 1000);
    if (isNaN(reqTime) || Math.abs(now - reqTime) > 300) {
      return NextResponse.json({ error: "Request expired" }, { status: 401 });
    }

    const rawBody = await req.text();
    const expectedSig = crypto
      .createHmac("sha256", rawSecret)
      .update(`${timestamp}:${rawBody}`)
      .digest("hex");

    const sigBuf = Buffer.from(signature, "hex");
    const expBuf = Buffer.from(expectedSig, "hex");
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
    }

    const payload = JSON.parse(rawBody);
    const {
      video_id,
      title,
      dj_name,
      audio_url,
      r2_key,
      cover_url,
      duration_sec,
      genre,
      file_size,
      bitrate,
      event_id,
      playlist_id,
    } = payload;

    if (!title || !audio_url) {
      return NextResponse.json({ error: "Title and audio_url required" }, { status: 400 });
    }

    let finalDurationSec = typeof duration_sec === "number" && duration_sec > 0 ? duration_sec : 180;
    let finalBitrate = typeof bitrate === "number" && bitrate > 0 ? bitrate : 160;

    // Probe the real audio stream to detect and eliminate any trailing silence (e.g. YouTube lyric outro)
    try {
      const probed = await probeAudioMetadata(audio_url, file_size);
      if (probed && probed.durationSec > 0) {
        finalDurationSec = probed.durationSec;
        if (probed.bitrateKbps > 0) finalBitrate = probed.bitrateKbps;
      }
    } catch (e) {
      console.warn("[radio-ingest webhook] Auto-probe silence detection warning:", e);
    }

    const durationStr = formatAudioDuration(finalDurationSec);

    const query = `
      INSERT INTO radio_sets (
        event_id, title, dj_name, audio_url, r2_key, cover_url, 
        duration, duration_sec, genre, file_size, bitrate, 
        source_type, external_id, processing_status, display_order, is_active
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'r2', $12, 'ready', 0, true)
      ON CONFLICT (external_id) WHERE deleted_at IS NULL AND external_id IS NOT NULL
      DO UPDATE SET 
        audio_url = EXCLUDED.audio_url,
        r2_key = EXCLUDED.r2_key,
        file_size = EXCLUDED.file_size,
        cover_url = EXCLUDED.cover_url,
        processing_status = 'ready'
      RETURNING id, title;
    `;

    const params = [
      event_id || 2,
      title,
      dj_name || "Resident DJ",
      audio_url,
      r2_key || null,
      cover_url || "",
      durationStr,
      finalDurationSec,
      genre || "Afro House",
      file_size || 0,
      finalBitrate,
      video_id || null,
    ];

    const { rows } = await neonQuery(query, params);
    if (rows && rows.length > 0) {
      const trackId = rows[0].id;
      const targetPlaylistId = playlist_id ? Number(playlist_id) : null;
      if (targetPlaylistId && Number.isFinite(targetPlaylistId) && targetPlaylistId > 0) {
        try {
          await neonQuery(
            `INSERT INTO radio_playlist_tracks (playlist_id, track_id, position)
             SELECT $1, $2, COALESCE((SELECT MAX(position) + 1 FROM radio_playlist_tracks WHERE playlist_id = $1), 0)
             WHERE NOT EXISTS (
               SELECT 1 FROM radio_playlist_tracks WHERE playlist_id = $1 AND track_id = $2
             )`,
            [targetPlaylistId, trackId]
          );
          await neonQuery(
            `UPDATE radio_playlists SET updated_at = NOW() WHERE id = $1`,
            [targetPlaylistId]
          );
        } catch (plErr) {
          console.warn("[radio-ingest webhook] Explicit playlist link warning:", plErr);
        }
      } else {
        // Automatically slot newly mastered track into the active playlist as UP NEXT
        try {
          await slotTrackAsPlaylistUpNext(trackId);
        } catch (slotErr) {
          console.warn("[radio-ingest webhook] Auto-slot playlist warning:", slotErr);
        }
      }
    }
    return NextResponse.json({ success: true, item: rows[0] });
  } catch (err: any) {
    console.error("[radio-ingest webhook] Error:", err);
    return NextResponse.json({ error: err.message || "Internal error" }, { status: 500 });
  }
}
