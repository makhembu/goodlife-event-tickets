/**
 * Verification test for Admin Vendor Takeover & Analytics Authentication.
 *
 *   npx tsx tests/admin-vendor-auth.check.ts
 */

import { signAdminSession, verifyAdminSession } from "../lib/admin-session";
import { getTabActor, isAdminSession } from "../lib/vendor-tab-auth";
import { NextRequest } from "next/server";

function check(desc: string, condition: boolean) {
  if (condition) {
    console.log(`  ✓ ${desc}`);
  } else {
    console.error(`  ✗ FAIL: ${desc}`);
    process.exit(1);
  }
}

async function runTests() {
  console.log("Testing Admin Session & Vendor Takeover Auth...");

  // 1. Signed session generation & verification
  const signedToken = await signAdminSession(3600);
  check("signAdminSession produces signed token with period", signedToken.includes("."));

  const isValid = await verifyAdminSession(signedToken);
  check("verifyAdminSession accepts valid signed admin token", isValid === true);

  // 2. Reject tampering
  const tamperedToken = signedToken + "bad";
  check("verifyAdminSession rejects tampered admin token", (await verifyAdminSession(tamperedToken)) === false);

  // 3. Reject invalid / missing token
  check("verifyAdminSession rejects empty token", (await verifyAdminSession("")) === false);
  check("verifyAdminSession rejects null token", (await verifyAdminSession(null)) === false);
  check("verifyAdminSession rejects random string", (await verifyAdminSession("random_cookie_value")) === false);

  // 4. Dual-accept legacy cookie
  if (process.env.ALLOW_LEGACY_ADMIN_COOKIE !== "false") {
    check("verifyAdminSession accepts legacy 'true' cookie", (await verifyAdminSession("true")) === true);
  }

  // 5. Test Mock Request with signed admin cookie in isAdminSession & getTabActor
  const mockReq = new NextRequest("http://localhost:3000/api/admin/vendors/2/analytics", {
    headers: {
      cookie: `goodlife_admin_session=${signedToken}`,
    },
  });

  const isReqAdmin = await isAdminSession(mockReq);
  check("isAdminSession recognizes signed admin session from request cookie", isReqAdmin === true);

  const actor = await getTabActor(mockReq);
  check("getTabActor recognizes admin superuser from signed admin cookie", actor !== null && actor.isAdmin === true);

  // 6. Test Mock Request with unauthenticated/tampered cookie
  const unauthReq = new NextRequest("http://localhost:3000/api/admin/vendors/2/analytics", {
    headers: {
      cookie: `goodlife_admin_session=invalid_signature`,
    },
  });

  const isUnauthAdmin = await isAdminSession(unauthReq);
  check("isAdminSession rejects invalid admin cookie signature", isUnauthAdmin === false);

  const unauthActor = await getTabActor(unauthReq);
  check("getTabActor rejects invalid admin cookie signature", unauthActor === null);

  console.log("\nPASS: All Admin Vendor Takeover Auth checks passed.\n");
}

runTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
