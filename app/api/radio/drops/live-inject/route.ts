import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { neonQuery } from "@/lib/supabase-db";
import { uploadDropBufferToR2 } from "@/lib/radio/r2-signer";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const unauthorized = await requireAdmin(req);
  if (unauthorized) return unauthorized;

  try {
    const body = await req.json().catch(() => ({}));
    let { audio_url, title, persona, script, target_track_id } = body;

    if (!audio_url || typeof audio_url !== "string" || audio_url.trim() === "") {
      return NextResponse.json({ error: "Missing audio_url for live drop injection" }, { status: 400 });
    }

    if (audio_url.startsWith("blob:")) {
      return NextResponse.json(
        { error: "Local blob URLs cannot be broadcast to listeners. Upload audio first." },
        { status: 400 }
      );
    }

    let cleanAudioUrl = audio_url.trim();

    // If audio is a base64 data URI, upload to R2 to get a persistent lightweight URL for listeners
    if (cleanAudioUrl.startsWith("data:audio")) {
      try {
        const rawBase64 = cleanAudioUrl.replace(/^data:audio\/[^;]+;base64,/, "");
        const buffer = Buffer.from(rawBase64, "base64");
        const cleanName = (title || "live_drop").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 30);
        const r2Url = await uploadDropBufferToR2({
          buffer,
          filename: `${cleanName}.mp3`,
        });
        if (r2Url) {
          cleanAudioUrl = r2Url;
        }
      } catch (uploadErr) {
        console.warn("[live-inject] Base64 R2 upload fallback:", uploadErr);
      }
    }

    const cleanTitle = (title || "Live Air Drop").toString().slice(0, 150);
    const cleanPersona = (persona || "Station DJ").toString().slice(0, 100);
    const cleanScript = (script || "Live Voice Announcement").toString().slice(0, 500);
    const trackId = typeof target_track_id === "number" ? target_track_id : null;

    // Insert live drop into database with 'live_inject' timing_type
    const insertRes = await neonQuery(
      `INSERT INTO radio_drops (persona, mood, title, script, audio_url, target_track_id, timing_type, created_at)
       VALUES ($1, 'live_air', $2, $3, $4, $5, 'live_inject', NOW())
       RETURNING id, persona, mood, title, script, audio_url, created_at`,
      [cleanPersona, cleanTitle, cleanScript, cleanAudioUrl, trackId]
    );

    const createdDrop = insertRes.rows[0];

    return NextResponse.json(
      {
        success: true,
        message: "Live drop aired to stream successfully",
        drop: {
          id: createdDrop.id,
          title: createdDrop.title,
          persona: createdDrop.persona,
          audio_url: createdDrop.audio_url,
          fired_at: createdDrop.created_at,
        },
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("[api/radio/drops/live-inject] Injection failed:", err?.message || err);
    return NextResponse.json({ error: err?.message || "Failed to inject live drop" }, { status: 500 });
  }
}
