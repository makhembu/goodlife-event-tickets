import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { neonQuery } from "@/lib/supabase-db";
import { resolveCoverArt, formatTrackTitle } from "@/lib/radio/media-helpers";
import { computeLiveTimeline } from "@/lib/radio/timeline";
import { invalidateLivePlayoutCache, invalidateRadioStateCache } from "@/lib/radio/playout-cache";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const unauthorized = await requireAdmin(req);
  if (unauthorized) return unauthorized;

  try {
    // 1. Check for active broadcast playlist first
    const [playlistRes, settingsRes] = await Promise.all([
      neonQuery(`
        SELECT p.id as playlist_id, p.name as playlist_name, p.activated_at,
               s.id, s.event_id, s.title, s.dj_name, s.audio_url, s.audio_high_url, s.cover_url, 
               s.duration, s.duration_sec, s.genre, pt.position
        FROM radio_playlists p
        JOIN radio_playlist_tracks pt ON pt.playlist_id = p.id
        JOIN radio_sets s ON s.id = pt.track_id AND s.deleted_at IS NULL AND (s.is_active = true OR s.is_active IS NULL)
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

      // Check if track is part of the active broadcast playlist
      const plTrackRes = await neonQuery(`
        SELECT pt.playlist_id, pt.position
        FROM radio_playlist_tracks pt
        JOIN radio_playlists p ON p.id = pt.playlist_id AND p.is_broadcast_active = true
        WHERE pt.track_id = $1
        LIMIT 1
      `, [setId]);

      if (plTrackRes.rows.length > 0) {
        const { playlist_id, position } = plTrackRes.rows[0];
        // Calculate cumulative seconds up to this track in the active playlist
        const cumRes = await neonQuery(`
          SELECT COALESCE(SUM(s.duration_sec), 0)::int as cum_sec
          FROM radio_playlist_tracks pt
          JOIN radio_sets s ON s.id = pt.track_id
          WHERE pt.playlist_id = $1 AND pt.position < $2
        `, [playlist_id, position]);
        const cumSec = cumRes.rows[0]?.cum_sec || 0;
        // Anchor activated_at = NOW() - cumSec so AutoDJ sequence naturally starts at track position and flows forward!
        await neonQuery(
          `UPDATE radio_playlists
           SET activated_at = NOW() - INTERVAL '1 second' * $1,
               updated_at = NOW()
           WHERE id = $2`,
          [cumSec, playlist_id]
        );
      } else {
        // Track not in active broadcast playlist: insert it into playlist
        const activePl = await neonQuery(
          `SELECT id FROM radio_playlists WHERE is_broadcast_active = true AND deleted_at IS NULL LIMIT 1`
        );
        if (activePl.rows.length > 0) {
          const playlistId = activePl.rows[0].id;
          const posRes = await neonQuery(
            `SELECT COALESCE(MAX(position), 0) + 1 AS next_pos FROM radio_playlist_tracks WHERE playlist_id = $1`,
            [playlistId]
          );
          const nextPos = posRes.rows[0]?.next_pos || 1;
          await neonQuery(
            `INSERT INTO radio_playlist_tracks (playlist_id, track_id, position, created_at)
             VALUES ($1, $2, $3, NOW())
             ON CONFLICT DO NOTHING`,
            [playlistId, setId, nextPos]
          );
        }
      }

      // Immediately switch into MANIA mode and lock this track on air!
      await neonQuery(
        `UPDATE radio_settings
         SET broadcast_mode = 'mania',
             active_set_id = $1,
             active_started_at = NOW(),
             queued_next_set_id = NULL,
             updated_at = NOW()
         WHERE id = 1`,
        [setId]
      );
      invalidateLivePlayoutCache();
      invalidateRadioStateCache();

      return NextResponse.json({
        success: true,
        mode: "mania",
        active_track: setCheck.rows[0],
      });
    }

    if (action === "play_next") {
      if (!setId) {
        return NextResponse.json({ error: "Missing setId" }, { status: 400 });
      }

      // Check for active broadcast playlist first
      const activePlRes = await neonQuery(`
        SELECT p.id as playlist_id, p.activated_at
        FROM radio_playlists p
        WHERE p.is_broadcast_active = true AND p.deleted_at IS NULL
        LIMIT 1
      `);

      // Determine active track ID from settings or client request
      const settingsRes = await neonQuery(
        "SELECT broadcast_mode, active_set_id, active_started_at, queued_next_set_id FROM radio_settings WHERE id = 1"
      );
      const settings = settingsRes.rows[0] || {};
      const isMania = settings.broadcast_mode === "mania" && settings.active_set_id;
      let activeSetId = isMania
        ? Number(settings.active_set_id)
        : (settings.active_set_id ? Number(settings.active_set_id) : null);

      const reqCurrentTrackId = body.currentTrackId ? Number(body.currentTrackId) : null;
      if (reqCurrentTrackId && !isNaN(reqCurrentTrackId)) {
        activeSetId = reqCurrentTrackId;
      }

      if (activePlRes.rows.length > 0) {
        const playlistId = activePlRes.rows[0].playlist_id;
        const activatedAt = activePlRes.rows[0].activated_at;
        const tracksRes = await neonQuery(
          `SELECT pt.track_id, pt.position, s.duration_sec 
           FROM radio_playlist_tracks pt 
           JOIN radio_sets s ON s.id = pt.track_id 
           WHERE pt.playlist_id = $1 
           ORDER BY pt.position ASC, pt.id ASC`,
          [playlistId]
        );
        const tracks = tracksRes.rows || [];
        const list = tracks.map((r: any) => Number(r.track_id));
        const fromIdx = list.indexOf(Number(setId));

        // Find currently playing track index in active playlist
        let activeIdx = -1;
        if (activeSetId) {
          activeIdx = list.indexOf(activeSetId);
        }

        // If in AutoDJ or activeSetId not found in playlist, calculate from virtual timeline
        if (activeIdx === -1 && tracks.length > 0) {
          const totalDurationSec = tracks.reduce((acc: number, t: any) => acc + (t.duration_sec || 180), 0);
          const nowSec = Math.floor(Date.now() / 1000);
          const activatedAtSec = activatedAt ? Math.floor(new Date(activatedAt).getTime() / 1000) : nowSec;
          const elapsed = Math.max(0, nowSec - activatedAtSec);
          const cycleSec = totalDurationSec > 0 ? (elapsed % totalDurationSec) : 0;

          let cumulative = 0;
          for (let i = 0; i < tracks.length; i++) {
            const dur = tracks[i].duration_sec || 180;
            if (cumulative + dur > cycleSec) {
              activeIdx = i;
              break;
            }
            cumulative += dur;
          }
          if (activeIdx === -1) activeIdx = 0;
        }

        // Target insertion slot is directly after the currently playing song
        const targetInsertIdx = activeIdx + 1;

        if (fromIdx !== -1) {
          // Track is already in this playlist: remove and reinsert at targetInsertIdx
          const [item] = list.splice(fromIdx, 1);
          const finalInsertIdx = fromIdx < targetInsertIdx ? targetInsertIdx - 1 : targetInsertIdx;
          list.splice(finalInsertIdx, 0, item);

          // Update positions in DB
          await neonQuery(
            `UPDATE radio_playlist_tracks AS pt
             SET position = v.new_pos
             FROM (
               SELECT unnest($2::int[]) AS track_id,
                      (generate_subscripts($2::int[], 1) - 1)::int AS new_pos
             ) AS v
             WHERE pt.playlist_id = $1 AND pt.track_id = v.track_id`,
            [playlistId, list]
          );
        } else {
          // Track is NOT in playlist yet: shift subsequent tracks and insert at activeIdx + 1
          const activePos = tracks[activeIdx]?.position ?? 0;
          await neonQuery(
            `UPDATE radio_playlist_tracks 
             SET position = position + 1 
             WHERE playlist_id = $1 AND position > $2`,
            [playlistId, activePos]
          );
          await neonQuery(
            `INSERT INTO radio_playlist_tracks (playlist_id, track_id, position, created_at)
             VALUES ($1, $2, $3, NOW())
             ON CONFLICT DO NOTHING`,
            [playlistId, setId, activePos + 1]
          );
        }

        // Keep current on-air track playing: DO NOT change activated_at!
        // Preserving activated_at keeps the virtual elapsed timeline anchored to the current track,
        // so the newly queued track will play NEXT when current track finishes.

        // Store queued_next_set_id in radio_settings
        await neonQuery(
          `UPDATE radio_settings 
           SET queued_next_set_id = $1, updated_at = NOW() 
           WHERE id = 1`,
          [setId]
        );

        invalidateLivePlayoutCache();
        invalidateRadioStateCache();
        return NextResponse.json({ success: true, message: "Queued as next track", queued_next_set_id: setId });
      }

      // Fallback: general radio_sets catalog
      const allSets = await neonQuery(
        "SELECT id, display_order FROM radio_sets WHERE deleted_at IS NULL AND is_active = true ORDER BY display_order ASC, id ASC"
      );
      const list = allSets.rows.map((r: any) => Number(r.id));
      const fromIdx = list.indexOf(Number(setId));
      const activeIdx = activeSetId ? list.indexOf(Number(activeSetId)) : -1;

      if (fromIdx !== -1) {
        const [item] = list.splice(fromIdx, 1);
        const insertIdx = activeIdx !== -1
          ? (fromIdx > activeIdx ? activeIdx + 1 : activeIdx)
          : 0;
        list.splice(insertIdx, 0, item);

        await neonQuery(
          `UPDATE radio_sets AS s
           SET display_order = v.new_order
           FROM (
             SELECT unnest($1::int[]) AS id,
                    (generate_subscripts($1::int[], 1) - 1)::int AS new_order
           ) AS v
           WHERE s.id = v.id`,
          [list]
        );

        await neonQuery(
          `UPDATE radio_settings 
           SET queued_next_set_id = $1, updated_at = NOW() 
           WHERE id = 1`,
          [setId]
        );

        invalidateLivePlayoutCache();
        invalidateRadioStateCache();
        return NextResponse.json({ success: true, message: "Queued as next track", queued_next_set_id: setId });
      }

      return NextResponse.json({ error: "Track not found in rotation" }, { status: 404 });
    }

    if (action === "reorder") {
      if (!setId || !direction) {
        return NextResponse.json({ error: "Missing setId or direction" }, { status: 400 });
      }

      // Check active broadcast playlist
      const activePlRes = await neonQuery(`
        SELECT p.id as playlist_id
        FROM radio_playlists p
        WHERE p.is_broadcast_active = true AND p.deleted_at IS NULL
        LIMIT 1
      `);

      if (activePlRes.rows.length > 0) {
        const playlistId = activePlRes.rows[0].playlist_id;
        const tracksRes = await neonQuery(
          `SELECT track_id, position FROM radio_playlist_tracks WHERE playlist_id = $1 ORDER BY position ASC, id ASC`,
          [playlistId]
        );
        const list = tracksRes.rows.map((r: any) => Number(r.track_id));
        const idx = list.indexOf(Number(setId));
        if (idx !== -1) {
          const swapIdx = direction === "up" ? idx - 1 : idx + 1;
          if (swapIdx >= 0 && swapIdx < list.length) {
            const temp = list[idx];
            list[idx] = list[swapIdx];
            list[swapIdx] = temp;
            
            await neonQuery(
              `UPDATE radio_playlist_tracks AS pt
               SET position = v.new_pos
               FROM (
                 SELECT unnest($2::int[]) AS track_id,
                        (generate_subscripts($2::int[], 1) - 1)::int AS new_pos
               ) AS v
               WHERE pt.playlist_id = $1 AND pt.track_id = v.track_id`,
              [playlistId, list]
            );
            await neonQuery("UPDATE radio_playlists SET updated_at = NOW() WHERE id = $1", [playlistId]);
            return NextResponse.json({ success: true });
          }
          return NextResponse.json({ success: true, message: "Already at boundary" });
        }
      }

      // Fallback: general radio_sets
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
