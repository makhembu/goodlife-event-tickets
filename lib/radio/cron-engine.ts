import crypto from "crypto";
import { LastDropGeneration } from "./telemetry";

export interface CronRadioDropsDeps {
  queryDb: (sql: string, params?: any[]) => Promise<{ rows: any[] }>;
  generateDrop: (req: any) => Promise<{
    id: string;
    drop_type: string;
    persona_id: string;
    persona_name: string;
    tag: string;
    script: string;
    audio_url?: string;
    is_generic_fallback?: boolean;
  }>;
  selectFallbackDrop?: (personaId?: string) => {
    script: string;
    tag: string;
    persona_name: string;
  };
  recordTelemetry?: (record: LastDropGeneration) => void;
  cronSecret?: string;
  dailyCap?: number;
  targetPool?: number;
}

export interface CronRadioDropsResult {
  statusCode: number;
  body: {
    status?: "generated" | "skipped" | "failed";
    reason?: string;
    message?: string;
    error?: string;
    drop?: any;
    count?: number;
    cap?: number;
    today_count?: number;
    daily_cap?: number;
    pool_count?: number;
    target_pool?: number;
    drop_id?: string;
  };
}

export function timingSafeEqualStr(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    // Constant-time dummy comparison to prevent timing leaks on length
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

// Strictly evergreen: no promotional ticket prices, specific dates or venues
export const FORBIDDEN_DROP_REGEXES = [
  /\b200\s*bob\b/i,
  new RegExp("\\b" + "mar" + "ara\\s*camp\\b", "i"),
  /\bevery\s*sunday\b/i,
  /\b\d+\s*bob\b/i,
  /\bkes\b/i,
  /\bshillings?\b/i,
  /\btickets?\s*(?:at|for|cost|only|going\s*for)\b/i,
];

export async function executeCronRadioDrops(
  authHeader: string | null,
  deps: CronRadioDropsDeps
): Promise<CronRadioDropsResult> {
  const cronSecret = deps.cronSecret;
  if (!cronSecret || cronSecret.trim() === "") {
    return {
      statusCode: 500,
      body: { error: "CRON_SECRET not configured on server" },
    };
  }

  const expectedHeader = `Bearer ${cronSecret}`;
  if (!authHeader || !timingSafeEqualStr(authHeader, expectedHeader)) {
    return {
      statusCode: 401,
      body: { error: "Unauthorized" },
    };
  }

  // 1. Skip when station mode is live
  let broadcastMode = "autodj";
  try {
    const settingsRes = await deps.queryDb(
      "SELECT broadcast_mode FROM radio_settings WHERE id = 1"
    );
    if (settingsRes.rows && settingsRes.rows[0]) {
      broadcastMode = settingsRes.rows[0].broadcast_mode || "autodj";
    }
  } catch (err: any) {
    console.error("[cron-engine] Failed to check broadcast_mode:", err?.message);
    return {
      statusCode: 503,
      body: { error: "Database unavailable for broadcast_mode check" },
    };
  }

  if (broadcastMode === "live") {
    const record: LastDropGeneration = {
      timestamp: new Date().toISOString(),
      status: "skipped",
      reason: "station_mode_live",
    };
    deps.recordTelemetry?.(record);
    return {
      statusCode: 200,
      body: {
        status: "skipped",
        reason: "station_mode_live",
        message: "Station is currently in LIVE DJ broadcast mode. Automatic drops are suspended.",
      },
    };
  }

  // 2. Check hard daily cap (default 12)
  const dailyCap = typeof deps.dailyCap === "number" ? deps.dailyCap : 12;
  let todayCount = 0;
  try {
    const todayRes = await deps.queryDb(
      "SELECT COUNT(*)::int AS count FROM radio_drops WHERE created_at >= (NOW() AT TIME ZONE 'Africa/Nairobi')::date"
    );
    todayCount = parseInt(todayRes.rows?.[0]?.count || "0", 10);
  } catch (err: any) {
    console.error("[cron-engine] Failed to count today's drops:", err?.message);
    return {
      statusCode: 503,
      body: { error: "Database unavailable for daily cap check" },
    };
  }

  if (todayCount >= dailyCap) {
    const record: LastDropGeneration = {
      timestamp: new Date().toISOString(),
      status: "skipped",
      reason: "daily_cap_reached",
      today_count: todayCount,
      daily_cap: dailyCap,
    };
    deps.recordTelemetry?.(record);
    return {
      statusCode: 200,
      body: {
        status: "skipped",
        reason: "daily_cap_reached",
        count: todayCount,
        cap: dailyCap,
        message: `Daily generation cap (${dailyCap}) reached for today.`,
      },
    };
  }

  // 3. Count valid unplayed drops in pool (default 8)
  const targetPool = typeof deps.targetPool === "number" ? deps.targetPool : 8;
  let poolCount = 0;
  try {
    const poolRes = await deps.queryDb(`
      SELECT COUNT(*)::int AS count
      FROM radio_drops
      WHERE (created_at > NOW() - INTERVAL '7 days' OR timing_type IN ('generic', 'station_id'))
        AND audio_url IS NOT NULL
        AND (played_at IS NULL OR played_at < NOW() - INTERVAL '24 hours')
    `);
    poolCount = parseInt(poolRes.rows?.[0]?.count || "0", 10);
  } catch (err: any) {
    console.error("[cron-engine] Failed to count valid drop pool:", err?.message);
    return {
      statusCode: 503,
      body: { error: "Database unavailable for drop pool check" },
    };
  }

  if (poolCount >= targetPool) {
    const record: LastDropGeneration = {
      timestamp: new Date().toISOString(),
      status: "skipped",
      reason: "pool_sufficient",
      pool_count: poolCount,
      target_pool: targetPool,
    };
    deps.recordTelemetry?.(record);
    return {
      statusCode: 200,
      body: {
        status: "skipped",
        reason: "pool_sufficient",
        pool_count: poolCount,
        target_pool: targetPool,
        message: `Drop pool sufficient (${poolCount}/${targetPool}). No generation needed.`,
      },
    };
  }

  // 4. Generate AT MOST ONE drop
  const personas = ["amina", "mc-cheche", "chao", "brian", "dj-fusion"];
  const selectedPersona = personas[Math.floor(Math.random() * personas.length)];

  let drop;
  try {
    drop = await deps.generateDrop({
      dropType: "station_id",
      archetype: "station_callout",
      preferredPersonaId: selectedPersona,
      introSeconds: 10,
      skipAudioSynthesis: false,
    });
  } catch (engineErr: any) {
    console.error("[cron-engine] generateDropEngineV2 threw error:", engineErr);
    const errRecord: LastDropGeneration = {
      timestamp: new Date().toISOString(),
      status: "failed",
      reason: "engine_error",
      error: engineErr?.message || String(engineErr),
    };
    deps.recordTelemetry?.(errRecord);
    return {
      statusCode: 500,
      body: {
        status: "failed",
        reason: "engine_error",
        error: engineErr?.message || "Drop generation engine threw an error",
      },
    };
  }

  // 5. Enforce strictly evergreen script rules
  let scriptToUse = drop.script;
  let tagToUse = drop.tag;
  let isFallback = drop.is_generic_fallback;
  let audioUrlToUse = drop.audio_url;

  if (FORBIDDEN_DROP_REGEXES.some((rx) => rx.test(scriptToUse))) {
    console.warn("[cron-engine] Prohibited specific promo/pricing detected in script. Discarding synthesized audio and falling back to reviewed evergreen library drop.");
    if (deps.selectFallbackDrop) {
      const reviewed = deps.selectFallbackDrop(selectedPersona);
      scriptToUse = reviewed.script;
      tagToUse = reviewed.tag;
      audioUrlToUse = (reviewed as any).audio_url || `/drops/samples/${selectedPersona}_context_drop.mp3`;
    } else {
      scriptToUse = "Niaje Kanairo! You are tuned into GOODLIFE Radio 254, keeping the city connected.";
      tagToUse = "[excited]";
      audioUrlToUse = `/drops/samples/${selectedPersona}_context_drop.mp3`;
    }
    isFallback = true;
  }

  // 6. Persist to radio_drops
  let insertedId: number | null = null;
  if (audioUrlToUse) {
    try {
      const insertRes = await deps.queryDb(
        `INSERT INTO radio_drops (persona, mood, title, script, audio_url, timing_type, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())
         RETURNING id`,
        [
          drop.persona_name,
          tagToUse,
          `${drop.persona_name} · Station ID`,
          scriptToUse,
          audioUrlToUse,
          "station_id",
        ]
      );
      insertedId = insertRes.rows?.[0]?.id || null;
    } catch (insertErr: any) {
      console.error("[cron-engine] Failed to insert drop into database:", insertErr);
      const errRecord: LastDropGeneration = {
        timestamp: new Date().toISOString(),
        status: "failed",
        reason: "db_insert_error",
        error: insertErr?.message || String(insertErr),
      };
      deps.recordTelemetry?.(errRecord);
      return {
        statusCode: 500,
        body: {
          status: "failed",
          reason: "db_insert_error",
          error: insertErr?.message || "Failed to persist drop to database",
          drop_id: drop.id,
        },
      };
    }
  }

  // 7. Record telemetry & return response
  const record: LastDropGeneration = {
    timestamp: new Date().toISOString(),
    status: "generated",
    drop_id: drop.id,
    db_id: insertedId,
    persona: drop.persona_name,
    script: scriptToUse,
    audio_url: audioUrlToUse,
    is_fallback: isFallback,
    pool_count: poolCount + 1,
    target_pool: targetPool,
    today_count: todayCount + 1,
    daily_cap: dailyCap,
  };
  deps.recordTelemetry?.(record);

  return {
    statusCode: 200,
    body: {
      status: "generated",
      drop: {
        id: drop.id,
        db_id: insertedId,
        persona: drop.persona_name,
        mood: tagToUse,
        script: scriptToUse,
        audio_url: audioUrlToUse,
        timing_type: "station_id",
        is_fallback: isFallback,
      },
      today_count: todayCount + 1,
      daily_cap: dailyCap,
      pool_count: poolCount + 1,
      target_pool: targetPool,
    },
  };
}
