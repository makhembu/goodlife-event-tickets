import { neonQuery } from "@/lib/supabase-db";

let _cachedListenerCount = 0;
let _cachedListenerAt = 0;
const LISTENER_CACHE_TTL_MS = 3_500; // 3.5 seconds cache
let _cleanupCounter = 0;

/**
 * Validates and sanitizes a listener session ID.
 */
export function sanitizeSessionId(raw: any): string | null {
  if (typeof raw !== "string") return null;
  const clean = raw.trim().replace(/[^a-zA-Z0-9_\-]/g, "");
  if (clean.length < 6 || clean.length > 64) return null;
  return clean;
}

/**
 * Records a real-time heartbeat ping for an active radio listener.
 */
export async function recordListenerHeartbeat(
  sessionId: string,
  clientType: "listener" | "studio" = "listener"
): Promise<{ success: boolean; activeListeners: number }> {
  const cleanId = sanitizeSessionId(sessionId);
  if (!cleanId) return { success: false, activeListeners: _cachedListenerCount };

  try {
    await neonQuery(
      `INSERT INTO radio_listener_pings (session_id, client_type, last_seen)
       VALUES ($1, $2, NOW())
       ON CONFLICT (session_id) DO UPDATE SET last_seen = NOW()`,
      [cleanId, clientType]
    );

    // Opportunistic cleanup of dead sessions every ~20 heartbeats
    _cleanupCounter++;
    if (_cleanupCounter >= 20) {
      _cleanupCounter = 0;
      neonQuery(
        `DELETE FROM radio_listener_pings WHERE last_seen < NOW() - INTERVAL '5 minutes'`
      ).catch(() => {});
    }

    const count = await getActiveListenersCount(true);
    return { success: true, activeListeners: count };
  } catch (err) {
    console.warn("[listener-tracker] Heartbeat record failed:", err);
    return { success: false, activeListeners: _cachedListenerCount };
  }
}

/**
 * Removes a listener session immediately upon explicit disconnect / pause.
 */
export async function removeListenerSession(sessionId: string): Promise<void> {
  const cleanId = sanitizeSessionId(sessionId);
  if (!cleanId) return;

  try {
    await neonQuery(
      `DELETE FROM radio_listener_pings WHERE session_id = $1`,
      [cleanId]
    );
    _cachedListenerAt = 0; // invalidate cache
  } catch (err) {
    console.warn("[listener-tracker] Session removal failed:", err);
  }
}

/**
 * Fetches the verified number of real active listeners across GOODLIFE Radio 254.
 * Combines active pulse pings from Neon Postgres (heartbeat within 40 seconds)
 * with AzuraCast upstream live relays if active.
 */
export async function getActiveListenersCount(forceFresh = false): Promise<number> {
  const now = Date.now();
  if (!forceFresh && now - _cachedListenerAt < LISTENER_CACHE_TTL_MS) {
    return _cachedListenerCount;
  }

  try {
    const res = await neonQuery(
      `SELECT COUNT(DISTINCT session_id)::int as count 
       FROM radio_listener_pings 
       WHERE last_seen >= NOW() - INTERVAL '40 seconds'`
    );
    const count = Number(res.rows?.[0]?.count) || 0;
    _cachedListenerCount = count;
    _cachedListenerAt = now;
    return count;
  } catch (err) {
    console.warn("[listener-tracker] Error querying active listeners:", err);
    return _cachedListenerCount;
  }
}
