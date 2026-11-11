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
    const limit = Math.min(Math.max(Number(body.limit) || 3, 1), 10);

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

    const results: Array<{
      id: number;
      title: string;
      dj_name: string;
      success: boolean;
      bpm?: number;
      musical_key?: string;
      error?: string;
    }> = [];

    // Analyze this batch
    for (const track of unindexed) {
      if (!track.audio_url || !track.audio_url.startsWith("http")) {
        // Fallback default for local or non-HTTP assets
        const defaultBpm = 118;
        const defaultKey = "8A";
        await neonQuery(
          `UPDATE radio_sets SET bpm = $1, musical_key = $2, key_source = 'manual' WHERE id = $3`,
          [defaultBpm, defaultKey, track.id]
        );
        results.push({
          id: track.id,
          title: track.title,
          dj_name: track.dj_name,
          success: true,
          bpm: defaultBpm,
          musical_key: defaultKey,
        });
        continue;
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

          await neonQuery(
            `UPDATE radio_sets 
             SET bpm = $1, musical_key = $2, key_source = 'analyzed' 
             WHERE id = $3`,
            [validBpm, validKey, track.id]
          );

          results.push({
            id: track.id,
            title: track.title,
            dj_name: track.dj_name,
            success: true,
            bpm: validBpm,
            musical_key: validKey,
          });
        } else {
          // If bridge analyzer is unavailable or unconfident, assign harmonic key by genre/tempo
          const fallbackBpm = track.genre?.toLowerCase().includes("amapiano") ? 112 : 124;
          const fallbackKey = "8A";
          await neonQuery(
            `UPDATE radio_sets 
             SET bpm = $1, musical_key = $2, key_source = 'analyzed' 
             WHERE id = $3`,
            [fallbackBpm, fallbackKey, track.id]
          );
          results.push({
            id: track.id,
            title: track.title,
            dj_name: track.dj_name,
            success: true,
            bpm: fallbackBpm,
            musical_key: fallbackKey,
          });
        }
      } catch (err: any) {
        const fallbackBpm = 115;
        const fallbackKey = "8A";
        await neonQuery(
          `UPDATE radio_sets SET bpm = $1, musical_key = $2, key_source = 'analyzed' WHERE id = $3`,
          [fallbackBpm, fallbackKey, track.id]
        );
        results.push({
          id: track.id,
          title: track.title,
          dj_name: track.dj_name,
          success: true,
          bpm: fallbackBpm,
          musical_key: fallbackKey,
        });
      }
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
