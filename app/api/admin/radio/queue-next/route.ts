import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { bridgeQueueIngest, bridgeQueueNext } from "@/lib/radio/bridge-client";
import { neonQuery } from "@/lib/supabase-db";
import { slotTrackAsPlaylistUpNext } from "@/lib/radio/playlist-slotter";

export const dynamic = "force-dynamic";

function isPlayableAudio(url?: string | null): boolean {
  if (!url || typeof url !== "string") return false;
  const trimmed = url.trim();
  if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) return false;
  if (trimmed.includes("youtube.com") || trimmed.includes("youtu.be")) return false;
  return true;
}

export async function GET(req: NextRequest) {
  const unauthorized = await requireAdmin(req);
  if (unauthorized) return unauthorized;

  const url = new URL(req.url);
  const videoId = url.searchParams.get("video_id")?.trim();
  const trackId = url.searchParams.get("track_id")?.trim();

  if (!videoId && !trackId) {
    return NextResponse.json({ error: "video_id or track_id required" }, { status: 400 });
  }

  let row: any = null;
  if (trackId) {
    const res = await neonQuery(
      `SELECT id, title, dj_name, audio_url, r2_key, processing_status FROM radio_sets WHERE id = $1 AND deleted_at IS NULL`,
      [trackId]
    );
    row = res.rows[0];
  } else if (videoId) {
    const res = await neonQuery(
      `SELECT id, title, dj_name, audio_url, r2_key, processing_status FROM radio_sets WHERE external_id = $1 AND deleted_at IS NULL`,
      [videoId]
    );
    row = res.rows[0];
  }

  const isReady = Boolean(
    row &&
    row.processing_status === "ready" &&
    isPlayableAudio(row.audio_url)
  );

  return NextResponse.json({
    status: isReady ? "ready" : (row?.processing_status || "processing"),
    is_ready: isReady,
    track: row
      ? {
          id: row.id,
          title: row.title,
          artist: row.dj_name,
          audio_url: row.audio_url,
        }
      : null,
  });
}

