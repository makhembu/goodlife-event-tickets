import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { uploadDropBufferToR2 } from "@/lib/radio/r2-signer";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const unauthorized = await requireAdmin(req);
  if (unauthorized) return unauthorized;

  try {
    const contentType = req.headers.get("content-type") || "";

    // 1. Multipart Form Data (Audio Blob from Browser Mic Recorder)
    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const audioFile = formData.get("audio");
      const name = (formData.get("name") || "mic_drop").toString();

      if (!audioFile || !(audioFile instanceof Blob)) {
        return NextResponse.json({ error: "No audio file provided in form-data." }, { status: 400 });
      }

      const arrayBuffer = await audioFile.arrayBuffer();
      let buffer = Buffer.from(arrayBuffer);

      // Automatic EBU R128 (-14 LUFS) mastering pipeline for soundboard & custom audio drops
      try {
        const { masterDropAudio } = await import("@/lib/radio/audio-mastering");
        const mastered = await masterDropAudio(buffer);
        if (mastered && mastered.length > 500) {
          buffer = mastered;
        }
      } catch (masterErr: any) {
        console.warn("[drops/upload] Audio mastering bypass/fallback:", masterErr?.message);
      }

      // Detect container & codec
      const fileMime = audioFile.type || "audio/webm";
      const cleanName = name.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 40);
      let r2Url: string | null = null;
      try {
        r2Url = await uploadDropBufferToR2({
          buffer,
          filename: `${cleanName}.${fileMime.includes("mp4") ? "mp4" : fileMime.includes("wav") ? "wav" : fileMime.includes("mpeg") ? "mp3" : "webm"}`,
        });
      } catch (r2Err: any) {
        console.warn("[drops/upload] R2 upload failed, falling back to data URI:", r2Err?.message);
      }

      const finalUrl = r2Url || `data:${fileMime};base64,${buffer.toString("base64")}`;

      return NextResponse.json({
        success: true,
        audio_url: finalUrl,
        size_bytes: buffer.length,
        storage: r2Url ? "r2" : "data_uri",
      });
    }

    // 2. JSON Body with Base64 audio
    const body = await req.json().catch(() => ({}));
    const { audio_base64, name } = body;

    if (!audio_base64 || typeof audio_base64 !== "string") {
      return NextResponse.json({ error: "Missing audio_base64 in request body." }, { status: 400 });
    }

    const rawBase64 = audio_base64.replace(/^data:audio\/[^;]+;base64,/, "");
    let buffer = Buffer.from(rawBase64, "base64");

    // Automatic EBU R128 (-14 LUFS) mastering pipeline for base64 uploads
    try {
      const { masterDropAudio } = await import("@/lib/radio/audio-mastering");
      const mastered = await masterDropAudio(buffer);
      if (mastered && mastered.length > 500) {
        buffer = mastered;
      }
    } catch (masterErr: any) {
      console.warn("[drops/upload] Base64 mastering bypass/fallback:", masterErr?.message);
    }

    const cleanName = (name || "mic_drop").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 40);

    let r2Url: string | null = null;
    try {
      r2Url = await uploadDropBufferToR2({
        buffer,
        filename: `${cleanName}.mp3`,
      });
    } catch (r2Err: any) {
      console.warn("[drops/upload] R2 upload failed:", r2Err?.message);
    }

    const finalUrl = r2Url || `data:audio/mp3;base64,${rawBase64}`;

    return NextResponse.json({
      success: true,
      audio_url: finalUrl,
      size_bytes: buffer.length,
      storage: r2Url ? "r2" : "data_uri",
    });
  } catch (err: any) {
    console.error("[drops/upload] Error uploading drop audio:", err);
    return NextResponse.json({ error: err.message || "Failed to upload audio." }, { status: 500 });
  }
}
