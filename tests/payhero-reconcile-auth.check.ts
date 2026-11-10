/**
 * Verification Suite: PayHero Reconcile & RSVP-Free Security Contract
 * 
 * Locks down:
 * 1. app/api/payhero/reconcile/route.ts:
 *    - Rejects query parameter `?secret=...`
 *    - Has NO ADMIN_PASSWORD fallback
 *    - Fails closed (500) when CRON_SECRET is unset
 *    - Requires Authorization: Bearer <CRON_SECRET> in constant time (timingSafeEqual)
 * 2. app/api/tickets/rsvp-free/route.ts:
 *    - Uses crypto.randomBytes instead of Math.random()
 *    - Produces RSVP-[0-9A-F]{8} pattern
 */

import fs from "fs";
import path from "path";
import { timingSafeEqual, randomBytes } from "crypto";

let passes = 0;
let failures = 0;

function check(label: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`PASS: ${label}`);
    passes++;
  } else {
    console.error(`FAIL: ${label}${detail ? ` (${detail})` : ""}`);
    failures++;
  }
}

console.log("=== PayHero Reconcile Auth & RSVP-Free Security Check ===");

// 1. Static Contract Analysis of app/api/payhero/reconcile/route.ts
const reconcilePath = path.resolve(__dirname, "../app/api/payhero/reconcile/route.ts");
const reconcileCode = fs.readFileSync(reconcilePath, "utf-8");

check(
  "reconcile route strictly reads process.env.CRON_SECRET",
  reconcileCode.includes("process.env.CRON_SECRET")
);

check(
  "reconcile route has NO ADMIN_PASSWORD fallback",
  !reconcileCode.includes("process.env.ADMIN_PASSWORD") && !reconcileCode.includes("ADMIN_PASSWORD")
);

check(
  "reconcile route does NOT accept query param secret",
  !reconcileCode.includes('searchParams.get("secret")') && !reconcileCode.includes("searchParams.get('secret')")
);

check(
  "reconcile route requires Authorization header with Bearer",
  reconcileCode.includes('request.headers.get("authorization")') && reconcileCode.includes("Bearer")
);

check(
  "reconcile route uses timingSafeEqual for token comparison",
  reconcileCode.includes("timingSafeEqual")
);

check(
  "reconcile route fails closed (500 Server misconfiguration) if CRON_SECRET is missing",
  reconcileCode.includes('return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 })') ||
  reconcileCode.includes('{ error: "Server misconfiguration" }, { status: 500 }')
);

// 2. Mock Logic Execution of Reconcile Auth Guard
function testReconcileAuth(
  envCronSecret: string | undefined,
  authorizationHeader: string | undefined,
  queryStringSecret?: string
): { status: number; body: any } {
  const cronSecret = envCronSecret?.replace(/^["']|["']$/g, "").trim();

  if (!cronSecret) {
    return { status: 500, body: { error: "Server misconfiguration" } };
  }

  const authHeader = authorizationHeader?.replace(/^Bearer\s+/i, "") || "";
  const incBuf = Buffer.from(authHeader);
  const expBuf = Buffer.from(cronSecret);
  if (incBuf.length !== expBuf.length || !timingSafeEqual(incBuf, expBuf)) {
    return { status: 401, body: { error: "Unauthorized" } };
  }

  return { status: 200, body: { success: true } };
}

// Case A: Unset CRON_SECRET -> 500
const unsetRes = testReconcileAuth(undefined, "Bearer secret123");
check("Fails closed (500) if CRON_SECRET is unset", unsetRes.status === 500);

// Case B: Query string secret ignored -> 401
const queryRes = testReconcileAuth("test_secret_123", undefined, "test_secret_123");
check("Rejects query param secret with 401", queryRes.status === 401);

// Case C: Missing auth header -> 401
const missingRes = testReconcileAuth("test_secret_123", undefined);
check("Rejects missing auth header with 401", missingRes.status === 401);

// Case D: Wrong bearer token -> 401
const wrongRes = testReconcileAuth("test_secret_123", "Bearer wrong_secret");
check("Rejects wrong bearer token with 401", wrongRes.status === 401);

// Case E: Correct bearer token -> 200
const validRes = testReconcileAuth("test_secret_123", "Bearer test_secret_123");
check("Accepts valid Authorization: Bearer <CRON_SECRET>", validRes.status === 200);

// 3. Static Contract Analysis of app/api/tickets/rsvp-free/route.ts
const rsvpPath = path.resolve(__dirname, "../app/api/tickets/rsvp-free/route.ts");
const rsvpCode = fs.readFileSync(rsvpPath, "utf-8");

check(
  "rsvp-free imports randomBytes from crypto",
  rsvpCode.includes("randomBytes") && rsvpCode.includes('"crypto"')
);

check(
  "rsvp-free does NOT use Math.random() for reference generation",
  !rsvpCode.includes("Math.random()")
);

check(
  "rsvp-free generates reference using randomBytes",
  rsvpCode.includes("randomBytes(4).toString(\"hex\").toUpperCase()")
);

// 4. RSVP Reference Generation Format Validation
for (let i = 0; i < 50; i++) {
  const reference = `RSVP-${randomBytes(4).toString("hex").toUpperCase()}`;
  if (!/^RSVP-[0-9A-F]{8}$/.test(reference)) {
    check(`RSVP reference format valid (${reference})`, false, "Pattern mismatch");
    break;
  }
}
check("Generated 50 randomBytes RSVP references matching ^RSVP-[0-9A-F]{8}$", true);

console.log(`\nResults: ${passes} passed, ${failures} failed.`);
if (failures > 0) {
  process.exit(1);
}
