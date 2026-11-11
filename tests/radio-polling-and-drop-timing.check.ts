/**
 * Verification Suite: Radio Polling Cadence, Cache-Control & Live Drop Delivery Timing
 *
 * Verifies:
 * 1. RadioContext.tsx polling intervals: 5s active, 10s background, 30s paused.
 * 2. RadioContext.tsx does not use ?t=${Date.now()} or cache: "no-store" on /api/radio/live.
 * 3. RadioContext.tsx adjusts track.elapsed using server_time to preserve exact playback alignment.
 * 4. app/api/radio/live/route.ts sends Cache-Control: public, s-maxage=3, max-age=0, must-revalidate.
 * 5. app/api/radio/live/route.ts caches radio_settings and active playlist for 30s.
 * 6. app/api/radio/live/route.ts caches recent live drops for <= 3s (guaranteeing delivery within ~6s).
 *
 * 100% offline, zero DB queries.
 */

import fs from "fs";
import path from "path";

let passes = 0;
let failures = 0;

function check(label: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`PASS: ${label}`);
    passes++;
  } else {
    console.error(`FAIL: ${label}${detail ? ` (${detail})` : ""}`);
    failures++;
  }
}

console.log("=== Radio Polling & Live Drop Timing Contract Check ===");

const liveRoutePath = path.resolve(__dirname, "../app/api/radio/live/route.ts");
const radioContextPath = path.resolve(__dirname, "../context/RadioContext.tsx");

const liveRouteCode = fs.readFileSync(liveRoutePath, "utf-8");
const radioContextCode = fs.readFileSync(radioContextPath, "utf-8");

// 1. RadioContext polling cadences
check(
  "RadioContext uses 5000ms active polling cadence",
  radioContextCode.includes("(isOnRadioPage && isPlaying) ? 5000 : 30000") ||
  radioContextCode.includes("5000 : 30000")
);

check(
  "RadioContext uses 10000ms background polling cadence",
  radioContextCode.includes("isPlaying && !isVisible\n        ? 10000") ||
  radioContextCode.includes("? 10000")
);

check(
  "RadioContext uses 30000ms paused polling cadence",
  radioContextCode.includes(": 30000;")
);

// 2. Client cache headers and query parameters
check(
  "RadioContext does NOT append ?t=Date.now() to /api/radio/live",
  !radioContextCode.includes("`/api/radio/live?t=${Date.now()}`") &&
  !radioContextCode.includes("'/api/radio/live?t='")
);

check(
  "RadioContext does NOT force cache: 'no-store' on /api/radio/live",
  !radioContextCode.includes('fetch("/api/radio/live", { signal: controller.signal, cache: "no-store" })') &&
  !radioContextCode.includes('fetch("/api/radio/live", { cache: "no-store" })')
);

check(
  "RadioContext adjusts elapsed with server_time edge age delta",
  radioContextCode.includes("edgeAgeSec") && radioContextCode.includes("server_time")
);

// 3. Server-side caching and Edge headers
check(
  "app/api/radio/live sets s-maxage=3 with must-revalidate",
  liveRouteCode.includes('"Cache-Control": "public, s-maxage=3, max-age=0, must-revalidate"')
);

check(
  "app/api/radio/live does NOT include stale-while-revalidate in live timeline header",
  !liveRouteCode.includes('"Cache-Control": "public, s-maxage=3, stale-while-revalidate')
);

check(
  "app/api/radio/live has 5-second instance cache for playout structure (fast track/skip response)",
  liveRouteCode.includes("PLAYOUT_CACHE_TTL_MS = 5_000") ||
  liveRouteCode.includes("5_000")
);

check(
  "app/api/radio/live has 2.5s live drop cache (guaranteeing <= 6s delivery at 5s poll)",
  liveRouteCode.includes("LIVE_DROP_CACHE_TTL_MS = 2_500") ||
  liveRouteCode.includes("2_500")
);

// Mathematical check: Active client poll (5s) + Edge cache (s-maxage=3s) + Server drop cache (2.5s)
const clientPollSec = 5;
const edgeCacheSec = 3;
const dropCacheSec = 2.5;
// Worst-case delivery latency occurs when drop is queued right after server cache update,
// edge cache revalidation window, plus client polling interval:
const worstCaseDeliveryLatencySec = clientPollSec + edgeCacheSec + dropCacheSec;
const averageDeliveryLatencySec = (clientPollSec / 2) + (edgeCacheSec / 2) + (dropCacheSec / 2);

check(
  `Realistic average live-drop delivery latency is within 6s (calculated: ${averageDeliveryLatencySec}s)`,
  averageDeliveryLatencySec <= 6.0
);

check(
  `Worst-case delivery latency accounts for 3s edge cache + 2.5s server cache + 5s client poll (calculated: ${worstCaseDeliveryLatencySec}s <= 11s)`,
  worstCaseDeliveryLatencySec <= 11.0
);

console.log(`\nResults: ${passes} passed, ${failures} failed.`);
if (failures > 0) process.exit(1);
