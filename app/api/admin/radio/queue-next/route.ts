import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { bridgeQueueNext } from "@/lib/radio/bridge-client";
import { neonQuery } from "@/lib/supabase-db";

export async function POST(req: NextRequest) {
  const unauthorized = await requireAdmin(req);
  if (unauthorized) return unauthorized;

  try {
    const body = await req.json();
    const {
      url,
      custom_drop_text,
      voice_preference,
      play_now,
      track_id,
      title,
      artist,
      duration_sec,
      thumbnail_url,
    } = body;

    let targetTrack: {
      id: number;
      title: string;
      dj_name: string;
      duration_sec: number;
      audio_url: string;
    } | null = null;

    // 1. If this is an existing library track (track_id provided)
    if (track_id) {
      const { rows } = await neonQuery(
        `SELECT id, title, dj_name, duration_sec, audio_url FROM radio_sets WHERE id = $1 AND deleted_at IS NULL`,
        [track_id]
      );
      if (rows && rows.length > 0) {
        targetTrack = rows[0];
      }
    }

    // 2. If no track_id, try to find existing by audio_url or title
    if (!targetTrack && url && typeof url === "string") {
      const trimmedUrl = url.trim();
      const existingRes = await neonQuery(
        `SELECT id, title, dj_name, duration_sec, audio_url FROM radio_sets 
         WHERE (audio_url = $1 OR external_id = $1) AND deleted_at IS NULL LIMIT 1`,
        [trimmedUrl]
      );
      if (existingRes.rows.length > 0) {
        targetTrack = existingRes.rows[0];
      } else {
        // Insert as a new track into radio_sets
        const durSec = typeof duration_sec === "number" && duration_sec > 0 ? Math.round(duration_sec) : 180;
        const mins = Math.floor(durSec / 60);
        const secs = durSec % 60;
        const durationStr = `${mins}:${secs.toString().padStart(2, "0")}`;

        let safeThumbnail = (thumbnail_url && typeof thumbnail_url === "string") ? thumbnail_url.trim() : "";
        if (
          !safeThumbnail ||
          safeThumbnail.includes("192.168.") ||
          safeThumbnail.includes("localhost") ||
          safeThumbnail.includes("127.0.0.1") ||
          safeThumbnail.includes(":3000")
        ) {
          const match = trimmedUrl.match(/(?:v=|youtu\.be\/|embed\/|\/v\/)([a-zA-Z0-9_-]{11})/);
          safeThumbnail = match ? `https://i.ytimg.com/vi/${match[1]}/hqdefault.jpg` : "/flyer.png";
        }

        const insertRes = await neonQuery(
          `INSERT INTO radio_sets (
            event_id, title, dj_name, audio_url, cover_url, duration, duration_sec, genre,
            processing_status, is_active, display_order, source_type
          ) VALUES (
            2, $1, $2, $3, $4, $5, $6, 'Hip-Hop',
            'ready', true, 0, 'on_the_fly'
          ) RETURNING id, title, dj_name, duration_sec, audio_url`,
          [
            (title && typeof title === "string" && title.trim()) || "Quick Insert Track",
            (artist && typeof artist === "string" && artist.trim()) || "Guest Artist",
            trimmedUrl,
            safeThumbnail,
            durationStr,
            durSec,
          ]
        );
        if (insertRes.rows.length > 0) {
          targetTrack = insertRes.rows[0];
        }
      }
    }

    if (!targetTrack) {
      return NextResponse.json(
        { error: "Track could not be resolved from library or URL." },
        { status: 400 }
      );
    }

    // 3. Dispatch to bridge in background if URL is available
    if (url && typeof url === "string") {
      bridgeQueueNext({
        url: url.trim(),
        custom_drop_text: custom_drop_text?.trim() || undefined,
        voice_preference: voice_preference === "female" ? "female" : "male",
      }).catch(() => {});
    }

    // 4. Handle PLAY NOW (Cut in immediately)
    if (play_now) {
      await neonQuery(
        `UPDATE radio_settings 
         SET broadcast_mode = 'mania', active_set_id = $1, active_started_at = NOW(), updated_at = NOW() 
         WHERE id = 1`,
        [targetTrack.id]
      );

      return NextResponse.json({
        status: "success",
        artist: targetTrack.dj_name,
        title: targetTrack.title,
        queued_as_up_next: false,
        played_now: true,
      });
    }

    // 5. Handle QUEUE AS UP NEXT (Insert directly after current playing track in broadcast playlist)
    const activePlaylistRes = await neonQuery(
      `SELECT p.id, p.activated_at 
       FROM radio_playlists p 
       WHERE p.is_broadcast_active = true AND p.deleted_at IS NULL 
       LIMIT 1`
    );

    if (activePlaylistRes.rows.length > 0) {
      const playlistId = activePlaylistRes.rows[0].id;
      const activatedAt = activePlaylistRes.rows[0].activated_at;

      // Get current tracks in this playlist
      const tracksRes = await neonQuery(
        `SELECT pt.id, pt.position, s.duration_sec 
         FROM radio_playlist_tracks pt 
         JOIN radio_sets s ON s.id = pt.track_id 
         WHERE pt.playlist_id = $1 
         ORDER BY pt.position ASC, pt.id ASC`,
        [playlistId]
      );

      const tracks = tracksRes.rows || [];
      let currentPosition = 0;

      if (tracks.length > 0) {
        const totalDurationSec = tracks.reduce((acc: number, t: any) => acc + (t.duration_sec || 180), 0);
        const nowSec = Math.floor(Date.now() / 1000);
        let cycleSec = 0;

        if (activatedAt) {
          const activatedAtSec = Math.floor(new Date(activatedAt).getTime() / 1000);
          const elapsed = Math.max(0, nowSec - activatedAtSec);
          cycleSec = totalDurationSec > 0 ? (elapsed % totalDurationSec) : 0;
        } else {
          cycleSec = totalDurationSec > 0 ? (nowSec % totalDurationSec) : 0;
        }

        let cumulative = 0;
        for (let i = 0; i < tracks.length; i++) {
          const dur = tracks[i].duration_sec || 180;
          if (cumulative + dur > cycleSec) {
            currentPosition = tracks[i].position;
            break;
          }
          cumulative += dur;
        }
      }

      // Shift subsequent tracks to open slot at currentPosition + 1
      await neonQuery(
        `UPDATE radio_playlist_tracks 
         SET position = position + 1 
         WHERE playlist_id = $1 AND position > $2`,
        [playlistId, currentPosition]
      );

      // Insert targetTrack into the playlist right as UP NEXT!
      await neonQuery(
        `INSERT INTO radio_playlist_tracks (playlist_id, track_id, position)
         VALUES ($1, $2, $3)`,
        [playlistId, targetTrack.id, currentPosition + 1]
      );
    } else {
      // No active playlist: switch station to this track as mania
      await neonQuery(
        `UPDATE radio_settings 
         SET broadcast_mode = 'mania', active_set_id = $1, active_started_at = NOW(), updated_at = NOW() 
         WHERE id = 1`,
        [targetTrack.id]
      );
    }

    return NextResponse.json({
      status: "success",
      artist: targetTrack.dj_name,
      title: targetTrack.title,
      queued_as_up_next: true,
      played_now: false,
    });
  } catch (err: any) {
    console.error("[api/admin/radio/queue-next] Error:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error queueing track." },
      { status: 500 }
    );
  }
}
