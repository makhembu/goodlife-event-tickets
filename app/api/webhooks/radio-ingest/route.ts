import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { neonQuery } from "@/lib/supabase-db";

const BRIDGE_SECRET =
  process.env.RADIO_BRIDGE_SECRET ||
  "7688c2f3c3243106ff2dc49df4c6b28722ce007ae6bc8d24389ca28f97e262b0";

export async function POST(req: NextRequest) {
  try {
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
      .createHmac("sha256", BRIDGE_SECRET)
      .update(`${timestamp}:${rawBody}`)
      .digest("hex");

    if (!crypto.timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(expectedSig, "hex"))) {
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
    } = payload;

    if (!title || !audio_url) {
      return NextResponse.json({ error: "Title and audio_url required" }, { status: 400 });
    }

    // Format mm:ss for display
    const mins = Math.floor((duration_sec || 0) / 60);
    const secs = (duration_sec || 0) % 60;
    const durationStr = `${mins}:${secs.toString().padStart(2, "0")}`;

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
      duration_sec || 0,
      genre || "Afro House",
      file_size || 0,
      bitrate || 160,
      video_id || null,
    ];

    const { rows } = await neonQuery(query, params);
    return NextResponse.json({ success: true, item: rows[0] });
  } catch (err: any) {
    console.error("[radio-ingest webhook] Error:", err);
    return NextResponse.json({ error: err.message || "Internal error" }, { status: 500 });
  }
}