export async function POST(req: NextRequest) {
  const unauthorized = await requireAdmin(req);
  if (unauthorized) return unauthorized;

  try {
    const body = await req.json();
    const {
      url,
      custom_drop_text,
      voice_preference,
      play_now,
      track_id,
      title,
      artist,
      duration_sec,
      thumbnail_url,
    } = body;

    let targetTrack: {
      id: number;
      title: string;
      dj_name: string;
      duration_sec: number;
      audio_url: string;
      processing_status?: string;
    } | null = null;

    // 1. If this is an existing library track (track_id provided)
    if (track_id) {
      const { rows } = await neonQuery(
        `SELECT id, title, dj_name, duration_sec, audio_url, processing_status FROM radio_sets WHERE id = $1 AND deleted_at IS NULL`,
        [track_id]
      );
      if (rows && rows.length > 0) {
        targetTrack = rows[0];
      }
    }

    const trimmedUrl = (url && typeof url === "string") ? url.trim() : "";
    const match = trimmedUrl.match(/(?:v=|youtu\.be\/|embed\/|\/v\/)([a-zA-Z0-9_-]{11})/);
    const videoId = match ? match[1] : null;

    // 2. If no track_id, try to find existing by external_id or audio_url
    if (!targetTrack && (videoId || trimmedUrl)) {
      const existingRes = await neonQuery(
        `SELECT id, title, dj_name, duration_sec, audio_url, processing_status FROM radio_sets 
         WHERE (external_id = $1 OR audio_url = $2) AND deleted_at IS NULL LIMIT 1`,
        [videoId || trimmedUrl, trimmedUrl]
      );
      if (existingRes.rows.length > 0) {
        targetTrack = existingRes.rows[0];
      }
    }

    // 3. If track exists and ALREADY has streamable Cloudflare R2 audio:
    if (targetTrack && isPlayableAudio(targetTrack.audio_url) && targetTrack.processing_status === "ready") {
      if (play_now) {
        await neonQuery(
          `UPDATE radio_settings 
           SET broadcast_mode = 'mania', active_set_id = $1, active_started_at = NOW(), updated_at = NOW() 
           WHERE id = 1`,
          [targetTrack.id]
        );

        return NextResponse.json({
          status: "success",
          artist: targetTrack.dj_name,
          title: targetTrack.title,
          queued_as_up_next: false,
          played_now: true,
        });
      }

      // Slot into active broadcast playlist as UP NEXT
      await slotTrackAsPlaylistUpNext(targetTrack.id);

      return NextResponse.json({
        status: "success",
        artist: targetTrack.dj_name,
        title: targetTrack.title,
        queued_as_up_next: true,
        played_now: false,
      });
    }

    // 4. Track needs to be ingested from YouTube and mirrored to Cloudflare R2
    if (!videoId && !trimmedUrl) {
      return NextResponse.json(
        { error: "Track could not be resolved from library or URL." },
        { status: 400 }
      );
    }

    const durSec = typeof duration_sec === "number" && duration_sec > 0 ? Math.round(duration_sec) : 180;
    const mins = Math.floor(durSec / 60);
    const secs = durSec % 60;
    const durationStr = `${mins}:${secs.toString().padStart(2, "0")}`;

    let safeThumbnail = (thumbnail_url && typeof thumbnail_url === "string") ? thumbnail_url.trim() : "";
    if (
      !safeThumbnail ||
      safeThumbnail.includes("192.168.") ||
      safeThumbnail.includes("localhost") ||
      safeThumbnail.includes("127.0.0.1") ||
      safeThumbnail.includes(":3000")
    ) {
      safeThumbnail = videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : "/flyer.png";
    }

    // Upsert into radio_sets with processing_status = 'processing'
    // Do NOT set audio_url to raw youtube.com - leave empty until R2 MP3 is uploaded
    const upsertRes = await neonQuery(
      `INSERT INTO radio_sets (
        event_id, title, dj_name, audio_url, cover_url, duration, duration_sec, genre,
        processing_status, is_active, display_order, source_type, external_id
      ) VALUES (
        2, $1, $2, '', $3, $4, $5, 'Hip-Hop',
        'processing', true, 0, 'r2', $6
      )
      ON CONFLICT (external_id) WHERE deleted_at IS NULL AND external_id IS NOT NULL
      DO UPDATE SET
        title = EXCLUDED.title,
        dj_name = EXCLUDED.dj_name,
        cover_url = EXCLUDED.cover_url,
        processing_status = 'processing'
      RETURNING id, title, dj_name, duration_sec, audio_url`,
      [
        (title && typeof title === "string" && title.trim()) || "Quick Insert Track",
        (artist && typeof artist === "string" && artist.trim()) || "Guest Artist",
        safeThumbnail,
        durationStr,
        durSec,
        videoId || trimmedUrl,
      ]
    );

    const createdTrack = upsertRes.rows[0];
    if (!createdTrack) {
      return NextResponse.json({ error: "Failed to record track for ingestion." }, { status: 500 });
    }

    // Trigger Ingest on Radio Bridge (yt-dlp -> R2 upload -> /api/webhooks/radio-ingest)
    const ingestRes = await bridgeQueueIngest({
      tracks: [
        {
          video_id: videoId || trimmedUrl,
          title: createdTrack.title,
          artist: createdTrack.dj_name,
          duration_sec: durSec,
          thumbnail_url: safeThumbnail,
        },
      ],
      genre: "Hip-Hop",
      event_id: 2,
    }).catch(() => ({ ok: false, error: "Bridge unavailable" } as any));

    // Also notify bridge queue-next for DJ talkover / drop voice prep
    bridgeQueueNext({
      url: trimmedUrl,
      custom_drop_text: custom_drop_text?.trim() || undefined,
      voice_preference: voice_preference === "female" ? "female" : "male",
    }).catch(() => {});

    return NextResponse.json({
      status: "ingesting",
      job_id: ingestRes?.data?.job_id || null,
      track_id: createdTrack.id,
      video_id: videoId,
      artist: createdTrack.dj_name,
      title: createdTrack.title,
      queued_as_up_next: false,
      played_now: false,
      message: "⚡ Track is downloading from YouTube & mastering to Cloudflare R2 (-14 LUFS)... It will automatically join the playlist once ready.",
    });
  } catch (err: any) {
    console.error("[api/admin/radio/queue-next] Error:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error queueing track." },
      { status: 500 }
    );
  }
}
