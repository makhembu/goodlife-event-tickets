import { NextResponse } from "next/server";
import { neonQuery } from "@/lib/supabase-db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // 1. Fetch settings
    const settingsRes = await neonQuery(
      "SELECT broadcast_mode, live_stream_url, live_title, live_fallback_set_id FROM radio_settings WHERE id = 1"
    );
    const settings = settingsRes.rows[0] || {
      broadcast_mode: "curated",
      live_stream_url: "",
      live_title: "GOODLIFE MAIN STAGE LIVE",
      live_fallback_set_id: null,
    };

    // 2. Fetch active ready tracks
    const setsRes = await neonQuery(`
      SELECT 
        id, event_id, title, dj_name, audio_url, audio_high_url, cover_url, 
        duration, duration_sec, genre, file_size, bitrate, play_count, created_at
      FROM radio_sets
      WHERE deleted_at IS NULL AND is_active = true AND processing_status = 'ready'
      ORDER BY display_order ASC, created_at DESC
    `);
    const sets = setsRes.rows || [];

    // 3. Fallback set if live mode
    let fallbackSet = null;
    if (settings.live_fallback_set_id) {
      fallbackSet = sets.find((s: any) => s.id === settings.live_fallback_set_id) || sets[0] || null;
    } else if (sets.length > 0) {
      fallbackSet = sets[0];
    }

    const payload = {
      mode: settings.broadcast_mode || "curated",
      live: {
        title: settings.live_title || "GOODLIFE MAIN STAGE LIVE",
        stream_url: settings.live_stream_url || "",
        fallback_set: fallbackSet,
      },
      sets,
    };

    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "s-maxage=10, stale-while-revalidate=20",
      },
    });
  } catch (err: any) {
    console.error("[api/radio/state] Error:", err);
    return NextResponse.json(
      { mode: "curated", live: { title: "", stream_url: "", fallback_set: null }, sets: [] },
      { status: 500 }
    );
  }
}
