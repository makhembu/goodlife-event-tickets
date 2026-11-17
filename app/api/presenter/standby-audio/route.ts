import { NextRequest, NextResponse } from "next/server";
import { requirePresenter } from "@/lib/presenter-auth";
import { neonQuery } from "@/lib/supabase-db";
import { uploadBufferToR2, isR2Configured } from "@/lib/r2-storage";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const authResult = await requirePresenter(req);
  if (authResult instanceof NextResponse) return authResult;

  const { presenter } = authResult;
  const { rows } = await neonQuery(
    "SELECT id, dj_name, standby_audio_url FROM presenters WHERE id = $1",
    [presenter.id]
  );

  return NextResponse.json({
    success: true,
    dj_name: rows[0]?.dj_name || presenter.dj_name,
    standby_audio_url: rows[0]?.standby_audio_url || null,
  });
}

export async function PUT(req: NextRequest) {
  const authResult = await requirePresenter(req);
  if (authResult instanceof NextResponse) return authResult;

  const { presenter } = authResult;
  try {
    const body = await req.json().catch(() => ({}));
    const { standby_audio_url } = body;

    const val = typeof standby_audio_url === "string" ? standby_audio_url.trim() : null;

    const { rows } = await neonQuery(
      `UPDATE presenters 
       SET standby_audio_url = $1, updated_at = NOW() 
       WHERE id = $2 
       RETURNING id, dj_name, standby_audio_url`,
      [val || null, presenter.id]
    );

    return NextResponse.json({
      success: true,
      standby_audio_url: rows[0]?.standby_audio_url || null,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Failed to update standby audio URL" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const authResult = await requirePresenter(req);
  if (authResult instanceof NextResponse) return authResult;

  const { presenter } = authResult;

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

    // Limit to 20MB max
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
      filename: `presenter_${presenter.slug}_${file.name}`,
      contentType,
      folder: "standby-audio",
    });

    if (!uploaded || !uploaded.publicUrl) {
      return NextResponse.json(
        { error: "Failed to upload audio file to storage" },
        { status: 500 }
      );
    }

    await neonQuery(
      `UPDATE presenters 
       SET standby_audio_url = $1, updated_at = NOW() 
       WHERE id = $2`,
      [uploaded.publicUrl, presenter.id]
    );

    return NextResponse.json({
      success: true,
      standby_audio_url: uploaded.publicUrl,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Audio upload failed" },
      { status: 500 }
    );
  }
}
