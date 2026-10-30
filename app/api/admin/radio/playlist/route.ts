import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { neonQuery } from "@/lib/supabase-db";
import { resolveCoverArt, formatTrackTitle } from "@/lib/radio/media-helpers";
import { computeLiveTimeline } from "@/lib/radio/timeline";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const setsRes = await neonQuery(`
      SELECT 
        id, event_id, title, dj_name, audio_url, audio_high_url, cover_url, 
        duration, duration_sec, genre, display_order, is_active, created_at
      FROM radio_sets
      WHERE deleted_at IS NULL AND is_active = true
      ORDER BY display_order ASC, id ASC
    `);

    const sets = (setsRes.rows || []).map((s: any) => ({
      ...s,
      title: formatTrackTitle(s.title),
      cover_url: resolveCoverArt(s.cover_url),
    }));

    const settingsRes = await neonQuery(
      "SELECT broadcast_mode, active_set_id, active_started_at FROM radio_settings WHERE id = 1"
    );
    const settings = settingsRes.rows[0] || {};

    let activeSetId: number | null = null;
    let mode: "autodj" | "mania" = settings.broadcast_mode === "mania" ? "mania" : "autodj";

    if (mode === "mania" && settings.active_set_id) {
      const maniaSet = sets.find((s: any) => s.id === Number(settings.active_set_id));
      if (maniaSet) {
        const trackDur = (maniaSet.duration_sec && maniaSet.duration_sec > 0) ? maniaSet.duration_sec : 180;
        const startedAtMs = settings.active_started_at ? new Date(settings.active_started_at).getTime() : Date.now();
        const elapsed = Math.max(0, Math.floor((Date.now() - startedAtMs) / 1000));
        if (elapsed < trackDur) {
          activeSetId = maniaSet.id;
        } else {
          mode = "autodj";
        }
      } else {
        mode = "autodj";
      }
    }

    if (mode === "autodj" && sets.length > 0) {
      const timeline = computeLiveTimeline(sets);
      activeSetId = sets[timeline.index]?.id || sets[0]?.id || null;
    }

    return NextResponse.json({
      mode,
      active_set_id: activeSetId,
      sets,
    });
  } catch (err: any) {
    console.error("[api/admin/radio/playlist] GET error:", err);
    return NextResponse.json({ error: err.message, sets: [] }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const unauthorized = await requireAdmin(req);
  if (unauthorized) return unauthorized;

  try {
    const body = await req.json().catch(() => ({}));
    const { action, setId, direction } = body;

    if (action === "play_now") {
      if (!setId) {
        return NextResponse.json({ error: "Missing setId" }, { status: 400 });
      }

      // Verify the set exists
      const setCheck = await neonQuery(
        "SELECT id, title, dj_name, audio_url, duration_sec FROM radio_sets WHERE id = $1 AND deleted_at IS NULL",
        [setId]
      );
      if (setCheck.rows.length === 0) {
        return NextResponse.json({ error: "Track not found" }, { status: 404 });
      }

      // Immediately switch into MANIA mode and lock this track on air!
      await neonQuery(
        `UPDATE radio_settings
         SET broadcast_mode = 'mania',
             active_set_id = $1,
             active_started_at = NOW(),
             updated_at = NOW()
         WHERE id = 1`,
        [setId]
      );

      return NextResponse.json({
        success: true,
        mode: "mania",
        active_track: setCheck.rows[0],
      });
    }

    if (action === "reorder") {
      if (!setId || !direction) {
        return NextResponse.json({ error: "Missing setId or direction" }, { status: 400 });
      }

      // Get current list of sets ordered by display_order
      const allSets = await neonQuery(
        "SELECT id, display_order FROM radio_sets WHERE deleted_at IS NULL AND is_active = true ORDER BY display_order ASC, id ASC"
      );
      const rows = allSets.rows;
      const idx = rows.findIndex((r: any) => r.id === Number(setId));

      if (idx === -1) {
        return NextResponse.json({ error: "Track not found in active list" }, { status: 404 });
      }

      const swapIdx = direction === "up" ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= rows.length) {
        return NextResponse.json({ success: true, message: "Already at boundary" });
      }

      const currentItem = rows[idx];
      const targetItem = rows[swapIdx];

      // Swap their display_order values
      const currentOrder = currentItem.display_order ?? idx;
      const targetOrder = targetItem.display_order ?? swapIdx;
      const newCurrentOrder = targetOrder === currentOrder ? (direction === "up" ? currentOrder - 1 : currentOrder + 1) : targetOrder;

      await neonQuery("UPDATE radio_sets SET display_order = $1 WHERE id = $2", [newCurrentOrder, currentItem.id]);
      await neonQuery("UPDATE radio_sets SET display_order = $1 WHERE id = $2", [currentOrder, targetItem.id]);

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err: any) {
    console.error("[api/admin/radio/playlist] POST error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const unauthorized = await requireAdmin(req);
  if (unauthorized) return unauthorized;

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }

    await neonQuery(
      "UPDATE radio_sets SET is_active = false, deleted_at = NOW() WHERE id = $1",
      [Number(id)]
    );

    return NextResponse.json({ success: true, deleted_id: Number(id) });
  } catch (err: any) {
    console.error("[api/admin/radio/playlist] DELETE error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
