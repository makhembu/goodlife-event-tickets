import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { neonQuery } from "@/lib/supabase-db";
import { uploadBufferToR2, isR2Configured } from "@/lib/r2-storage";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const authErr = await requireAdmin(req);
  if (authErr) return authErr;

  const { rows } = await neonQuery(
    "SELECT default_standby_audio_url, broadcast_mode, live_title FROM radio_settings WHERE id = 1"
  );

  return NextResponse.json({
    success: true,
    default_standby_audio_url: rows[0]?.default_standby_audio_url || null,
    broadcast_mode: rows[0]?.broadcast_mode || "autodj",
  });
}

export async function PUT(req: NextRequest) {
  const authErr = await requireAdmin(req);
  if (authErr) return authErr;

  try {
    const body = await req.json().catch(() => ({}));
    const { default_standby_audio_url } = body;
    const val = typeof default_standby_audio_url === "string" ? default_standby_audio_url.trim() : null;

    const { rows } = await neonQuery(
      `UPDATE radio_settings 
       SET default_standby_audio_url = $1, updated_at = NOW() 
       WHERE id = 1 
       RETURNING default_standby_audio_url`,
      [val || null]
    );

    return NextResponse.json({
      success: true,
      default_standby_audio_url: rows[0]?.default_standby_audio_url || null,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Failed to update default standby audio" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const authErr = await requireAdmin(req);
  if (authErr) return authErr;

  if (!isR2Configured()) {
    return NextResponse.json(
      { error: "Cloudflare R2 storage is not configured for audio uploads" },
      { status: 503 }
    );
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "Audio file is required" }, { status: 400 });
    }

    if (file.size > 20 * 1024 * 1024) {
      return NextResponse.json(
        { error: "File exceeds 20MB limit for standby audio" },
        { status: 400 }
      );
    }

    const contentType = file.type || "audio/mpeg";
    if (!contentType.startsWith("audio/") && !file.name.match(/\.(mp3|wav|ogg|m4a|aac)$/i)) {
      return NextResponse.json(
        { error: "Invalid audio format. Please upload MP3, WAV, or AAC audio." },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const uploaded = await uploadBufferToR2({
      buffer,
      filename: `station_default_${file.name}`,
      contentType,
      folder: "standby-audio",
    });

    if (!uploaded || !uploaded.publicUrl) {
      return NextResponse.json(
        { error: "Failed to upload audio to storage" },
        { status: 500 }
      );
    }

    await neonQuery(
      `UPDATE radio_settings 
       SET default_standby_audio_url = $1, updated_at = NOW() 
       WHERE id = 1`,
      [uploaded.publicUrl]
    );

    return NextResponse.json({
      success: true,
      default_standby_audio_url: uploaded.publicUrl,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Audio upload failed" },
      { status: 500 }
    );
  }
}
