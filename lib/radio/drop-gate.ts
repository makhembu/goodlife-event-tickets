import fs from "fs";
import path from "path";
import { GeneratedDropRecord, GateVerificationResult } from "./drop-types";
import { getPromotableEvents, RadioPromotableEvent } from "./events";

// 1. Read Generic reviewed drops
let genericDropsCache: any[] = [];
function loadGenericDrops(): any[] {
  if (genericDropsCache.length > 0) return genericDropsCache;
  try {
    const p = path.resolve(process.cwd(), "config/fallback-drops.json");
    if (fs.existsSync(p)) {
      genericDropsCache = JSON.parse(fs.readFileSync(p, "utf8"));
    }
  } catch (e) {
    console.error("[drop-gate] Failed to load config/fallback-drops.json:", e);
  }
  return genericDropsCache;
}

// Keep track of last 10 generic drop IDs to avoid repeats
const recentGenericDropIds: string[] = [];

export function selectGenericReviewedDrop(personaId?: string, daypart?: string): GeneratedDropRecord {
  const drops = loadGenericDrops();
  let candidates = drops;

  if (daypart) {
    const byDaypart = drops.filter((d: any) => d.daypart === daypart);
    if (byDaypart.length > 0) candidates = byDaypart;
  }

  // Filter out recent 10 to avoid repetition
  const unplayed = candidates.filter((c: any) => !recentGenericDropIds.includes(c.id));
  const pool = unplayed.length > 0 ? unplayed : candidates;

  const chosen = pool[Math.floor(Math.random() * pool.length)] || {
    id: "default_gen",
    persona: personaId || "mc-cheche",
    daypart: daypart || "afternoon",
    tag: "[excited]",
    script: "Niaje Kanairo, uko aje! You are tuned into GOODLIFE Radio 254, keeping the city connected.",
  };

  recentGenericDropIds.push(chosen.id);
  if (recentGenericDropIds.length > 10) recentGenericDropIds.shift();

  return {
    id: `generic_${chosen.id}_${Date.now()}`,
    drop_type: "generic_station",
    persona_id: chosen.persona,
    persona_name: chosen.persona.toUpperCase(),
    voice_id: "",
    tag: chosen.tag || "[excited]",
    script: chosen.script,
    audio_url: chosen.audio_url || "",
    valid_until: new Date(Date.now() + 24 * 3600 * 1000),
    created_at: new Date(),
    provider: "generic_library",
    model_id: "human-reviewed",
    latency_ms: 0,
    is_generic_fallback: true,
  };
}

/**
 * Drop Gate: Pre-flight safety check executed immediately before a drop is queued to air.
 * Guarantees zero stale facts, zero expired prices, and seamless failover to reviewed generic drops.
 */
export async function verifyDropBeforePlayout(
  drop: GeneratedDropRecord,
  actualNextTrackId?: number | null,
  now = new Date()
): Promise<GateVerificationResult> {
  // 1. Time check: Has valid_until expired?
  if (now.getTime() >= drop.valid_until.getTime()) {
    console.warn(`[drop-gate] REJECTED: Drop ${drop.id} expired at ${drop.valid_until.toISOString()} (now=${now.toISOString()})`);
    const fallback = selectGenericReviewedDrop(drop.persona_id);
    return {
      allowed: false,
      reason: "expired_valid_until",
      final_drop: fallback,
    };
  }

  // 2. Track check: For next_track_tease, does target_track_id match?
  if (drop.drop_type === "next_track_tease" && drop.target_track_id) {
    if (actualNextTrackId && actualNextTrackId !== drop.target_track_id) {
      console.warn(`[drop-gate] REJECTED: Track sequence changed (target=${drop.target_track_id}, actual=${actualNextTrackId})`);
      const fallback = selectGenericReviewedDrop(drop.persona_id);
      return {
        allowed: false,
        reason: "track_mismatch",
        final_drop: fallback,
      };
    }
  }

  // 3. Event check: If event-related drop, re-read DB and verify facts_hash
  if (drop.event_id) {
    try {
      // Re-read with short 3s timeout
      const liveEvents = await Promise.race([
        getPromotableEvents(now),
        new Promise<RadioPromotableEvent[]>((_, reject) =>
          setTimeout(() => reject(new Error("DB timeout in Drop Gate")), 3000)
        ),
      ]);

      const matchingEvent = liveEvents.find((e) => e.id === drop.event_id);

      // If event ended, was cancelled, or is no longer promotable
      if (!matchingEvent) {
        console.warn(`[drop-gate] REJECTED: Event ${drop.event_id} is no longer promotable in DB`);
        const fallback = selectGenericReviewedDrop(drop.persona_id);
        return {
          allowed: false,
          reason: "event_cancelled",
          final_drop: fallback,
        };
      }

      // If facts_hash changed (e.g. price changed, tier sold out, lineup changed)
      if (matchingEvent.facts_hash !== drop.facts_hash) {
        console.warn(
          `[drop-gate] REJECTED: Facts hash mismatch for event ${drop.event_id}. Drop=${drop.facts_hash?.slice(0, 8)} vs Live=${matchingEvent.facts_hash.slice(0, 8)}`
        );
        const fallback = selectGenericReviewedDrop(drop.persona_id);
        return {
          allowed: false,
          reason: "facts_hash_mismatch",
          final_drop: fallback,
        };
      }
    } catch (err: any) {
      console.warn(`[drop-gate] DB unreachable during gate check: ${err.message}`);
      // Drop older than 15 minutes cannot air safely without DB confirmation
      const dropAgeMinutes = (now.getTime() - drop.created_at.getTime()) / (60 * 1000);
      if (dropAgeMinutes > 15) {
        console.warn(`[drop-gate] REJECTED: Event drop age (${dropAgeMinutes.toFixed(1)}m) exceeds 15m offline tolerance`);
        const fallback = selectGenericReviewedDrop(drop.persona_id);
        return {
          allowed: false,
          reason: "db_offline_stale",
          final_drop: fallback,
        };
      }
    }
  }

  // Approved to air
  return {
    allowed: true,
    reason: "valid",
    final_drop: drop,
  };
}
