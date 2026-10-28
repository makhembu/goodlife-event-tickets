/**
 * Phase 1 Verification Suite for GOODLIFE Radio Live Playback Engine & Safety.
 * Run: .\node_modules\.bin\tsx.cmd tests/radio-playback.check.ts
 *
 * Explicitly categorized:
 * [Behavior]     - Executes runtime logic, functions, or mathematical algorithms.
 * [Source-Check] - Verifies static code constraints, security patterns, or AST invariants.
 */

import fs from "fs";
import path from "path";
import { computeRadioTiming, DEFAULT_TARGET_DURATION_SEC } from "../lib/radio/config";
import { resolveCoverArt, resolveFallbackCoverArt, formatTrackTitle, buildSongSearchUrls } from "../lib/radio/media-helpers";

let pass = 0;
const failures: string[] = [];

function check(name: string, condition: boolean, detail?: string) {
  if (condition) {
    pass++;
    console.log(`PASS: ${name}`);
  } else {
    failures.push(name);
    console.error(`FAIL: ${name}${detail ? ` - ${detail}` : ""}`);
  }
}

async function runTests() {
  console.log("Starting Phase 1 Live Radio Playback Engine Verification...\n");

  // 1. Dynamic State Machine Timing derived from Target Duration (No literal 8s)
  const timing2s = computeRadioTiming(2.0);
  check("[Behavior] Timing config derives 2s target duration", timing2s.targetDurationSec === 2.0);
  check("[Behavior] Reconnect threshold is 2 missed segments (4s)", timing2s.reconnectThresholdMs === 4000);
  check("[Behavior] Backup mix threshold is 4 missed segments (8s for 2s target)", timing2s.backupMixThresholdMs === 8000);
  check("[Behavior] Live probe interval is 2 target durations (4s)", timing2s.manifestProbeIntervalMs === 4000);

  const timing3s = computeRadioTiming(3.0);
  check("[Behavior] Timing config dynamically scales for 3s target duration", timing3s.targetDurationSec === 3.0);
  check("[Behavior] 3s target derives 6s reconnect threshold", timing3s.reconnectThresholdMs === 6000);
  check("[Behavior] 3s target derives 12s backup threshold (not hardcoded 8s)", timing3s.backupMixThresholdMs === 12000);
  check("[Behavior] 3s target derives 6s probe interval", timing3s.manifestProbeIntervalMs === 6000);

  // 2. Cover Art Resolution: 16:9 maxresdefault with mqdefault fallback to eliminate baked 4:3 letterboxing
  const hqUrl = "https://i.ytimg.com/vi/B12qTSkGmZw/hqdefault.jpg";
  const resolvedCover = resolveCoverArt(hqUrl);
  check("[Behavior] resolveCoverArt upgrades 4:3 hqdefault to 16:9 maxresdefault", resolvedCover === "https://i.ytimg.com/vi/B12qTSkGmZw/maxresdefault.jpg");

  const fallbackCover = resolveFallbackCoverArt(hqUrl);
  check("[Behavior] resolveFallbackCoverArt returns 16:9 mqdefault fallback", fallbackCover === "https://i.ytimg.com/vi/B12qTSkGmZw/mqdefault.jpg");

  check("[Behavior] resolveCoverArt falls back to /flyer.png when empty or null", resolveCoverArt(null) === "/flyer.png" && resolveCoverArt("") === "/flyer.png");
  check("[Behavior] resolveCoverArt preserves non-youtube image URLs", resolveCoverArt("https://images.goodlife.internal/album.jpg") === "https://images.goodlife.internal/album.jpg");

  // 3. Honest Title Fallback (Rule: NO invented defaults like 'GOODLIFE RADIO' or 'Unknown Track')
  check("[Behavior] formatTrackTitle returns honest 'Updating...' on null", formatTrackTitle(null) === "Updating...");
  check("[Behavior] formatTrackTitle returns honest 'Updating...' on empty string", formatTrackTitle("   ") === "Updating...");
  check("[Behavior] formatTrackTitle preserves real track title", formatTrackTitle("Billie Jean") === "Billie Jean");

  // 4. Song Search Link Builder (Spotify, Apple Music, YouTube Music, Audiomack; Dropped Boomplay)
  const links = buildSongSearchUrls("Billie Jean", "Michael Jackson");
  check("[Behavior] buildSongSearchUrls returns exactly 4 verified platforms", links.length === 4);
  check("[Behavior] Generates valid Spotify search link", links.some(l => l.platform === "Spotify" && l.url === "https://open.spotify.com/search/Billie%20Jean%20Michael%20Jackson"));
  check("[Behavior] Generates valid Apple Music search link", links.some(l => l.platform === "Apple Music" && l.url === "https://music.apple.com/search?term=Billie%20Jean%20Michael%20Jackson"));
  check("[Behavior] Generates valid YouTube Music search link", links.some(l => l.platform === "YouTube Music" && l.url === "https://music.youtube.com/search?q=Billie%20Jean%20Michael%20Jackson"));
  check("[Behavior] Generates valid Audiomack search link", links.some(l => l.platform === "Audiomack" && l.url === "https://audiomack.com/search?q=Billie%20Jean%20Michael%20Jackson"));
  check("[Behavior] Boomplay is dropped (unverified / bot-blocked)", !links.some(l => (l as any).platform === "Boomplay"));
  check("[Behavior] Empty title yields empty search links array", buildSongSearchUrls("", "").length === 0);

  // 5. Codebase Hygiene Invariant: No 192.168 or radio.darajadigital in app/components/lib/context
  const filesToScan = [
    "context/RadioContext.tsx",
    "lib/radio/config.ts",
    "lib/radio/media-helpers.ts",
    "app/api/radio/live/route.ts",
    "app/api/radio/state/route.ts",
    "app/api/radio/play-event/route.ts",
  ];

  for (const f of filesToScan) {
    const content = fs.readFileSync(path.join(process.cwd(), f), "utf8");
    check(`[Source-Check] No private LAN IP (192.168) in ${f}`, !content.includes("192.168."));
    check(`[Source-Check] No radio.darajadigital in ${f}`, !content.includes("radio.darajadigital"));
  }

  // 6. Fixtures Isolation Invariant: No app code imports tests/fixtures
  for (const f of filesToScan) {
    const content = fs.readFileSync(path.join(process.cwd(), f), "utf8");
    check(`[Source-Check] No fixture import in ${f}`, !content.includes("tests/fixtures"));
  }

  // 7. BFF Route Contract (/api/radio/live)
  const bffCode = fs.readFileSync(path.join(process.cwd(), "app/api/radio/live/route.ts"), "utf8");
  check("[Source-Check] BFF enforces 3000ms upstream timeout", bffCode.includes("3000"));
  check("[Source-Check] BFF specifies Cache-Control s-maxage=5", bffCode.includes("s-maxage=5"));
  check("[Source-Check] BFF includes stale-while-revalidate", bffCode.includes("stale-while-revalidate=15"));
  check("[Source-Check] BFF sets stale: true flag on upstream failure", bffCode.includes("stale: true"));
  check("[Source-Check] BFF reads RADIO_UPSTREAM_URL from env without hardcoded private IP", bffCode.includes("process.env.RADIO_UPSTREAM_URL"));

  // 8. Runtime Kill Switch & Inert Hook Contract
  const radioContextCode = fs.readFileSync(path.join(process.cwd(), "context/RadioContext.tsx"), "utf8");
  check("[Source-Check] RadioContext defines INERT_RADIO_STATE", radioContextCode.includes("INERT_RADIO_STATE"));
  check("[Source-Check] useRadio returns inert state instead of throwing", radioContextCode.includes("return ctx || INERT_RADIO_STATE;"));
  check("[Source-Check] Pause detaches HLS and releases buffer", radioContextCode.includes("detachMedia") && radioContextCode.includes('removeAttribute("src")'));
  check("[Source-Check] MediaSession registers handlers via refs", radioContextCode.includes("togglePlayDispatcherRef"));
  check("[Source-Check] BroadcastChannel tab sync uses goodlife_radio_tab_sync", radioContextCode.includes("goodlife_radio_tab_sync"));
  check("[Source-Check] Preload defaults to none", radioContextCode.includes('preload="none"'));

  // 9. Play Event Rate Limiting & Validation Contract
  const playEventCode = fs.readFileSync(path.join(process.cwd(), "app/api/radio/play-event/route.ts"), "utf8");
  check("[Source-Check] Play-event validates set_id > 0", playEventCode.includes("isNaN(setId)") || playEventCode.includes("setId <= 0"));
  check("[Source-Check] Play-event verifies set exists in database", playEventCode.includes("SELECT id FROM radio_sets"));
  check("[Source-Check] Play-event enforces rate limiting check", playEventCode.includes("isRateLimited"));

  console.log(`\n================================`);
  console.log(`Total checks: ${pass + failures.length}`);
  console.log(`Passed: ${pass}`);
  console.log(`Failed: ${failures.length}`);
  console.log(`================================\n`);

  if (failures.length > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Test execution threw error:", err);
  process.exit(1);
});
