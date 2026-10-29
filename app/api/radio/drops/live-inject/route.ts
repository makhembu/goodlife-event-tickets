import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { neonQuery } from "@/lib/supabase-db";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const unauthorized = await requireAdmin(req);
  if (unauthorized) return unauthorized;

  try {
    const body = await req.json().catch(() => ({}));
    const { audio_url, title, persona, script, target_track_id } = body;

    if (!audio_url || typeof audio_url !== "string" || audio_url.trim() === "") {
      return NextResponse.json({ error: "Missing audio_url for live drop injection" }, { status: 400 });
    }

    const cleanAudioUrl = audio_url.trim();
    const cleanTitle = (title || "Live Air Drop").toString().slice(0, 150);
    const cleanPersona = (persona || "Station DJ").toString().slice(0, 100);
    const cleanScript = (script || "Live Voice Announcement").toString().slice(0, 500);
    const trackId = typeof target_track_id === "number" ? target_track_id : null;

    // Insert live drop into database
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
