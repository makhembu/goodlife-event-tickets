import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { neonQuery } from "@/lib/supabase-db";

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

    if (!title || typeof title !== "string" || !title.trim()) {
      return NextResponse.json({ error: "Track title is required" }, { status: 400 });
    }
    if (!audio_url || typeof audio_url !== "string" || !audio_url.trim()) {
      return NextResponse.json({ error: "audio_url is required" }, { status: 400 });
    }

    const durSec = typeof duration_sec === "number" && duration_sec > 0 ? Math.round(duration_sec) : 0;
    const mins = Math.floor(durSec / 60);
    const secs = durSec % 60;
    const durationStr = `${mins}:${secs.toString().padStart(2, "0")}`;

    const isHq = Boolean(is_high_quality);
    const targetBitrate = typeof bitrate === "number" && bitrate > 0 ? bitrate : (isHq ? 320 : 192);
    const targetFileSize = typeof file_size === "number" && file_size > 0 ? file_size : 0;

    const query = `
      INSERT INTO radio_sets (
        event_id, title, dj_name, audio_url, audio_high_url, r2_key, r2_high_key, cover_url, 
        duration, duration_sec, genre, file_size, file_size_high, bitrate, bitrate_high, 
        source_type, processing_status, display_order, is_active
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8,
        $9, $10, $11, $12, $13, $14, $15,
        'r2', 'ready', 0, true
      )
      RETURNING id, title, dj_name, audio_url, r2_key, created_at;
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
    ];

    const { rows } = await neonQuery(query, params);
    return NextResponse.json({ success: true, item: rows[0] });
  } catch (err: any) {
    console.error("[register-upload] Error registering track:", err);
    return NextResponse.json({ error: err.message || "Failed to register upload in database" }, { status: 500 });
  }
}
