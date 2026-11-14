/**
 * Behavior & Invariant Verification Suite for Radio Signed Temporary Playback.
 * Run: .\node_modules\.bin\tsx.cmd tests/radio-signed-playback.check.ts
 *
 * Explicitly categorized:
 * [Behavior]     - Executes runtime logic, functions, or cryptographic algorithms.
 * [Security]     - Verifies fail-closed invariants, authorization, and data stripping.
 */

import {
  resolveR2Key,
  playbackTtlSec,
  stablePlaybackPath,
  withPlayback,
} from "../lib/radio/playback";
import { signRadioPlaybackUrl } from "../lib/radio/r2-signer";

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
  console.log("Starting Radio Signed Temporary Playback Verification...\n");

  // 1. resolveR2Key behavior & passthrough rules
  check(
    "[Behavior] resolveR2Key extracts bare key when r2_key is present",
    resolveR2Key({ id: 1, r2_key: "radio/sets/track-1.mp3" }) === "radio/sets/track-1.mp3"
  );

  check(
    "[Behavior] resolveR2Key strips leading slashes from r2_key",
    resolveR2Key({ id: 1, r2_key: "/radio/sets/track-2.mp3" }) === "radio/sets/track-2.mp3"
  );

  check(
    "[Behavior] resolveR2Key extracts key from public R2 domain URL",
    resolveR2Key({ id: 1, audio_url: "https://pub-a4616bfcc17e435a86f092c95d4e603b.r2.dev/radio/sets/track-3.mp3" }) === "radio/sets/track-3.mp3"
  );

  check(
    "[Security] resolveR2Key returns null for local /public/ sample paths (passthrough invariant)",
    resolveR2Key({ id: 1, audio_url: "/radio/samples/scratch.mp3" }) === null
  );

  check(
    "[Security] resolveR2Key returns null for blob: URLs (passthrough invariant)",
    resolveR2Key({ id: 1, audio_url: "blob:https://goodlife.internal/uuid-1234" }) === null
  );

  check(
    "[Security] resolveR2Key returns null for external live stream Icecast URLs",
    resolveR2Key({ id: 1, audio_url: "https://stream.goodlife.internal/hls/stream.m3u8" }) === null
  );

  check(
    "[Security] resolveR2Key returns null for non-R2 upstream relays",
    resolveR2Key({ id: 1, audio_url: "http://localhost:8052/status-json.xsl" }) === null
  );

  check(
    "[Behavior] resolveR2Key returns null when no key or audio_url is present",
    resolveR2Key({ id: 1 }) === null
  );

  // 2. playbackTtlSec bounds & calculations
  check(
    "[Behavior] playbackTtlSec bounds short track (120s) to minimum 3600s",
    playbackTtlSec({ id: 1, duration_sec: 120 }) === 3600
  );

  check(
    "[Behavior] playbackTtlSec calculates duration_sec + 600 for long sets (7200s -> 7800s)",
    playbackTtlSec({ id: 1, duration_sec: 7200 }) === 7800
  );

  check(
    "[Behavior] playbackTtlSec caps extreme sets at 86400s (R2 presigned maximum)",
    playbackTtlSec({ id: 1, duration_sec: 100000 }) === 86400
  );

  check(
    "[Behavior] playbackTtlSec parses numeric duration string properly",
    playbackTtlSec({ id: 1, duration: "4800" }) === 5400
  );

  // 3. stablePlaybackPath URL generation
  check(
    "[Behavior] stablePlaybackPath constructs permanent track endpoint",
    stablePlaybackPath({ id: 42, r2_key: "radio/sets/42.mp3" }, "track") === "/api/radio/audio/track/42"
  );

  check(
    "[Behavior] stablePlaybackPath constructs permanent recording endpoint",
    stablePlaybackPath({ id: 99, r2_key: "radio/recordings/set99.mp3" }, "recording") === "/api/radio/audio/recording/99"
  );

  check(
    "[Behavior] stablePlaybackPath constructs permanent drop endpoint",
    stablePlaybackPath({ id: 7, audio_url: "https://pub-a4616bfcc17e435a86f092c95d4e603b.r2.dev/radio/drops/d7.mp3" }, "drop") === "/api/radio/audio/drop/7"
  );

  check(
    "[Behavior] stablePlaybackPath returns null for external streams",
    stablePlaybackPath({ id: 1, audio_url: "https://stream.external.com/live.mp3" }, "track") === null
  );

  // 4. withPlayback mapping and security stripping
  const sampleTrack = {
    id: 15,
    title: "Midnight Grooves",
    dj_name: "DJ Fusion",
    audio_url: "https://pub-a4616bfcc17e435a86f092c95d4e603b.r2.dev/radio/sets/midnight.mp3",
    audio_high_url: "https://pub-a4616bfcc17e435a86f092c95d4e603b.r2.dev/radio/sets/midnight-320k.mp3",
    r2_key: "radio/sets/midnight.mp3",
    r2_high_key: "radio/sets/midnight-320k.mp3",
    duration_sec: 3600,
  };

  const mappedTrack = withPlayback(sampleTrack, "track");
  check(
    "[Security] withPlayback populates stable permanent playback_url",
    mappedTrack.playback_url === "/api/radio/audio/track/15"
  );

  check(
    "[Security] withPlayback strips raw r2_key from output",
    !("r2_key" in mappedTrack)
  );

  check(
    "[Security] withPlayback strips raw r2_high_key from output",
    !("r2_high_key" in mappedTrack)
  );

  check(
    "[Security] withPlayback strips raw audio_high_url from output",
    !("audio_high_url" in mappedTrack)
  );

  check(
    "[Security] withPlayback strips raw audio_url when signed playback is active",
    !("audio_url" in mappedTrack)
  );

  check(
    "[Security] withPlayback preserves innocent metadata",
    mappedTrack.title === "Midnight Grooves" && mappedTrack.dj_name === "DJ Fusion" && mappedTrack.duration_sec === 3600
  );

  // 5. Fail-Closed Invariant on Missing Environment Variables
  const origBucket = process.env.RADIO_R2_BUCKET;
  try {
    process.env.RADIO_R2_BUCKET = "";
    const unsigned = await signRadioPlaybackUrl("radio/sets/test.mp3", 3600);
    check(
      "[Security] Missing RADIO_R2_BUCKET fails closed (returns null, NEVER a public fallback URL)",
      unsigned === null
    );
  } finally {
    if (origBucket !== undefined) process.env.RADIO_R2_BUCKET = origBucket;
    else delete process.env.RADIO_R2_BUCKET;
  }

  // 6. Real URL Signature Generation
  const signed = await signRadioPlaybackUrl("radio/sets/test.mp3", 3600);
  check(
    "[Behavior] signRadioPlaybackUrl returns signed URL containing signature parameters",
    typeof signed === "string" &&
      signed.includes("X-Amz-Signature=") &&
      signed.includes("X-Amz-Expires=3600") &&
      signed.includes("goodlife-radio-private")
  );

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
