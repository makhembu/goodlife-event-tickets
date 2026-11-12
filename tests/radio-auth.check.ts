/**
 * Verification test suite for Goodlife Radio machine-to-machine authentication,
 * stream key cryptography, and schedule-enforced connect authorization.
 *
 * Run with:
 *   .\node_modules\.bin\tsx.cmd tests/radio-auth.check.ts
 */

import crypto from "crypto";
import {
  generateStreamKey,
  hashStreamKey,
  verifyStreamKey,
  formatStreamKeyPrefix,
  formatPresenterUsername,
  extractSlugFromUsername,
} from "../lib/radio/stream-keys";
import { verifyInternalMachineAuth } from "../lib/radio/internal-auth";

let pass = 0;
const failures: string[] = [];

function check(name: string, condition: boolean) {
  if (condition) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    failures.push(name);
    console.error(`  ✗ FAIL: ${name}`);
  }
}

async function runTests() {
  console.log("=== Goodlife Radio Stream Keys & Auth Checks ===");

  // 1. Stream Key Generation & Prefix Formatting
  const gen1 = generateStreamKey();
  const key1 = gen1.fullKey;
  const hash1 = gen1.hash;
  const prefix1 = gen1.prefix;

  check("Generated stream key starts with 'gl_live_'", key1.startsWith("gl_live_"));
  check("Generated stream key is 40 characters long (gl_live_ + 32 hex)", key1.length === 40);

  const gen2 = generateStreamKey();
  const key2 = gen2.fullKey;
  check("Successive stream keys are uniquely generated", key1 !== key2);

  check("Stream key hash is 64 hex characters (SHA-256)", hash1.length === 64 && /^[0-9a-f]{64}$/.test(hash1));
  check("Stream key hash is deterministic", hashStreamKey(key1) === hash1);
  check("Different stream keys yield different hashes", hashStreamKey(key2) !== hash1);

  check("verifyStreamKey matches correct plaintext key against hash", verifyStreamKey(key1, hash1));
  check("verifyStreamKey rejects incorrect plaintext key", !verifyStreamKey("gl_live_wrongkey1234567890abcdef", hash1));
  check("verifyStreamKey safely handles malformed or empty inputs", !verifyStreamKey("", hash1) && !verifyStreamKey(key1, ""));

  const prefix = formatStreamKeyPrefix(key1);
  check("Stream key preview prefix hides secret body with ellipsis", prefix.startsWith("gl_live_") && prefix.includes("...") && prefix.length === 18);
  check("Stream key preview ends with last 4 characters of key", prefix.endsWith(key1.slice(-4)));
  check("Generated prefix matches formatted preview", prefix1 === prefix);

  // 2. Presenter Username Slugs
  check("formatPresenterUsername prefixes slug with dj_", formatPresenterUsername("khesh") === "dj_khesh");
  check("formatPresenterUsername handles existing dj_ prefix idempotently", formatPresenterUsername("dj_khesh") === "dj_khesh");
  check("extractSlugFromUsername strips dj_ prefix", extractSlugFromUsername("dj_khesh") === "khesh");
  check("extractSlugFromUsername handles plain slug without dj_", extractSlugFromUsername("khesh") === "khesh");

  // 3. HMAC Machine-to-Machine Auth Verification
  console.log("\n=== HMAC Machine-to-Machine Route Auth ===");
  const testSecret = "goodlife_test_hmac_secret_key_0123456789abcdef";
  process.env.RADIO_BRIDGE_SECRET = testSecret;

  const testBody = JSON.stringify({ username: "dj_khesh", stream_key: key1 });
  const nowTs = Math.floor(Date.now() / 1000);

  function createSignedRequest(body: string, timestamp: number, secret: string) {
    const bodyHash = crypto.createHash("sha256").update(body).digest("hex");
    const sigPayload = `${timestamp}:${bodyHash}`;
    const sig = crypto.createHmac("sha256", secret).update(sigPayload).digest("hex");

    return new Request("https://goodlife.co.ke/api/internal/radio-auth", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Bridge-Timestamp": timestamp.toString(),
        "X-Bridge-Signature": sig,
      },
      body,
    }) as any;
  }

  const validReq = createSignedRequest(testBody, nowTs, testSecret);
  const validAuth = await verifyInternalMachineAuth(validReq, testBody);
  check("Valid HMAC signature and fresh timestamp authorizes successfully", validAuth === null);

  // Expired timestamp (301 seconds ago > 300s window)
  const expiredReq = createSignedRequest(testBody, nowTs - 305, testSecret);
  const expiredAuth = await verifyInternalMachineAuth(expiredReq, testBody);
  check("Expired timestamp (>300s) is rejected (anti-replay guard)", expiredAuth !== null && expiredAuth.status === 401);

  // Future timestamp beyond tolerance
  const futureReq = createSignedRequest(testBody, nowTs + 305, testSecret);
  const futureAuth = await verifyInternalMachineAuth(futureReq, testBody);
  check("Future timestamp (>300s) is rejected", futureAuth !== null && futureAuth.status === 401);

  // Tampered body with original signature
  const tamperedBody = JSON.stringify({ username: "dj_attacker", stream_key: key1 });
  const tamperedReq = new Request("https://goodlife.co.ke/api/internal/radio-auth", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Bridge-Timestamp": nowTs.toString(),
      "X-Bridge-Signature": validReq.headers.get("X-Bridge-Signature")!,
    },
    body: tamperedBody,
  }) as any;
  const tamperedAuth = await verifyInternalMachineAuth(tamperedReq, tamperedBody);
  check("Tampered payload with valid signature is rejected", tamperedAuth !== null && tamperedAuth.status === 403);

  // Wrong secret key used to generate signature
  const wrongSecretReq = createSignedRequest(testBody, nowTs, "wrong_secret_key");
  const wrongSecretAuth = await verifyInternalMachineAuth(wrongSecretReq, testBody);
  check("Signature created with wrong secret is rejected", wrongSecretAuth !== null && wrongSecretAuth.status === 403);

  // Fail-closed when secret is missing from environment
  delete process.env.RADIO_BRIDGE_SECRET;
  delete process.env.GOODLIFE_RADIO_SECRET_KEY;
  delete process.env.BRIDGE_SECRET;
  const noSecretAuth = await verifyInternalMachineAuth(validReq, testBody);
  check("Missing server secret fails closed (rejects all requests with 500)", noSecretAuth !== null && noSecretAuth.status === 500);

  // 4. Schedule-Enforced Connect Authorization Rules Simulation
  console.log("\n=== Schedule & Handover Authorization Logic ===");
  const now = new Date("2026-11-20T17:00:00.000Z"); // 20:00 EAT

  interface MockPresenter {
    id: number;
    name: string;
    slug: string;
    stream_key_hash: string;
    is_active: boolean;
  }

  interface MockSlot {
    id: number;
    show_id: number;
    starts_at: Date;
    ends_at: Date;
    status: string;
    presenter_id: number;
    substitute_presenter_id: number | null;
  }

  function authorizeConnection(
    presenter: MockPresenter | null,
    providedKey: string,
    currentSlots: MockSlot[],
    checkTime: Date,
    activeLiveSlot: MockSlot | null
  ): { allow: boolean; reason: string; retry_after_seconds?: number } {
    if (!presenter) return { allow: false, reason: "presenter_not_found" };
    if (!presenter.is_active) return { allow: false, reason: "presenter_suspended" };
    if (!verifyStreamKey(providedKey, presenter.stream_key_hash)) return { allow: false, reason: "invalid_stream_key" };

    const warmupMs = 15 * 60 * 1000;
    const eligibleSlots = currentSlots.filter((slot) => {
      const isDjsSlot = slot.presenter_id === presenter.id || slot.substitute_presenter_id === presenter.id;
      if (!isDjsSlot) return false;
      const windowStart = new Date(slot.starts_at.getTime() - warmupMs);
      return checkTime >= windowStart && checkTime <= slot.ends_at;
    });

    if (eligibleSlots.length === 0) {
      return { allow: false, reason: "no_scheduled_slot_in_window" };
    }

    const slot = eligibleSlots[0];
    const isEarly = checkTime < slot.starts_at;

    // Rule: if connecting early during warmup window and another presenter is currently live on air, reject with retry time
    if (isEarly && activeLiveSlot && activeLiveSlot.id !== slot.id && activeLiveSlot.status === "live") {
      const retrySec = Math.max(1, Math.ceil((slot.starts_at.getTime() - checkTime.getTime()) / 1000));
      return {
        allow: false,
        reason: "another_presenter_is_currently_live",
        retry_after_seconds: retrySec,
      };
    }

    return { allow: true, reason: "authorized" };
  }

  const djKhesh: MockPresenter = {
    id: 1,
    name: "DJ Khesh",
    slug: "khesh",
    stream_key_hash: hash1,
    is_active: true,
  };

  const djNext: MockPresenter = {
    id: 2,
    name: "DJ Next",
    slug: "next",
    stream_key_hash: hashStreamKey(key2),
    is_active: true,
  };

  const currentSlot: MockSlot = {
    id: 101,
    show_id: 1,
    starts_at: new Date("2026-11-20T16:00:00.000Z"),
    ends_at: new Date("2026-11-20T17:00:00.000Z"),
    status: "live",
    presenter_id: 1,
    substitute_presenter_id: null,
  };

  const upcomingSlot: MockSlot = {
    id: 102,
    show_id: 2,
    starts_at: new Date("2026-11-20T17:00:00.000Z"),
    ends_at: new Date("2026-11-20T18:00:00.000Z"),
    status: "scheduled",
    presenter_id: 2,
    substitute_presenter_id: null,
  };

  // DJ Khesh connects during their active live slot
  const test1 = authorizeConnection(djKhesh, key1, [currentSlot], new Date("2026-11-20T16:30:00.000Z"), currentSlot);
  check("Active presenter connecting during slot is allowed", test1.allow);

  // DJ Khesh connects with wrong key
  const test2 = authorizeConnection(djKhesh, "gl_live_wrong", [currentSlot], new Date("2026-11-20T16:30:00.000Z"), currentSlot);
  check("Presenter with wrong key is rejected", !test2.allow && test2.reason === "invalid_stream_key");

  // Suspended presenter
  const suspendedKhesh = { ...djKhesh, is_active: false };
  const test3 = authorizeConnection(suspendedKhesh, key1, [currentSlot], new Date("2026-11-20T16:30:00.000Z"), currentSlot);
  check("Suspended presenter is rejected", !test3.allow && test3.reason === "presenter_suspended");

  // Outside slot and outside warmup window (e.g. 2 hours early)
  const test4 = authorizeConnection(djNext, key2, [upcomingSlot], new Date("2026-11-20T14:30:00.000Z"), null);
  check("Connection outside slot and outside warmup window is rejected", !test4.allow && test4.reason === "no_scheduled_slot_in_window");

  // Warmup collision check: DJ Next connects at 16:50 (10 mins early in warmup), but DJ Khesh is actively live
  const test5 = authorizeConnection(djNext, key2, [upcomingSlot], new Date("2026-11-20T16:50:00.000Z"), currentSlot);
  check(
    "Early connection during warmup is blocked when another DJ is on air",
    !test5.allow && test5.reason === "another_presenter_is_currently_live" && test5.retry_after_seconds === 600
  );

  // Warmup allowed when air is clear (AutoDJ playing)
  const test6 = authorizeConnection(djNext, key2, [upcomingSlot], new Date("2026-11-20T16:50:00.000Z"), null);
  check("Early connection during warmup is allowed when air is clear (no live DJ)", test6.allow);

  // Handover point: 17:00:00 arrives, DJ Next connects at exact start time
  const test7 = authorizeConnection(djNext, key2, [upcomingSlot], new Date("2026-11-20T17:00:00.000Z"), currentSlot);
  check("Connection at exact slot start time is allowed", test7.allow);

  // Substitute presenter allowed for covered slot
  const coveredSlot: MockSlot = {
    ...upcomingSlot,
    substitute_presenter_id: 1, // DJ Khesh covering for DJ Next
  };
  const test8 = authorizeConnection(djKhesh, key1, [coveredSlot], new Date("2026-11-20T17:05:00.000Z"), null);
  check("Substitute presenter is authorized to broadcast on covered slot", test8.allow);

  console.log(`\nResults: ${pass} passed, ${failures.length} failed`);
  if (failures.length > 0) {
    process.exit(1);
  }
}

runTests();
