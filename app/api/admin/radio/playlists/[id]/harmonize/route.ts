import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { neonQuery } from "@/lib/supabase-db";
import { isCamelotCompatible } from "@/lib/radio/sequencer";

interface HarmonizeTrackCandidate {
  id: number;
  title: string;
  dj_name: string;
  bpm: number | null;
  musical_key: string | null;
  energy: number | null;
  duration_sec: number;
  is_full_set: boolean;
  position: number;
}

export interface TransitionDetail {
  fromTrackId: number;
  toTrackId: number;
  fromTitle: string;
  toTitle: string;
  fromKey: string;
  toKey: string;
  fromBpm: number;
  toBpm: number;
  keyRelation: "exact" | "relative" | "adjacent" | "clash";
  bpmDeltaPercent: number;
  isCompatible: boolean;
}

function getKeyRelation(keyA: string, keyB: string): "exact" | "relative" | "adjacent" | "clash" {
  const parse = (k: string) => {
    const m = k.trim().toUpperCase().match(/^(\d{1,2})([AB])$/);
    if (!m) return null;
    return { num: parseInt(m[1], 10), letter: m[2] };
  };
  const a = parse(keyA);
  const b = parse(keyB);
  if (!a || !b) return "clash";

  if (a.num === b.num && a.letter === b.letter) return "exact";
  if (a.num === b.num && a.letter !== b.letter) return "relative";
  if (a.letter === b.letter) {
    const diff = Math.abs(a.num - b.num);
    if (diff === 1 || diff === 11) return "adjacent";
  }
  return "clash";
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authErr = await requireAdmin();
  if (authErr) return authErr;

  const resolvedParams = await params;
  const playlistId = parseInt(resolvedParams.id, 10);
  if (isNaN(playlistId)) {
    return NextResponse.json({ error: "Invalid playlist ID" }, { status: 400 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const openerTrackId = body.openerTrackId ? Number(body.openerTrackId) : null;

    // Fetch playlist & its tracks
    const playlistRes = await neonQuery(
      `SELECT id, name, is_broadcast_active FROM radio_playlists WHERE id = $1 AND deleted_at IS NULL`,
      [playlistId]
    );
    if (playlistRes.rows.length === 0) {
      return NextResponse.json({ error: "Playlist not found" }, { status: 404 });
    }
    const playlist = playlistRes.rows[0];

    const tracksRes = await neonQuery(
      `SELECT 
        s.id, s.title, s.dj_name, s.bpm, s.musical_key, s.energy, 
        s.duration_sec, s.is_full_set, pt.position
       FROM radio_playlist_tracks pt
       JOIN radio_sets s ON s.id = pt.track_id
       WHERE pt.playlist_id = $1 AND s.deleted_at IS NULL
       ORDER BY pt.position ASC, pt.id ASC`,
      [playlistId]
    );

    const tracks: HarmonizeTrackCandidate[] = tracksRes.rows || [];
    if (tracks.length === 0) {
      return NextResponse.json({ error: "Playlist is empty" }, { status: 400 });
    }

    const currentOrder = tracks.map((t) => t.id);

    // Rule: Partition into indexed vs unindexed tracks
    // Tracks missing either key or bpm are strictly unindexed. We never guess or infer keys!
    const indexedTracks: HarmonizeTrackCandidate[] = [];
    const unindexedTracks: HarmonizeTrackCandidate[] = [];
    const fullSetAnchors: HarmonizeTrackCandidate[] = [];

    for (const t of tracks) {
      if (t.is_full_set || (t.duration_sec && t.duration_sec >= 1500)) {
        fullSetAnchors.push(t);
      } else if (t.bpm && t.musical_key && /^(1[0-2]|[1-9])[AB]$/.test(t.musical_key.trim().toUpperCase())) {
        indexedTracks.push({
          ...t,
          musical_key: t.musical_key.trim().toUpperCase(),
        });
      } else {
        unindexedTracks.push(t);
      }
    }

    // If no indexed tracks, cannot run harmonic sequencing
    if (indexedTracks.length === 0) {
      return NextResponse.json({
        success: false,
        error: "None of the tracks in this playlist have verified BPM and Camelot Key metadata.",
        totalTracks: tracks.length,
        unindexedCount: unindexedTracks.length,
        fullSetCount: fullSetAnchors.length,
      }, { status: 422 });
    }

    // Determine starting track
    let openerIndex = -1;
    if (openerTrackId) {
      openerIndex = indexedTracks.findIndex((t) => t.id === openerTrackId);
    }
    if (openerIndex === -1) {
      openerIndex = 0; // Default to first indexed track
    }

    // Sequence indexed tracks greedily with deterministic tie-breaking
    const sequenced: HarmonizeTrackCandidate[] = [];
    const pool = [...indexedTracks];
    const opener = pool.splice(openerIndex, 1)[0];
    sequenced.push(opener);

    const transitions: TransitionDetail[] = [];

    while (pool.length > 0) {
      const prev = sequenced[sequenced.length - 1];

      // Score candidates
      const scored = pool.map((cand) => {
        let score = 100;

        // 1. Key Compatibility
        const relation = getKeyRelation(prev.musical_key!, cand.musical_key!);
        if (relation === "exact") score += 35;
        else if (relation === "relative") score += 30;
        else if (relation === "adjacent") score += 20;
        else score -= 35; // Clash

        // 2. BPM Delta (envelope +/- 6%)
        const bpmDeltaRatio = Math.abs(cand.bpm! - prev.bpm!) / prev.bpm!;
        if (bpmDeltaRatio <= 0.03) score += 25;
        else if (bpmDeltaRatio <= 0.06) score += 15;
        else if (bpmDeltaRatio <= 0.12) score += 0;
        else score -= 30;

        // 3. Artist separation (avoid same artist consecutively)
        if (cand.dj_name && prev.dj_name && cand.dj_name.toLowerCase() === prev.dj_name.toLowerCase()) {
          score -= 40;
        }

        // 4. Energy progression if both tracks have energy
        if (cand.energy && prev.energy) {
          const energyDiff = Math.abs(cand.energy - prev.energy);
          if (energyDiff <= 1) score += 15;
          else if (energyDiff <= 2) score += 5;
          else score -= 15;
        }

        return { cand, score };
      });

      // Deterministic sort: score DESC, tie-break by ID ASC
      scored.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return a.cand.id - b.cand.id;
      });

      const best = scored[0].cand;
      const bestIdx = pool.findIndex((p) => p.id === best.id);
      pool.splice(bestIdx, 1);

      // Record transition annotation
      const relation = getKeyRelation(prev.musical_key!, best.musical_key!);
      const bpmDeltaPercent = Math.round(((best.bpm! - prev.bpm!) / prev.bpm!) * 1000) / 10;
      const isCompatible = (relation !== "clash") && Math.abs(bpmDeltaPercent) <= 6.0;

      transitions.push({
        fromTrackId: prev.id,
        toTrackId: best.id,
        fromTitle: prev.title,
        toTitle: best.title,
        fromKey: prev.musical_key!,
        toKey: best.musical_key!,
        fromBpm: prev.bpm!,
        toBpm: best.bpm!,
        keyRelation: relation,
        bpmDeltaPercent,
        isCompatible,
      });

      sequenced.push(best);
    }

    // Assemble final proposed order:
    // Full DJ sets (anchors kept in original relative positions or front) + Sequenced Tracks + Unindexed Tracks (flagged at end)
    const proposedTracks = [...fullSetAnchors, ...sequenced, ...unindexedTracks];
    const proposedOrder = proposedTracks.map((t) => t.id);

    // Compute harmonic compatibility metrics
    const harmonicCompatibleCount = transitions.filter((t) => t.keyRelation !== "clash").length;
    const keyCompatibilityPercent = transitions.length > 0 
      ? Math.round((harmonicCompatibleCount / transitions.length) * 100) 
      : 100;

    return NextResponse.json({
      success: true,
      playlist: {
        id: playlist.id,
        name: playlist.name,
        is_broadcast_active: playlist.is_broadcast_active,
      },
      summary: {
        totalTracks: tracks.length,
        harmonizedCount: sequenced.length,
        unindexedCount: unindexedTracks.length,
        fullSetCount: fullSetAnchors.length,
        keyCompatibilityPercent,
        clashCount: transitions.filter((t) => t.keyRelation === "clash").length,
      },
      openerTrackId: opener.id,
      transitions,
      proposedOrder,
      currentOrder,
      unindexedTracks: unindexedTracks.map((t) => ({
        id: t.id,
        title: t.title,
        dj_name: t.dj_name,
        bpm: t.bpm,
        musical_key: t.musical_key,
      })),
      fullSetAnchors: fullSetAnchors.map((t) => ({
        id: t.id,
        title: t.title,
        duration: t.duration_sec,
      })),
    });
  } catch (err: any) {
    console.error("[api/admin/radio/playlists/[id]/harmonize] Error:", err);
    return NextResponse.json({ error: err.message || "Harmonize analysis failed" }, { status: 500 });
  }
}
