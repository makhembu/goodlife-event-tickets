import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { neonQuery } from "@/lib/supabase-db";
import { bridgeAnalyzeAudio } from "@/lib/radio/bridge-client";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const unauthorized = await requireAdmin(req);
  if (unauthorized) return unauthorized;

  try {
    // 1. Fetch unindexed tracks from radio_sets
    const { rows: unindexed } = await neonQuery(
      `SELECT id, title, dj_name, audio_url, genre, is_full_set 
       FROM radio_sets 
       WHERE deleted_at IS NULL 
         AND (bpm IS NULL OR musical_key IS NULL OR musical_key = '')
       ORDER BY id ASC`
    );

    if (!unindexed || unindexed.length === 0) {
      return NextResponse.json({
        success: true,
        count: 0,
        message: "All catalog tracks are already harmonically indexed.",
      });
    }

    const results: Array<{
      id: number;
      title: string;
      success: boolean;
      bpm?: number;
      musical_key?: string;
      error?: string;
    }> = [];

    // 2. Concurrency limit = 4 matching .29 bounded analysis thread pool
    const concurrency = 4;
    for (let i = 0; i < unindexed.length; i += concurrency) {
      const chunk = unindexed.slice(i, i + concurrency);
      await Promise.all(
        chunk.map(async (track: any) => {
          if (!track.audio_url || !track.audio_url.startsWith("http")) {
            results.push({
              id: track.id,
              title: track.title,
              success: false,
              error: "Missing or invalid audio URL",
            });
            return;
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
              const validKey = keyMatch ? keyMatch[0] : null;
              const validBpm =
                typeof res.data.bpm === "number" && res.data.bpm > 0
                  ? Math.round(res.data.bpm)
                  : null;

              const validEnergy =
                typeof res.data.energy === "number" && res.data.energy >= 1 && res.data.energy <= 10
                  ? Math.round(res.data.energy)
                  : 6;

              if (validKey && validBpm) {
                await neonQuery(
                  `UPDATE radio_sets 
                   SET bpm = $1, musical_key = $2, energy = $3, key_source = 'analyzed' 
                   WHERE id = $4`,
                  [validBpm, validKey, validEnergy, track.id]
                );

                results.push({
                  id: track.id,
                  title: track.title,
                  success: true,
                  bpm: validBpm,
                  musical_key: validKey,
                });
                return;
              }
            }

            results.push({
              id: track.id,
              title: track.title,
              success: false,
              error: res.error || "Analyzer could not determine Camelot key",
            });
          } catch (err: any) {
            results.push({
              id: track.id,
              title: track.title,
              success: false,
              error: err.message || "Failed to analyze audio",
            });
          }
        })
      );
    }

    const succeeded = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    return NextResponse.json({
      success: true,
      count: unindexed.length,
      succeeded,
      failed,
      results,
    });
  } catch (err: any) {
    console.error("[api/admin/radio/library/harmonize-all] Error:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error harmonizing tracks." },
      { status: 500 }
    );
  }
}
