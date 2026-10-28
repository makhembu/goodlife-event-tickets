import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { neonQuery } from "@/lib/supabase-db";

// In-memory sliding window rate limiter: max 10 beacons per 60 seconds per source
const _rateLimitMap = new Map<string, number[]>();

function isRateLimited(key: string, windowMs = 60_000, maxRequests = 10): boolean {
  const now = Date.now();
  const timestamps = _rateLimitMap.get(key) || [];
  const recent = timestamps.filter((t) => now - t < windowMs);

  if (recent.length >= maxRequests) {
    return true;
  }

  recent.push(now);
  _rateLimitMap.set(key, recent);

  // Periodic memory cleanup when map grows
  if (_rateLimitMap.size > 2000) {
    for (const [k, times] of _rateLimitMap.entries()) {
      if (times.length === 0 || now - times[times.length - 1] > windowMs) {
        _rateLimitMap.delete(k);
      }
    }
  }

  return false;
}

// Module-level schema cache to handle pre-migration and post-migration states safely
let _schemaChecked = false;
let _isSetIdNullable = false;
let _hasLiveColumns = false;

async function checkSchema() {
  if (_schemaChecked) return;
  try {
    const res = await neonQuery(
      `SELECT column_name, is_nullable 
       FROM information_schema.columns 
       WHERE table_name = 'radio_plays' AND column_name IN ('set_id', 'mode', 'track_title')`
    );
    const cols = res.rows || [];
    const setIdCol = cols.find((c: any) => c.column_name === "set_id");
    _isSetIdNullable = setIdCol?.is_nullable === "YES";
    _hasLiveColumns = cols.some((c: any) => c.column_name === "mode");
    _schemaChecked = true;
  } catch {
    // Fail safe on error without breaking request
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body) {
      return new NextResponse(null, { status: 400 });
    }

    const secondsListened = Math.min(Math.max(0, parseInt(String(body.seconds_listened || 0), 10)), 14400);
    const quality = body.quality === "high" ? "high" : "standard";
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "127.0.0.1";

    // Rate limiting key: transient IP hash (memory only, never stored in DB)
    const rateLimitKey = crypto.createHash("sha256").update(ip).digest("hex").slice(0, 16);
    if (isRateLimited(rateLimitKey)) {
      return new NextResponse(null, { status: 204 }); // Quiet 204 for rate-limited beacon
    }

    await checkSchema();

    const isLive = body.mode === "live" || !body.set_id;

    if (isLive) {
      // =========================================================================
      // LIVE SESSION TELEMETRY: SESSION DURATION ONLY
      // Strictly ZERO PII: No city, no visitor ID, no client-supplied title/artist
      // =========================================================================
      if (secondsListened < 5) {
        // Ignore micro-sessions under 5 seconds
        return new NextResponse(null, { status: 204 });
      }

      // Pre-migration safety guard:
      // If set_id is still NOT NULL or mode column doesn't exist, skip insertion cleanly
      if (!_isSetIdNullable || !_hasLiveColumns) {
        return new NextResponse(null, { status: 204 });
      }

      // Server-side snapshot of now-playing track at receipt time (never client-supplied)
      let liveTitle: string | null = null;
      let liveArtist: string | null = null;
      const upstreamUrl = process.env.RADIO_UPSTREAM_URL;
      if (upstreamUrl) {
        try {
          const npRes = await fetch(`${upstreamUrl}/api/now-playing`, {
            signal: AbortSignal.timeout(1500),
            cache: "no-store",
          });
          if (npRes.ok) {
            const np = await npRes.json();
            liveTitle = typeof np?.title === "string" ? np.title.slice(0, 255) : null;
            liveArtist = typeof np?.artist === "string" ? np.artist.slice(0, 255) : null;
          }
        } catch {
          // If upstream is unreachable, record duration with null snapshot
        }
      }

      await neonQuery(
        `INSERT INTO radio_plays (mode, seconds_listened, track_title, track_artist, quality_used)
         VALUES ('live', $1, $2, $3, $4)`,
        [secondsListened, liveTitle, liveArtist, quality]
      );

      return new NextResponse(null, { status: 204 });
    }

    // =========================================================================
    // VAULT FESTIVAL DJ SET TELEMETRY (Legacy recorded sets)
    // =========================================================================
    const setId = parseInt(String(body.set_id), 10);
    if (isNaN(setId) || setId <= 0) {
      return new NextResponse(null, { status: 400 });
    }

    const completed = Boolean(body.completed);

    // Validate set_id exists in database before recording play
    const setCheck = await neonQuery(
      "SELECT id FROM radio_sets WHERE id = $1 AND deleted_at IS NULL LIMIT 1",
      [setId]
    );
    if (setCheck.rows.length === 0) {
      return new NextResponse(null, { status: 404 });
    }

    // Rotating daily salt for vault sets
    const dateSalt = new Date().toISOString().slice(0, 10);
    const sessionHash = crypto
      .createHash("sha256")
      .update(`${ip}:${dateSalt}`)
      .digest("hex")
      .slice(0, 32);

    await neonQuery(
      `INSERT INTO radio_plays (set_id, session_hash, seconds_listened, completed, quality_used)
       VALUES ($1, $2, $3, $4, $5)`,
      [setId, sessionHash, secondsListened, completed, quality]
    );

    // If completed or listened for >= 30s, increment play_count
    if (completed || secondsListened >= 30) {
      await neonQuery("UPDATE radio_sets SET play_count = play_count + 1 WHERE id = $1", [setId]);
    }

    return new NextResponse(null, { status: 204 });
  } catch (err: any) {
    return new NextResponse(null, { status: 204 }); // Never fail client beacons
  }
}
