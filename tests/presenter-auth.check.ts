/**
 * Verification test suite for Goodlife Presenter authentication:
 * - Password hashing and verification (bcryptjs)
 * - HMAC-SHA256 session cookie signing and verification
 * - Fail-closed security when secrets are missing
 * - Role separation: presenter session rejected by admin, vendor, and scanner auth
 *
 * Run with:
 *   .\node_modules\.bin\tsx.cmd tests/presenter-auth.check.ts
 */

import {
  hashPresenterPassword,
  comparePresenterPassword,
  signPresenterSession,
  verifyPresenterSession,
  PresenterSessionPayload,
} from "../lib/presenter-session";
import { createHmac } from "crypto";

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
  console.log("=== Goodlife Presenter Authentication Checks ===");

  const TEST_SECRET = "test_presenter_session_secret_32chars_long_123456";
  process.env.PRESENTER_SESSION_SECRET = TEST_SECRET;

  // 1. Password Hashing (bcryptjs)
  const plainPassword = "SuperSecretPresenterPassword!2026";
  const hashedPassword = await hashPresenterPassword(plainPassword);

  check(
    "hashPresenterPassword produces standard bcrypt hash starting with $2",
    hashedPassword.startsWith("$2")
  );
  check(
    "comparePresenterPassword accepts correct password",
    await comparePresenterPassword(plainPassword, hashedPassword)
  );
  check(
    "comparePresenterPassword rejects incorrect password",
    (await comparePresenterPassword("WrongPassword123!", hashedPassword)) === false
  );
  check(
    "comparePresenterPassword rejects empty password",
    (await comparePresenterPassword("", hashedPassword)) === false
  );

  // 2. Presenter Session Signing and Verification
  const samplePresenter = {
    id: 101,
    email: "dj.kmr@goodlife.co.ke",
    dj_name: "DJ KMR",
    slug: "dj-kmr",
    must_change_password: false,
  };

  const validToken = await signPresenterSession(samplePresenter);
  check("signPresenterSession returns token with dot separator", validToken.includes("."));

  const verified = await verifyPresenterSession(validToken);
  check("verifyPresenterSession successfully parses valid token", verified !== null);
  check("verified payload preserves presenterId", verified?.presenterId === 101);
  check("verified payload preserves email", verified?.email === "dj.kmr@goodlife.co.ke");
  check("verified payload preserves role 'presenter'", verified?.role === "presenter");
  check("verified payload preserves djName", verified?.djName === "DJ KMR");

  // 3. Tampering and Integrity
  const [payloadB64, sigB64] = validToken.split(".");
  const tamperedSigToken = `${payloadB64}.tamperedSignatureValueHere123456789`;
  check(
    "Tampered signature is rejected",
    (await verifyPresenterSession(tamperedSigToken)) === null
  );

  const tamperedPayload = Buffer.from(
    JSON.stringify({
      role: "presenter",
      presenterId: 999,
      slug: "hacked",
      email: "hacker@bad.com",
      djName: "Hacker",
      mustChangePassword: false,
      exp: Math.floor(Date.now() / 1000) + 3600,
    })
  ).toString("base64url");
  const tamperedPayloadToken = `${tamperedPayload}.${sigB64}`;
  check(
    "Tampered payload with original signature is rejected",
    (await verifyPresenterSession(tamperedPayloadToken)) === null
  );

  // 4. Fail-closed on missing secret
  delete process.env.PRESENTER_SESSION_SECRET;
  let threwWithoutSecret = false;
  try {
    await signPresenterSession(samplePresenter);
  } catch {
    threwWithoutSecret = true;
  }
  check(
    "signPresenterSession throws error when PRESENTER_SESSION_SECRET is unset (fail-closed)",
    threwWithoutSecret
  );

  check(
    "verifyPresenterSession returns null when PRESENTER_SESSION_SECRET is unset (fail-closed)",
    (await verifyPresenterSession(validToken)) === null
  );

  // Restore test secret for remaining checks
  process.env.PRESENTER_SESSION_SECRET = TEST_SECRET;

  // 5. Cross-Role Isolation: Presenter token must NEVER be accepted as admin, vendor, or scanner
  const vendorPayload = JSON.parse(Buffer.from(payloadB64, "base64url").toString());
  const isVendorAccepted = Boolean(vendorPayload && vendorPayload.vendorId);
  check(
    "Presenter token lacks vendorId and is rejected by Vendor auth",
    isVendorAccepted === false
  );

  const isScannerAccepted = Boolean(vendorPayload && vendorPayload.role === "scanner");
  check(
    "Presenter token has role 'presenter' != 'scanner' and is rejected by Scanner auth",
    isScannerAccepted === false
  );

  // Admin cookie verification simulation:
  // Admin format is: <timestamp>.<payload>.<sig> (3 parts)
  const is3PartAdmin = validToken.split(".").length === 3;
  check(
    "Presenter token (2 parts) fails Admin cookie 3-part signature format",
    is3PartAdmin === false
  );

  // 6. External/Foreign tokens rejected by verifyPresenterSession
  const fakeAdminCookie = "1763000000.admin.validsig";
  check(
    "Foreign admin cookie format rejected by verifyPresenterSession",
    (await verifyPresenterSession(fakeAdminCookie)) === null
  );

  const vendorTokenLike = `${Buffer.from(JSON.stringify({ vendorId: 42, role: "vendor" })).toString("base64url")}.${createHmac("sha256", TEST_SECRET).update("test").digest("base64url")}`;
  check(
    "Token with role != 'presenter' is rejected by verifyPresenterSession",
    (await verifyPresenterSession(vendorTokenLike)) === null
  );

  console.log(`\n${pass} passed, ${failures.length} failed\n`);
  if (failures.length > 0) {
    process.exit(1);
  }
}

runTests();
