import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { bridgeQueueNext } from "@/lib/radio/bridge-client";
import { neonQuery } from "@/lib/supabase-db";

export async function POST(req: NextRequest) {
  const unauthorized = await requireAdmin(req);
  if (unauthorized) return unauthorized;

  try {
    const body = await req.json();
    const { url, custom_drop_text, voice_preference, play_now, track_id } = body;

    // 1. If this is an existing library track (track_id provided)
    if (track_id) {
      const { rows } = await neonQuery(
        `SELECT id, title, dj_name, duration_sec, audio_url FROM radio_sets WHERE id = $1 AND deleted_at IS NULL`,
        [track_id]
      );
      if (rows && rows.length > 0) {
        const set = rows[0];
        if (play_now) {
          await neonQuery(
            `UPDATE radio_settings 
             SET broadcast_mode = 'mania', active_set_id = $1, active_started_at = NOW(), updated_at = NOW() 
             WHERE id = 1`,
            [set.id]
          );
        }
        return NextResponse.json({
          status: "success",
          artist: set.dj_name || "Library Track",
          title: set.title,
          queued_as_up_next: !play_now,
          played_now: Boolean(play_now),
        });
      }
    }

    if (!url || typeof url !== "string") {
      return NextResponse.json(
        { error: "A valid track URL (YouTube, SoundCloud, or direct audio link) is required." },
        { status: 400 }
      );
    }

    const result = await bridgeQueueNext({
      url: url.trim(),
      custom_drop_text: custom_drop_text?.trim() || undefined,
      voice_preference: voice_preference === "female" ? "female" : "male",
    });

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error || "Failed to process and queue track." },
        { status: 502 }
      );
    }

    if (play_now && result.data?.media_id) {
      // In mania mode, play media immediately if play_now was requested
      try {
        await neonQuery(
          `UPDATE radio_settings 
           SET broadcast_mode = 'mania', active_started_at = NOW(), updated_at = NOW() 
           WHERE id = 1`
        );
      } catch {}
    }

    return NextResponse.json(result.data, { status: 200 });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Internal server error queueing track." },
      { status: 500 }
    );
  }
}
