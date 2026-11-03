import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { neonQuery } from "@/lib/supabase-db";
import { resolveCoverArt, formatTrackTitle } from "@/lib/radio/media-helpers";
import { computeLiveTimeline } from "@/lib/radio/timeline";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    // 1. Check for active broadcast playlist first
    const [playlistRes, settingsRes] = await Promise.all([
      neonQuery(`
        SELECT p.id as playlist_id, p.name as playlist_name, p.activated_at,
               s.id, s.event_id, s.title, s.dj_name, s.audio_url, s.audio_high_url, s.cover_url, 
               s.duration, s.duration_sec, s.genre, pt.position
        FROM radio_playlists p
        JOIN radio_playlist_tracks pt ON pt.playlist_id = p.id
        JOIN radio_sets s ON s.id = pt.track_id AND s.deleted_at IS NULL AND s.is_active = true
        WHERE p.is_broadcast_active = true AND p.deleted_at IS NULL
        ORDER BY pt.position ASC, pt.id ASC
      `).catch(() => ({ rows: [] })),
      neonQuery("SELECT broadcast_mode, active_set_id, active_started_at FROM radio_settings WHERE id = 1"),
    ]);

    const settings = settingsRes.rows[0] || {};
    let activeSetId: number | null = null;
    let mode: "autodj" | "mania" = settings.broadcast_mode === "mania" ? "mania" : "autodj";
    let sets: any[] = [];
    let isPlaylistBroadcast = false;
    let playlistName: string | null = null;
    let playlistId: number | null = null;

    if (playlistRes.rows.length > 0) {
      isPlaylistBroadcast = true;
      playlistName = playlistRes.rows[0].playlist_name;
      playlistId = playlistRes.rows[0].playlist_id;
      const activatedAt = playlistRes.rows[0].activated_at;

      sets = playlistRes.rows.map((s: any) => ({
        ...s,
        title: formatTrackTitle(s.title),
        cover_url: resolveCoverArt(s.cover_url),
      }));

      // Determine active track in active broadcast playlist
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
        const totalDurationSec = sets.reduce((acc: number, s: any) => acc + (s.duration_sec || 180), 0);
        const nowSec = Math.floor(Date.now() / 1000);
        let cycleSec = 0;

        if (activatedAt) {
          const activatedAtSec = Math.floor(new Date(activatedAt).getTime() / 1000);
          const elapsedSinceActivation = Math.max(0, nowSec - activatedAtSec);
          cycleSec = totalDurationSec > 0 ? (elapsedSinceActivation % totalDurationSec) : 0;
        } else {
          cycleSec = totalDurationSec > 0 ? (nowSec % totalDurationSec) : 0;
        }

        let cumulative = 0;
        for (let i = 0; i < sets.length; i++) {
          const dur = sets[i].duration_sec || 180;
          if (cumulative + dur > cycleSec) {
            activeSetId = sets[i].id;
            break;
          }
          cumulative += dur;
        }
      }
    } else {
      // Fallback: general radio_sets catalog
      const setsRes = await neonQuery(`
        SELECT 
          id, event_id, title, dj_name, audio_url, audio_high_url, cover_url, 
          duration, duration_sec, genre, display_order, is_active, created_at
        FROM radio_sets
        WHERE deleted_at IS NULL AND is_active = true
        ORDER BY display_order ASC, id ASC
      `);

      sets = (setsRes.rows || []).map((s: any) => ({
        ...s,
        title: formatTrackTitle(s.title),
        cover_url: resolveCoverArt(s.cover_url),
      }));

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
    }

    return NextResponse.json({
      mode,
      active_set_id: activeSetId,
      playlist_name: playlistName,
      playlist_id: playlistId,
      is_playlist_broadcast: isPlaylistBroadcast,
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
