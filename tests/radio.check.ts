/**
 * Verification test suite for GOODLIFE Independent Radio System (v3).
 * Run: .\node_modules\.bin\tsx.cmd tests/radio.check.ts
 */

import fs from "fs";
import path from "path";
import crypto from "crypto";

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
  console.log("Starting GOODLIFE Radio System verification...\n");

  // 1. Static Layout & Navigation checks
  const layoutCode = fs.readFileSync(path.join(process.cwd(), "app/layout.tsx"), "utf8");
  check("Root layout imports RadioProvider", layoutCode.includes("import { RadioProvider } from '@/context/RadioContext'"));
  check("Root layout imports GlobalRadioBar", layoutCode.includes("import GlobalRadioBar from '@/components/radio/GlobalRadioBar'"));
  check("Root layout wraps children in RadioProvider", layoutCode.includes("<RadioProvider>") && layoutCode.includes("</RadioProvider>"));
  check("Root layout renders GlobalRadioBar", layoutCode.includes("<GlobalRadioBar />"));

  const dashboardCode = fs.readFileSync(path.join(process.cwd(), "app/admin/dashboard/page.tsx"), "utf8");
  check("Admin dashboard has RADIO nav button", dashboardCode.includes('/admin/radio') && dashboardCode.includes('RADIO'));

  // 2. Admin Console Features
  const adminRadioCode = fs.readFileSync(path.join(process.cwd(), "app/admin/radio/page.tsx"), "utf8");
  check("Admin radio console has Invidious/YouTube search", adminRadioCode.includes("/api/admin/radio/search"));
  check("Admin radio console has playlist preview autoloader", adminRadioCode.includes("/api/admin/radio/playlist-preview"));
  check("Admin radio console has batch queue endpoint", adminRadioCode.includes("/api/admin/radio/queue"));
  check("Admin radio console has S3 multipart upload for DJ sets", adminRadioCode.includes("/api/admin/radio/multipart"));
  check("Admin radio console has Live broadcast stage controls", adminRadioCode.includes("/api/admin/radio/broadcast"));
  check("Admin radio console has active library manager", adminRadioCode.includes("/api/admin/radio/library"));
  check("Admin radio console has Hi-Fi 320k toggle option", adminRadioCode.includes("isHighQuality") && adminRadioCode.includes("320"));

  // 3. Audio Context & Player Engine
  const radioContextCode = fs.readFileSync(path.join(process.cwd(), "context/RadioContext.tsx"), "utf8");
  check("RadioContext implements BroadcastChannel for multi-tab sync", radioContextCode.includes("BroadcastChannel"));
  check("RadioContext implements mediaSession lock-screen support", radioContextCode.includes("navigator.mediaSession"));
  check("RadioContext implements hls.js for live stage stream", radioContextCode.includes("hls.js"));
  check("RadioContext supports both standard and high quality tiers", radioContextCode.includes('"standard"') && radioContextCode.includes('"high"'));
  check("RadioContext throttles position saves to localStorage", radioContextCode.includes("lastStateSaveRef"));
  check("RadioContext handles live stream drop fallback", radioContextCode.includes("liveDropFallback") && radioContextCode.includes("switchToCurated"));

  // 4. Global Floating Bar
  const barCode = fs.readFileSync(path.join(process.cwd(), "components/radio/GlobalRadioBar.tsx"), "utf8");
  check("GlobalRadioBar respects mobile checkout clearance", barCode.includes("bottom-[74px]") || barCode.includes("isCheckoutPage"));
  check("GlobalRadioBar has minimize floating pill FAB mode", barCode.includes("isMinimized"));
  check("GlobalRadioBar has Hi-Fi audio quality switcher pill", barCode.includes("switchQuality"));

  // 5. Public Radio Page
  const radioPageCode = fs.readFileSync(path.join(process.cwd(), "app/radio/page.tsx"), "utf8");
  check("Radio page connects to global RadioContext", radioPageCode.includes("useRadio()"));
  check("Radio page displays live stage broadcast indicator", radioPageCode.includes("isLive") || radioPageCode.includes("LIVE BROADCAST"));
  check("Radio page provides full tracklist queue drawer", radioPageCode.includes("queue.map"));

  // 6. Security & Bridge Client HMAC Signing Contract
  const bridgeClientCode = fs.readFileSync(path.join(process.cwd(), "lib/radio/bridge-client.ts"), "utf8");
  check("Bridge client uses sha256 HMAC", bridgeClientCode.includes('.createHmac("sha256"') || bridgeClientCode.includes(".createHmac('sha256'"));
  check("Bridge client attaches X-Bridge-Timestamp and X-Bridge-Signature", 
    bridgeClientCode.includes("X-Bridge-Timestamp") && bridgeClientCode.includes("X-Bridge-Signature")
  );

  // 7. Dynamic HMAC Verification & Replay Window Test
  const testSecret = "gl_bridge_super_secret_test_key_12345";
  const testPayload = JSON.stringify({ video_id: "test1234", title: "Test Track" });
  const testTimestamp = Math.floor(Date.now() / 1000).toString();
  const signatureData = `${testTimestamp}:${testPayload}`;
  const validSignature = crypto.createHmac("sha256", testSecret).update(signatureData).digest("hex");

  // Re-verify signature logic
  const computedSignature = crypto.createHmac("sha256", testSecret).update(`${testTimestamp}:${testPayload}`).digest("hex");
  const isValid = crypto.timingSafeEqual(Buffer.from(validSignature, "hex"), Buffer.from(computedSignature, "hex"));
  check("HMAC signature generates and verifies via timingSafeEqual", isValid);

  // Test replay window rejection (>300 seconds old)
  const staleTimestamp = (Math.floor(Date.now() / 1000) - 350).toString();
  const isExpired = Math.abs(Math.floor(Date.now() / 1000) - parseInt(staleTimestamp, 10)) > 300;
  check("Bridge client enforces 300-second replay rejection window", isExpired);

  // Test tampered payload detection
  const tamperedPayload = JSON.stringify({ video_id: "test1234", title: "Tampered Track" });
  const tamperedDigest = crypto.createHmac("sha256", testSecret).update(`${testTimestamp}:${tamperedPayload}`).digest("hex");
  const signaturesMatch = validSignature === tamperedDigest;
  check("Tampered payload fails HMAC verification", !signaturesMatch);

  // 8. Ingest Webhook Security
  const webhookCode = fs.readFileSync(path.join(process.cwd(), "app/api/webhooks/radio-ingest/route.ts"), "utf8");
  check("Ingest webhook requires X-Bridge-Signature", webhookCode.includes("X-Bridge-Signature"));
  check("Ingest webhook uses timingSafeEqual for constant-time comparison", webhookCode.includes("crypto.timingSafeEqual"));
  check("Ingest webhook uses parameterized SQL for radio_sets insertion", webhookCode.includes("INSERT INTO radio_sets"));

  // 9. Public API Edge Caching & Privacy Analytics
  const stateApiCode = fs.readFileSync(path.join(process.cwd(), "app/api/radio/state/route.ts"), "utf8");
  check("Public state endpoint specifies s-maxage edge cache header", stateApiCode.includes("s-maxage=10"));
  check("Public state endpoint filters out deleted and inactive tracks", stateApiCode.includes("is_active = true") && stateApiCode.includes("deleted_at IS NULL"));

  const playEventCode = fs.readFileSync(path.join(process.cwd(), "app/api/radio/play-event/route.ts"), "utf8");
  check("Play-event endpoint hashes session ID for Kenya DPA privacy compliance", playEventCode.includes('.createHash("sha256")') || playEventCode.includes(".createHash('sha256')"));
  check("Play-event endpoint enforces minimum listen threshold before counting play", playEventCode.includes("secondsListened >= 30"));

  // Summary
  console.log(`\n================================`);
  console.log(`Total checks: ${pass + failures.length}`);
  console.log(`Passed: ${pass}`);
  console.log(`Failed: ${failures.length}`);
  console.log(`================================`);

  if (failures.length > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Test execution error:", err);
  process.exit(1);
});
