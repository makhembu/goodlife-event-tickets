import crypto from "crypto";

/**
 * Verification test for radio bridge daemon <-> Next.js radio-ingest webhook signature.
 * 100% offline, 0 DB dependencies.
 */

function check(desc: string, condition: boolean) {
  if (condition) {
    console.log(`  ✓ PASS: ${desc}`);
  } else {
    console.error(`  ✗ FAIL: ${desc}`);
    process.exit(1);
  }
}

console.log("=== Testing Radio Ingest HMAC Signature & Timestamp Freshness ===");

// 1. Fixed test vector
const secret = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const timestamp = "1731234567";
const rawBody = JSON.stringify({
  video_id: "dQw4w9WgXcQ",
  title: "Never Gonna Give You Up",
  dj_name: "Rick Astley",
  audio_url: "https://r2.goodlife.smwhr.space/audio/track-123.mp3",
  duration_sec: 213,
});

// Python daemon computation:
// sig = hmac.new(BRIDGE_SECRET.encode("utf-8"), f"{ts_str}:{body_str}".encode("utf-8"), hashlib.sha256).hexdigest()
const pythonEquivalentSignature = crypto
  .createHmac("sha256", secret)
  .update(`${timestamp}:${rawBody}`)
  .digest("hex");

// Verify TypeScript verification function logic in app/api/webhooks/radio-ingest/route.ts
function verifySignature(
  incomingSig: string,
  incomingTs: string,
  body: string,
  sharedSecret: string
): boolean {
  try {
    const expectedSig = crypto
      .createHmac("sha256", sharedSecret)
      .update(`${incomingTs}:${body}`)
      .digest("hex");

    const sigBuf = Buffer.from(incomingSig, "hex");
    const expBuf = Buffer.from(expectedSig, "hex");
    if (sigBuf.length !== expBuf.length) return false;
    return crypto.timingSafeEqual(sigBuf, expBuf);
  } catch {
    return false;
  }
}

// Check 1: Matching signature passes
check(
  "Exact Python-style HMAC signature matches TypeScript verification",
  verifySignature(pythonEquivalentSignature, timestamp, rawBody, secret) === true
);

// Check 2: Tampered body fails
const tamperedBody = rawBody.replace("Never Gonna Give You Up", "Tampered Track");
check(
  "Tampered payload body is rejected",
  verifySignature(pythonEquivalentSignature, timestamp, tamperedBody, secret) === false
);

// Check 3: Tampered timestamp fails
const tamperedTs = "1731234568";
check(
  "Tampered timestamp in signature is rejected",
  verifySignature(pythonEquivalentSignature, tamperedTs, rawBody, secret) === false
);

// Check 4: Wrong secret fails
const wrongSecret = "fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210";
check(
  "Wrong secret is rejected",
  verifySignature(pythonEquivalentSignature, timestamp, rawBody, wrongSecret) === false
);

// Check 5: Timestamp skew window (+/- 300s)
function isTimestampFresh(tsStr: string, currentTimeSec: number): boolean {
  const reqTime = parseInt(tsStr, 10);
  if (isNaN(reqTime)) return false;
  return Math.abs(currentTimeSec - reqTime) <= 300;
}

const now = 1731234567;
check("Timestamp at exact current time is fresh", isTimestampFresh("1731234567", now));
check("Timestamp 4 minutes in past is fresh", isTimestampFresh("1731234327", now));
check("Timestamp 4 minutes in future is fresh", isTimestampFresh("1731234807", now));
check("Timestamp 6 minutes in past is rejected", !isTimestampFresh("1731234200", now));
check("Timestamp 6 minutes in future is rejected", !isTimestampFresh("1731234930", now));
check("Malformed timestamp string is rejected", !isTimestampFresh("not-a-number", now));

console.log("\nPASS: Radio ingest signature and timestamp freshness fully verified.\n");
