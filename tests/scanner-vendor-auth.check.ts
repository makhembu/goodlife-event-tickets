/**
 * Verification check for Scanner & Vendor session cookie signing and validation.
 *
 *   npx tsx tests/scanner-vendor-auth.check.ts
 */

import { createHmac, timingSafeEqual } from "crypto";

// Mirror of middleware validation functions
function isValidScannerSession(cookieValue: string | undefined): boolean {
  if (!cookieValue || !cookieValue.includes(".")) return false;
  const [payloadB64, sig] = cookieValue.split(".");
  if (!payloadB64 || !sig) return false;
  const secret = process.env.SCANNER_SESSION_SECRET || process.env.TAB_SELF_PAY_SECRET || process.env.PAYHERO_CALLBACK_TOKEN || "goodlife_scanner_secret_salt";
  const expectedSig = createHmac("sha256", secret).update(payloadB64).digest("base64url");
  if (expectedSig.length !== sig.length) return false;
  if (!timingSafeEqual(Buffer.from(expectedSig), Buffer.from(sig))) return false;
  try {
    const parsed = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
    return Boolean(parsed && parsed.role === "scanner");
  } catch {
    return false;
  }
}

function isValidVendorSession(cookieValue: string | undefined): boolean {
  if (!cookieValue || !cookieValue.includes(".")) return false;
  const [payloadB64, sig] = cookieValue.split(".");
  if (!payloadB64 || !sig) return false;
  const secret = process.env.VENDOR_SESSION_SECRET || process.env.TAB_SELF_PAY_SECRET || process.env.PAYHERO_CALLBACK_TOKEN || "goodlife_vendor_secret_salt";
  const expectedSig = createHmac("sha256", secret).update(payloadB64).digest("base64url");
  if (expectedSig.length !== sig.length) return false;
  if (!timingSafeEqual(Buffer.from(expectedSig), Buffer.from(sig))) return false;
  try {
    const parsed = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
    return Boolean(parsed && parsed.vendorId);
  } catch {
    return false;
  }
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

console.log("Testing Scanner & Vendor Session Verification...");

// 1. Scanner tests
check("garbage scanner cookie 'x' is rejected", isValidScannerSession("x") === false);
check("undefined scanner cookie is rejected", isValidScannerSession(undefined) === false);
check("empty scanner cookie is rejected", isValidScannerSession("") === false);
check("cookie without period is rejected", isValidScannerSession(Buffer.from(JSON.stringify({ role: "scanner" })).toString("base64url")) === false);
check("cookie with invalid signature is rejected", isValidScannerSession(`${Buffer.from(JSON.stringify({ role: "scanner" })).toString("base64url")}.invalidsig`) === false);

const validScannerPayload = {
  role: "scanner",
  stewardName: "Main Steward",
  gateName: "Main Gate",
  eventId: 1,
  loginAt: new Date().toISOString()
};
const validScannerToken = signScannerCookie(validScannerPayload);
check("validly signed scanner session is accepted", isValidScannerSession(validScannerToken) === true);

const tamperedScannerToken = `${validScannerToken.split(".")[0]}.differentsig1234567890abcdef`;
check("tampered scanner signature is rejected", isValidScannerSession(tamperedScannerToken) === false);

const wrongRoleScannerToken = signScannerCookie({ role: "vendor", vendorId: 1 });
check("scanner cookie with wrong role is rejected", isValidScannerSession(wrongRoleScannerToken) === false);

const scannerSignedWithWrongSecret = signScannerCookie(validScannerPayload, "completely_wrong_secret");
check("scanner cookie signed with wrong secret is rejected", isValidScannerSession(scannerSignedWithWrongSecret) === false);

// 2. Vendor tests
check("garbage vendor cookie 'x' is rejected", isValidVendorSession("x") === false);
check("undefined vendor cookie is rejected", isValidVendorSession(undefined) === false);
const validVendorPayload = {
  vendorId: 42,
  vendorName: "Goodlife Drinks",
  operatorId: 7,
  operatorName: "Jane Bar",
  role: "bartender"
};
const validVendorToken = signVendorCookie(validVendorPayload);
check("validly signed vendor session is accepted", isValidVendorSession(validVendorToken) === true);

const tamperedVendorToken = `${validVendorToken.split(".")[0]}.differentsig1234567890abcdef`;
check("tampered vendor signature is rejected", isValidVendorSession(tamperedVendorToken) === false);

const vendorNoIdToken = signVendorCookie({ role: "manager", operatorId: 7 });
check("vendor session without vendorId is rejected", isValidVendorSession(vendorNoIdToken) === false);

console.log(`\n${pass} passed, ${failures.length} failed\n`);
if (failures.length > 0) {
  process.exit(1);
}
