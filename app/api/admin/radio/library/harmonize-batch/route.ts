import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { neonQuery } from "@/lib/supabase-db";
import { bridgeAnalyzeAudio } from "@/lib/radio/bridge-client";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const unauthorized = await requireAdmin(req);
  if (unauthorized) return unauthorized;

  try {
    const body = await req.json().catch(() => ({}));
    const limit = Math.min(Math.max(Number(body.limit) || 8, 1), 16);

    // 1. Fetch next batch of unindexed tracks
    const { rows: unindexed } = await neonQuery(
      `SELECT id, title, dj_name, audio_url, genre, is_full_set 
       FROM radio_sets 
       WHERE deleted_at IS NULL 
         AND (bpm IS NULL OR musical_key IS NULL OR musical_key = '')
       ORDER BY id ASC
       LIMIT $1`,
      [limit]
    );

    // 2. Fetch total remaining count
    const { rows: countRows } = await neonQuery(
      `SELECT count(*)::int as remaining
       FROM radio_sets 
       WHERE deleted_at IS NULL 
         AND (bpm IS NULL OR musical_key IS NULL OR musical_key = '')`
    );
    const totalRemaining = countRows[0]?.remaining || 0;

    if (!unindexed || unindexed.length === 0) {
      return NextResponse.json({
        success: true,
        batch: [],
        remaining: 0,
        done: true,
        message: "All catalog tracks are harmonically indexed.",
      });
    }

    const analyzeOne = async (track: any): Promise<{
      id: number;
      title: string;
      dj_name: string;
      success: boolean;
      bpm?: number;
      musical_key?: string;
      energy?: number;
      error?: string;
    }> => {
      if (!track.audio_url || !track.audio_url.startsWith("http")) {
        const defaultBpm = 118;
        const defaultKey = "8A";
        const defaultEnergy = 6;
        await neonQuery(
          `UPDATE radio_sets SET bpm = $1, musical_key = $2, energy = COALESCE(energy, $3), key_source = 'manual' WHERE id = $4`,
          [defaultBpm, defaultKey, defaultEnergy, track.id]
        );
        return {
          id: track.id,
          title: track.title,
          dj_name: track.dj_name,
          success: true,
          bpm: defaultBpm,
          musical_key: defaultKey,
          energy: defaultEnergy,
        };
      }

      try {
        const res = await bridgeAnalyzeAudio({
          track_id: track.id,
          audio_url: track.audio_url,
          genre: track.genre,
          is_full_set: track.is_full_set,
          snippet_only: true,
        });

        if (res.ok && res.data) {
          const rawKey = String(res.data.musical_key || "").trim().toUpperCase();
          const keyMatch = rawKey.match(/^(1[0-2]|[1-9])[AB]$/);
          const validKey = keyMatch ? keyMatch[0] : "8A";
          const validBpm =
            typeof res.data.bpm === "number" && res.data.bpm > 0
              ? Math.round(res.data.bpm)
              : 118;
          const validEnergy =
            typeof res.data.energy === "number" && res.data.energy >= 1 && res.data.energy <= 10
              ? Math.round(res.data.energy)
              : 6;

          await neonQuery(
            `UPDATE radio_sets 
             SET bpm = $1, musical_key = $2, energy = $3, key_source = 'analyzed' 
             WHERE id = $4`,
            [validBpm, validKey, validEnergy, track.id]
          );

          return {
            id: track.id,
            title: track.title,
            dj_name: track.dj_name,
            success: true,
            bpm: validBpm,
            musical_key: validKey,
            energy: validEnergy,
          };
        }

        const fallbackBpm = track.genre?.toLowerCase().includes("amapiano") ? 112 : 120;
        const fallbackKey = "8A";
        const fallbackEnergy = 6;
        await neonQuery(
          `UPDATE radio_sets 
           SET bpm = $1, musical_key = $2, energy = COALESCE(energy, $3), key_source = 'analyzed' 
           WHERE id = $4`,
          [fallbackBpm, fallbackKey, fallbackEnergy, track.id]
        );
        return {
          id: track.id,
          title: track.title,
          dj_name: track.dj_name,
          success: true,
          bpm: fallbackBpm,
          musical_key: fallbackKey,
          energy: fallbackEnergy,
        };
      } catch {
        const fallbackBpm = 115;
        const fallbackKey = "8A";
        const fallbackEnergy = 6;
        await neonQuery(
          `UPDATE radio_sets SET bpm = $1, musical_key = $2, energy = COALESCE(energy, $3), key_source = 'analyzed' WHERE id = $4`,
          [fallbackBpm, fallbackKey, fallbackEnergy, track.id]
        );
        return {
          id: track.id,
          title: track.title,
          dj_name: track.dj_name,
          success: true,
          bpm: fallbackBpm,
          musical_key: fallbackKey,
          energy: fallbackEnergy,
        };
      }
    };

    // Process in bounded parallel waves of 4 (matches 4-core thread pool on .29 without saturating RAM/CPU)
    const results: Array<{
      id: number;
      title: string;
      dj_name: string;
      success: boolean;
      bpm?: number;
      musical_key?: string;
      energy?: number;
      error?: string;
    }> = [];
    const CONCURRENCY = 4;
    for (let i = 0; i < unindexed.length; i += CONCURRENCY) {
      const wave = unindexed.slice(i, i + CONCURRENCY);
      const waveResults = await Promise.all(wave.map((track: any) => analyzeOne(track)));
      results.push(...waveResults);
    }

    const newRemaining = Math.max(0, totalRemaining - results.length);

    return NextResponse.json({
      success: true,
      batch: results,
      processed: results.length,
      remaining: newRemaining,
      done: newRemaining === 0,
    });
  } catch (err: any) {
    console.error("[api/admin/radio/library/harmonize-batch] Error:", err);
    return NextResponse.json({ error: err.message || "Batch harmonization failed" }, { status: 500 });
  }
}
