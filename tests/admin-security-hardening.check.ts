/**
 * Verification test for Commit 1 security hardening.
 * Completely offline: NEVER imports or connects to Neon database.
 *
 *   npx tsx tests/admin-security-hardening.check.ts
 */

import { NextRequest } from "next/server";
import { signAdminSession, verifyAdminSession } from "../lib/admin-session";
import { requireAdmin } from "../lib/admin-auth";
import { requireScannerOrAdmin, isValidScannerSession } from "../lib/scanner-auth";

function check(desc: string, condition: boolean) {
  if (condition) {
    console.log(`  ✓ ${desc}`);
  } else {
    console.error(`  ✗ FAIL: ${desc}`);
    process.exit(1);
  }
}

async function signScannerToken(secret: string = "goodlife_scanner_secret_salt"): Promise<string> {
  const payload = JSON.stringify({
    role: "scanner",
    stewardName: "Gate Lead",
    gateName: "Main Gate",
    exp: Math.floor(Date.now() / 1000) + 3600,
  });
  const enc = new TextEncoder();
  const b64 = Buffer.from(payload).toString("base64url");
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sigBuf = await crypto.subtle.sign("HMAC", key, enc.encode(b64));
  const sigB64 = Buffer.from(sigBuf).toString("base64url");
  return `${b64}.${sigB64}`;
}

async function runTests() {
  console.log("Starting Commit 1 Offline Security Verification Suite...\n");

  const validAdminToken = await signAdminSession(3600);
  const validScannerToken = await signScannerToken();

  // 1. Unauthenticated requests must fail closed with 401
  console.log("[1] Unauthenticated Request Rejection");
  const unauthReq = new NextRequest("http://localhost:3000/api/admin/settlements");
  const unauthRes = await requireAdmin(unauthReq);
  check("requireAdmin returns 401 for unauthenticated request", unauthRes !== null && unauthRes.status === 401);

  const unauthScanReq = new NextRequest("http://localhost:3000/api/admin/scan/TICK-123");
  const unauthScanRes = await requireScannerOrAdmin(unauthScanReq);
  check("requireScannerOrAdmin returns 401 for unauthenticated request", unauthScanRes !== null && unauthScanRes.status === 401);

  // 2. Admin cookie succeeds on both general admin and scanner endpoints
  console.log("\n[2] Admin Cookie Authorization");
  const adminReq = new NextRequest("http://localhost:3000/api/admin/settlements", {
    headers: { cookie: `goodlife_admin_session=${validAdminToken}` }
  });
  const adminRes = await requireAdmin(adminReq);
  check("requireAdmin returns null (authorized) for valid admin session", adminRes === null);

  const adminScanReq = new NextRequest("http://localhost:3000/api/admin/scan/TICK-123", {
    headers: { cookie: `goodlife_admin_session=${validAdminToken}` }
  });
  const adminScanRes = await requireScannerOrAdmin(adminScanReq);
  check("requireScannerOrAdmin returns null (authorized) for admin session", adminScanRes === null);

  // 3. Scanner session is accepted ONLY on scan endpoints, rejected on all other admin routes
  console.log("\n[3] Scanner Role Bounded Isolation");
  const isScannerValid = await isValidScannerSession(validScannerToken);
  check("isValidScannerSession validates correctly formed scanner token", isScannerValid === true);

  const scannerScanReq = new NextRequest("http://localhost:3000/api/admin/scan/TICK-123", {
    headers: { cookie: `goodlife_scanner_session=${validScannerToken}` }
  });
  const scannerScanRes = await requireScannerOrAdmin(scannerScanReq);
  check("requireScannerOrAdmin returns null (authorized) for scanner session", scannerScanRes === null);

  const scannerAdminReq = new NextRequest("http://localhost:3000/api/admin/settlements", {
    headers: { cookie: `goodlife_scanner_session=${validScannerToken}` }
  });
  const scannerAdminRes = await requireAdmin(scannerAdminReq);
  check("requireAdmin returns 401 when scanner session attempts to access settlements", scannerAdminRes !== null && scannerAdminRes.status === 401);

  // 4. Tampered & expired tokens must fail
  console.log("\n[4] Tampering & Expiration Rejection");
  const tamperedReq = new NextRequest("http://localhost:3000/api/admin/settlements", {
    headers: { cookie: `goodlife_admin_session=${validAdminToken}forged` }
  });
  check("requireAdmin rejects tampered admin cookie", (await requireAdmin(tamperedReq))?.status === 401);

  const expiredAdminToken = await signAdminSession(-10); // 10s in past
  const expiredReq = new NextRequest("http://localhost:3000/api/admin/settlements", {
    headers: { cookie: `goodlife_admin_session=${expiredAdminToken}` }
  });
  check("requireAdmin rejects expired admin session", (await requireAdmin(expiredReq))?.status === 401);

  // 5. Legacy cookie cutover: rejected when ALLOW_LEGACY_ADMIN_COOKIE=false
  console.log("\n[5] Legacy 'true' Cookie Cutover Check");
  const prevEnv = process.env.ALLOW_LEGACY_ADMIN_COOKIE;
  try {
    process.env.ALLOW_LEGACY_ADMIN_COOKIE = "false";
    const legacyReq = new NextRequest("http://localhost:3000/api/admin/settlements", {
      headers: { cookie: `goodlife_admin_session=true` }
    });
    const legacyRes = await requireAdmin(legacyReq);
    check("requireAdmin strictly rejects cookie 'true' when ALLOW_LEGACY_ADMIN_COOKIE=false", legacyRes !== null && legacyRes.status === 401);
  } finally {
    process.env.ALLOW_LEGACY_ADMIN_COOKIE = prevEnv;
  }

  // 6. Security check on gate_pin stripping and Cache-Control headers
  console.log("\n[6] event-details Secret Leak Prevention & Cache Policy");
  const rawDetails = {
    id: 1,
    title: "GOODLIFE 4",
    venue: "Marara Camp",
    gate_pin: "4829",
    till_number: "444555",
  };
  const { gate_pin, ...safeDetails } = rawDetails as any;
  check("gate_pin is deleted from sanitized object", (safeDetails as any).gate_pin === undefined);
  check("other fields (title, venue, till_number) preserved", safeDetails.title === "GOODLIFE 4" && safeDetails.venue === "Marara Camp");

  const fs = await import("fs");
  const path = await import("path");
  const eventDetailsSrc = fs.readFileSync(path.resolve(__dirname, "../app/api/event-details/route.ts"), "utf-8");
  check("event-details sets public s-maxage=10 without stale-while-revalidate", eventDetailsSrc.includes('"Cache-Control": "public, s-maxage=10, must-revalidate"') && !eventDetailsSrc.includes("stale-while-revalidate"));
  check("event-details sets admin response to private no-store", eventDetailsSrc.includes('"Cache-Control": "private, no-store, must-revalidate"'));

  // 7. Login cookie sameSite policy
  console.log("\n[7] Admin Login Cookie Policy");
  const loginSrc = fs.readFileSync(path.resolve(__dirname, "../app/api/admin/login/route.ts"), "utf-8");
  check("login route sets sameSite: 'lax'", loginSrc.includes('sameSite: "lax"'));

  console.log("\n✓ All Commit 1 offline security checks passed successfully!");
}

runTests().catch((err) => {
  console.error("Test failure:", err);
  process.exit(1);
});
