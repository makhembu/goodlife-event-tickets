import fs from "fs";
import path from "path";
import { BITRATE_TIERS, estimateDataUsageMb, resolveLiveStreamUrl } from "../lib/radio/bitrate";

let failures = 0;
function assert(condition: boolean, message: string) {
  if (condition) console.log(`PASS: ${message}`);
  else {
    console.error(`FAIL: ${message}`);
    failures++;
  }
}

console.log("--- Testing Radio Bitrates & Data Usage Estimates ---");

// 1. Bitrate tier constants
assert(BITRATE_TIERS.standard.bitrateKbps === 64, "Standard bitrate is 64 kbps (Data Saver)");
assert(BITRATE_TIERS.high.bitrateKbps === 192, "High bitrate is 192 kbps (Hi-Fi)");
assert(BITRATE_TIERS.standard.dataPerHourMb === 28, "Standard approx data is 28 MB/hour");
assert(BITRATE_TIERS.high.dataPerHourMb === 84, "High approx data is 84 MB/hour");

// 2. Data calculation function (seconds, quality)
const standard1Hr = estimateDataUsageMb(3600, "standard");
assert(Math.round(standard1Hr) === 28, `Standard 1 hour calculates ~28 MB (got ${standard1Hr.toFixed(1)} MB)`);

const high1Hr = estimateDataUsageMb(3600, "high");
assert(Math.round(high1Hr) === 84, `High 1 hour calculates ~84 MB (got ${high1Hr.toFixed(1)} MB)`);

const standardHalfHr = estimateDataUsageMb(1800, "standard");
assert(Math.round(standardHalfHr) === 14, `Standard 30 min calculates ~14 MB (got ${standardHalfHr.toFixed(1)} MB)`);

// 3. Stream URL resolution (baseStreamUrl, quality)
const lowMp3 = resolveLiveStreamUrl("https://radio.goodlife.co.ke/listen/goodlife/live.mp3", "standard");
assert(lowMp3.includes("live_low.mp3"), "Standard quality rewrites live.mp3 to live_low.mp3");

const hiMp3 = resolveLiveStreamUrl("https://radio.goodlife.co.ke/listen/goodlife/live.mp3", "high");
assert(hiMp3.includes("live_hi.mp3"), "High quality rewrites live.mp3 to live_hi.mp3");

const hlsUrl = resolveLiveStreamUrl("https://radio.goodlife.co.ke/hls/live.m3u8", "standard");
assert(hlsUrl.includes("live_low.m3u8"), "Standard quality rewrites HLS live.m3u8 to live_low.m3u8");

const hlsHiUrl = resolveLiveStreamUrl("https://radio.goodlife.co.ke/hls/live.m3u8", "high");
assert(hlsHiUrl.includes("live_hi.m3u8"), "High quality rewrites HLS live.m3u8 to live_hi.m3u8");

// 4. Verify Liquidsoap config contains both outputs
const liqPath = path.join(process.cwd(), "home-server/liquidsoap/goodlife-station.liq");
const liqContent = fs.readFileSync(liqPath, "utf8");

assert(liqContent.includes('mount="/listen/goodlife/live_low.mp3"'), "Liquidsoap defines live_low.mp3 mount");
assert(liqContent.includes('mount="/listen/goodlife/live_hi.mp3"'), "Liquidsoap defines live_hi.mp3 mount");
assert(liqContent.includes('bitrate=64'), "Liquidsoap configures 64k encoder for Data Saver");
assert(liqContent.includes('bitrate=192'), "Liquidsoap configures 192k encoder for Hi-Fi");
assert(liqContent.includes('mount="/listen/goodlife/live.mp3"'), "Liquidsoap keeps legacy live.mp3 mount aliased to low");

// 5. Verify Service Worker skips audio streams
const swPath = path.join(process.cwd(), "public/sw.js");
const swContent = fs.readFileSync(swPath, "utf8");

assert(swContent.includes(".mp3") && swContent.includes(".m3u8"), "Service Worker explicitly bypasses .mp3 and .m3u8 audio streams");

if (failures > 0) {
  console.error(`\nFAILED: ${failures} check(s) failed.`);
  process.exit(1);
} else {
  console.log("\nALL BITRATE & STREAM CHECKS PASSED.");
}
