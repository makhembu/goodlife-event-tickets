import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { bridgeSkipTrack } from "@/lib/radio/bridge-client";
import { neonQuery } from "@/lib/supabase-db";
import { computeLiveTimeline } from "@/lib/radio/timeline";

export const dynamic = "force-dynamic";

export async function POST() {
  const authErr = await requireAdmin();
  if (authErr) return authErr;

  // 1. If bridge / AzuraCast is reachable, dispatch skip to upstream Icecast daemon
  try {
    const res = await bridgeSkipTrack();
    if (res && res.ok) {
      return NextResponse.json(res.data);
    }
  } catch {
    // Upstream bridge unreachable or off; seamlessly advance internal 24/7 timeline
  }

  // 2. Seamless Station Fallback: Advance 24/7 Neon broadcast schedule to next track
  try {
    const [setsRes, settingsRes] = await Promise.all([
      neonQuery(`
        SELECT id, title, dj_name, audio_url, duration_sec, display_order
        FROM radio_sets
        WHERE deleted_at IS NULL AND is_active = true AND processing_status = 'ready'
        ORDER BY display_order ASC, id ASC
      `),
      neonQuery("SELECT broadcast_mode, active_set_id, active_started_at FROM radio_settings WHERE id = 1"),
    ]);

    const sets = setsRes.rows || [];
    if (sets.length === 0) {
      return NextResponse.json({ error: "No active radio sets available to skip" }, { status: 404 });
    }

    const settings = settingsRes.rows[0] || {};
    let currentIdx = 0;

    if (settings.broadcast_mode === "mania" && settings.active_set_id) {
      const idx = sets.findIndex((s: any) => s.id === Number(settings.active_set_id));
      if (idx !== -1) {
        currentIdx = idx;
      }
    } else {
      const timeline = computeLiveTimeline(sets);
      currentIdx = timeline.index;
    }

    const nextIdx = (currentIdx + 1) % sets.length;
    const nextSet = sets[nextIdx];

    await neonQuery(
      "UPDATE radio_settings SET broadcast_mode = 'mania', active_set_id = $1, active_started_at = NOW(), updated_at = NOW() WHERE id = 1",
      [nextSet.id]
    );

    return NextResponse.json({
      status: "success",
      action: "skipped_to_next",
      now_playing: {
        id: nextSet.id,
        title: nextSet.title,
        dj_name: nextSet.dj_name,
        audio_url: nextSet.audio_url,
      },
    });
  } catch (fallbackErr: any) {
    console.error("[api/admin/radio/azuracast/skip] Skip fallback failed:", fallbackErr);
    return NextResponse.json(
      { error: fallbackErr.message || "Failed to advance track" },
      { status: 500 }
    );
  }
}
