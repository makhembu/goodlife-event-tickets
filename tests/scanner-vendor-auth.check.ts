/**
 * Verification check for Scanner & Vendor session cookie signing and validation.
 *
 *   npx tsx tests/scanner-vendor-auth.check.ts
 */

import { createHmac, timingSafeEqual } from "crypto";

function base64UrlToBytes(base64Url: string): Uint8Array | null {
  try {
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const padLen = (4 - (base64.length % 4)) % 4;
    const padded = base64 + "=".repeat(padLen);
    const binaryStr = atob(padded);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }
    return bytes;
  } catch {
    return null;
  }
}

function decodePayload(payloadB64Url: string): any {
  const bytes = base64UrlToBytes(payloadB64Url);
  if (!bytes) return null;
  try {
    const jsonStr = new TextDecoder().decode(bytes);
    return JSON.parse(jsonStr);
  } catch {
    return null;
  }
}

async function verifyHmacSha256(data: string, signatureB64Url: string, secret: string): Promise<boolean> {
  try {
    const sigBytes = base64UrlToBytes(signatureB64Url);
    if (!sigBytes) return false;

    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );

    return await crypto.subtle.verify(
      "HMAC",
      key,
      sigBytes as unknown as BufferSource,
      encoder.encode(data) as unknown as BufferSource
    );
  } catch {
    return false;
  }
}

// Web Crypto based validation functions matching Edge Runtime middleware
async function isValidScannerSession(cookieValue: string | undefined): Promise<boolean> {
  if (!cookieValue || !cookieValue.includes(".")) return false;
  const [payloadB64, sig] = cookieValue.split(".");
  if (!payloadB64 || !sig) return false;
  const secret = process.env.SCANNER_SESSION_SECRET || process.env.TAB_SELF_PAY_SECRET || process.env.PAYHERO_CALLBACK_TOKEN || "goodlife_scanner_secret_salt";
  const isSigValid = await verifyHmacSha256(payloadB64, sig, secret);
  if (!isSigValid) return false;
  const parsed = decodePayload(payloadB64);
  return Boolean(parsed && parsed.role === "scanner");
}

async function isValidVendorSession(cookieValue: string | undefined): Promise<boolean> {
  if (!cookieValue || !cookieValue.includes(".")) return false;
  const [payloadB64, sig] = cookieValue.split(".");
  if (!payloadB64 || !sig) return false;
  const secret = process.env.VENDOR_SESSION_SECRET || process.env.TAB_SELF_PAY_SECRET || process.env.PAYHERO_CALLBACK_TOKEN || "goodlife_vendor_secret_salt";
  const isSigValid = await verifyHmacSha256(payloadB64, sig, secret);
  if (!isSigValid) return false;
  const parsed = decodePayload(payloadB64);
  return Boolean(parsed && parsed.vendorId);
}

// Helpers to sign
function signScannerCookie(data: any, customSecret?: string): string {
  const secret = customSecret || process.env.SCANNER_SESSION_SECRET || process.env.TAB_SELF_PAY_SECRET || process.env.PAYHERO_CALLBACK_TOKEN || "goodlife_scanner_secret_salt";
  const payloadB64 = Buffer.from(JSON.stringify(data)).toString("base64url");
  const sig = createHmac("sha256", secret).update(payloadB64).digest("base64url");
  return `${payloadB64}.${sig}`;
}

function signVendorCookie(data: any, customSecret?: string): string {
  const secret = customSecret || process.env.VENDOR_SESSION_SECRET || process.env.TAB_SELF_PAY_SECRET || process.env.PAYHERO_CALLBACK_TOKEN || "goodlife_vendor_secret_salt";
  const payloadB64 = Buffer.from(JSON.stringify(data)).toString("base64url");
  const sig = createHmac("sha256", secret).update(payloadB64).digest("base64url");
  return `${payloadB64}.${sig}`;
}

let pass = 0;
const failures: string[] = [];

function check(name: string, condition: boolean) {
  if (condition) {
    pass++;
    console.log(`  âœ“ ${name}`);
  } else {
    failures.push(name);
    console.error(`  âœ— FAIL: ${name}`);
  }
}

async function runTests() {
  console.log("Testing Scanner & Vendor Session Verification...");

  // 1. Scanner tests
  check("garbage scanner cookie 'x' is rejected", (await isValidScannerSession("x")) === false);
  check("undefined scanner cookie is rejected", (await isValidScannerSession(undefined)) === false);
  check("empty scanner cookie is rejected", (await isValidScannerSession("")) === false);
  check("cookie without period is rejected", (await isValidScannerSession(Buffer.from(JSON.stringify({ role: "scanner" })).toString("base64url"))) === false);
  check("cookie with invalid signature is rejected", (await isValidScannerSession(`${Buffer.from(JSON.stringify({ role: "scanner" })).toString("base64url")}.invalidsig`)) === false);

  const validScannerPayload = {
    role: "scanner",
    stewardName: "Main Steward",
    gateName: "Main Gate",
    eventId: 1,
    loginAt: new Date().toISOString()
  };
  const validScannerToken = signScannerCookie(validScannerPayload);
  check("validly signed scanner session is accepted", (await isValidScannerSession(validScannerToken)) === true);

  const tamperedScannerToken = `${validScannerToken.split(".")[0]}.differentsig1234567890abcdef`;
  check("tampered scanner signature is rejected", (await isValidScannerSession(tamperedScannerToken)) === false);

  const wrongRoleScannerToken = signScannerCookie({ role: "vendor", vendorId: 1 });
  check("scanner cookie with wrong role is rejected", (await isValidScannerSession(wrongRoleScannerToken)) === false);

  const scannerSignedWithWrongSecret = signScannerCookie(validScannerPayload, "completely_wrong_secret");
  check("scanner cookie signed with wrong secret is rejected", (await isValidScannerSession(scannerSignedWithWrongSecret)) === false);

  // 2. Vendor tests
  check("garbage vendor cookie 'x' is rejected", (await isValidVendorSession("x")) === false);
  check("undefined vendor cookie is rejected", (await isValidVendorSession(undefined)) === false);
  const validVendorPayload = {
    vendorId: 42,
    vendorName: "Goodlife Drinks",
    operatorId: 7,
    operatorName: "Jane Bar",
    role: "bartender"
  };
  const validVendorToken = signVendorCookie(validVendorPayload);
  check("validly signed vendor session is accepted", (await isValidVendorSession(validVendorToken)) === true);

  const tamperedVendorToken = `${validVendorToken.split(".")[0]}.differentsig1234567890abcdef`;
  check("tampered vendor signature is rejected", (await isValidVendorSession(tamperedVendorToken)) === false);

  const vendorNoIdToken = signVendorCookie({ role: "manager", operatorId: 7 });
  check("vendor session without vendorId is rejected", (await isValidVendorSession(vendorNoIdToken)) === false);

  console.log(`\n${pass} passed, ${failures.length} failed\n`);
  if (failures.length > 0) {
    process.exit(1);
  }
}

runTests();
