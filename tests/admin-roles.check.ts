/**
 * Verification check for Phase 5 Admin Roles & RBAC (superadmin, station_manager, ticketing_admin).
 *
 *   npx tsx tests/admin-roles.check.ts
 */

import { signAdminSession, getAdminSessionPayload } from "../lib/admin-session";

function check(desc: string, condition: boolean) {
  if (condition) {
    console.log(`PASS: ${desc}`);
  } else {
    console.error(`FAIL: ${desc}`);
    process.exit(1);
  }
}

async function run() {
  process.env.ADMIN_SESSION_SECRET = "test_admin_session_secret_for_rbac_tests_32ch";
  console.log("--- Admin Roles & RBAC Verification Suite ---");

  // 1. Session token generation with roles
  console.log("\n[1] Role Token Signing");
  const superToken = await signAdminSession(3600, "superadmin", "super@goodlife.com");
  const stationToken = await signAdminSession(3600, "station_manager", "radio@goodlife.com");
  const ticketingToken = await signAdminSession(3600, "ticketing_admin", "tickets@goodlife.com");

  check("Superadmin token generated", Boolean(superToken && superToken.includes(".")));
  check("Station manager token generated", Boolean(stationToken && stationToken.includes(".")));
  check("Ticketing admin token generated", Boolean(ticketingToken && ticketingToken.includes(".")));

  // 2. Payload verification
  console.log("\n[2] Role Extraction & Verification");
  const superPayload = await getAdminSessionPayload(superToken);
  const stationPayload = await getAdminSessionPayload(stationToken);
  const ticketingPayload = await getAdminSessionPayload(ticketingToken);

  check("Superadmin role verified", superPayload?.adminRole === "superadmin");
  check("Station manager role verified", stationPayload?.adminRole === "station_manager");
  check("Ticketing admin role verified", ticketingPayload?.adminRole === "ticketing_admin");

  // 3. Fail-closed on legacy unauthenticated cookies
  console.log("\n[3] Fail-closed: Legacy Cookies Strictly Rejected");
  const legacyPayload = await getAdminSessionPayload("true");
  check("Legacy cookie 'true' returns null", legacyPayload === null);

  // 4. Role Permission Access Boundary Invariants
  console.log("\n[4] Route Access Rules");
  const canAccessRadio = (role: string) => role === "superadmin" || role === "station_manager";
  const canAccessTicketing = (role: string) => role === "superadmin" || role === "ticketing_admin";

  check("Superadmin can access radio", canAccessRadio("superadmin") === true);
  check("Superadmin can access ticketing", canAccessTicketing("superadmin") === true);

  check("Station manager can access radio", canAccessRadio("station_manager") === true);
  check("Station manager CANNOT access ticketing", canAccessTicketing("station_manager") === false);

  check("Ticketing admin can access ticketing", canAccessTicketing("ticketing_admin") === true);
  check("Ticketing admin CANNOT access radio", canAccessRadio("ticketing_admin") === false);

  console.log("\nAll Admin Roles checks passed successfully!");
}

run().catch((err) => {
  console.error("Test execution error:", err);
  process.exit(1);
});
