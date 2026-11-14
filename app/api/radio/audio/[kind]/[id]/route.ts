import { NextRequest, NextResponse } from "next/server";
import { neonQuery } from "@/lib/supabase-db";
import { signRadioPlaybackUrl } from "@/lib/radio/r2-signer";
import { resolveR2Key, playbackTtlSec } from "@/lib/radio/playback";

export const dynamic = "force-dynamic";

// In-memory sliding window rate limiter (max 90 requests per minute per IP)
const ipRateLimitMap = new Map<string, number[]>();
const RATE_LIMIT_WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 90;

function isIpRateLimited(ip: string): boolean {
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW_MS;
  const timestamps = (ipRateLimitMap.get(ip) || []).filter((t) => t > windowStart);

  if (timestamps.length >= MAX_REQUESTS_PER_WINDOW) {
    ipRateLimitMap.set(ip, timestamps);
    return true;
  }

  timestamps.push(now);
  ipRateLimitMap.set(ip, timestamps);

  // Periodic pruning if map grows large
  if (ipRateLimitMap.size > 2000) {
    for (const [k, ts] of ipRateLimitMap.entries()) {
      const valid = ts.filter((t) => t > windowStart);
      if (valid.length === 0) ipRateLimitMap.delete(k);
      else ipRateLimitMap.set(k, valid);
    }
  }

  return false;
}

type AudioRouteContext = {
  params: Promise<{
    kind: string;
    id: string;
  }>;
};

async function handleAudioRequest(req: NextRequest, context: AudioRouteContext, isHead = false) {
  // Reject arbitrary key= or url= query parameter override attempts
  const { searchParams } = new URL(req.url);
  if (searchParams.has("key") || searchParams.has("url")) {
    return NextResponse.json(
      { error: "Arbitrary key signing is prohibited" },
      { status: 400, headers: { "Cache-Control": "private, no-store, max-age=0" } }
    );
  }

  // Rate limit by IP
  const clientIp =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "127.0.0.1";

  if (isIpRateLimited(clientIp)) {
    return NextResponse.json(
      { error: "Too many playback requests, please try again shortly." },
      { status: 429, headers: { "Cache-Control": "private, no-store, max-age=0" } }
    );
  }

  const { kind, id } = await context.params;

  // Validate kind
  if (kind !== "track" && kind !== "recording" && kind !== "drop") {
    return NextResponse.json(
      { error: "Invalid playback kind" },
      { status: 404, headers: { "Cache-Control": "private, no-store, max-age=0" } }
    );
  }

  // Validate ID: accept pure integer IDs or clean set/drop IDs
  const cleanIdStr = id.replace(/^(set-|vault-|pl-\d+-|db-drop-)/, "");
  const numericId = parseInt(cleanIdStr, 10);
  if (!Number.isFinite(numericId) || numericId <= 0) {
    return NextResponse.json(
      { error: "Invalid audio ID" },
      { status: 404, headers: { "Cache-Control": "private, no-store, max-age=0" } }
    );
  }

  let row: any = null;

  try {
    if (kind === "track") {
      const res = await neonQuery(
        `SELECT id, r2_key, audio_url, duration_sec 
         FROM radio_sets 
         WHERE id = $1 
           AND deleted_at IS NULL 
           AND (is_active = true OR is_active IS NULL)
           AND processing_status = 'ready'
         LIMIT 1`,
        [numericId]
      );
      if (res.rows.length > 0) row = res.rows[0];
    } else if (kind === "recording") {
      const res = await neonQuery(
        `SELECT id, r2_key, audio_url, duration 
         FROM radio_recordings 
         WHERE id = $1 
           AND is_public = true 
         LIMIT 1`,
        [numericId]
      );
      if (res.rows.length > 0) row = res.rows[0];
    } else if (kind === "drop") {
      const res = await neonQuery(
        `SELECT id, audio_url 
         FROM radio_drops 
         WHERE id = $1 
           AND audio_url IS NOT NULL 
           AND audio_url != '' 
         LIMIT 1`,
        [numericId]
      );
      if (res.rows.length > 0) row = res.rows[0];
    }
  } catch (dbErr: any) {
    console.error("[api/radio/audio] Database query error:", dbErr?.message || dbErr);
    return NextResponse.json(
      { error: "Failed to resolve playback" },
      { status: 500, headers: { "Cache-Control": "private, no-store, max-age=0" } }
    );
  }

  if (!row) {
    return NextResponse.json(
      { error: "Audio not found" },
      { status: 404, headers: { "Cache-Control": "private, no-store, max-age=0" } }
    );
  }

  const r2Key = resolveR2Key(row);
  if (!r2Key) {
    return NextResponse.json(
      { error: "Audio storage key not available" },
      { status: 404, headers: { "Cache-Control": "private, no-store, max-age=0" } }
    );
  }

  const ttl = playbackTtlSec(row);
  const signedUrl = await signRadioPlaybackUrl(r2Key, ttl);

  if (!signedUrl) {
    // Fail closed: missing credentials or unconfigured bucket must never expose public URLs
    return NextResponse.json(
      { error: "Audio service temporarily unavailable" },
      { status: 503, headers: { "Cache-Control": "private, no-store, max-age=0" } }
    );
  }

  if (isHead) {
    return new NextResponse(null, {
      status: 307,
      headers: {
        Location: signedUrl,
        "Cache-Control": "private, no-store, max-age=0",
      },
    });
  }

  return new NextResponse(null, {
    status: 307,
    headers: {
      Location: signedUrl,
      "Cache-Control": "private, no-store, max-age=0",
    },
  });
}

export async function GET(req: NextRequest, context: AudioRouteContext) {
  return handleAudioRequest(req, context, false);
}

export async function HEAD(req: NextRequest, context: AudioRouteContext) {
  return handleAudioRequest(req, context, true);
}
