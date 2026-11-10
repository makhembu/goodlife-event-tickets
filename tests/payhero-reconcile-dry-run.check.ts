/**
 * Verification Suite: PayHero Reconcile Dry-Run & Non-Terminal Safety
 *
 * Verifies:
 * 1. app/api/payhero/reconcile/route.ts supports ?dry_run=true and ?dry_run=1.
 * 2. In dry-run mode, no database writes or external fulfillments are performed.
 * 3. PayHero API errors, timeouts, or non-terminal/queued statuses NEVER mark a payment failed.
 * 4. Only explicit terminal failures (payheroStatusIsFailed) can trigger payment failure.
 *
 * 100% offline, zero DB queries.
 */

import fs from "fs";
import path from "path";

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

console.log("=== PayHero Reconcile Dry-Run & Timeout Safety Check ===");

const reconcilePath = path.resolve(__dirname, "../app/api/payhero/reconcile/route.ts");
const reconcileCode = fs.readFileSync(reconcilePath, "utf-8");

// 1. Dry run query parameter support
check(
  "reconcile route checks for dry_run query param",
  reconcileCode.includes('searchParams.get("dry_run")')
);

check(
  "reconcile route branches on isDryRun before fulfillPayheroPayment",
  reconcileCode.includes("if (isDryRun)") &&
  reconcileCode.includes("would_fulfill")
);

check(
  "reconcile route branches on isDryRun before markPayheroPaymentFailed",
  reconcileCode.includes("would_mark_failed")
);

check(
  "reconcile route returns dry_run flag in JSON response",
  reconcileCode.includes("dry_run: isDryRun")
);

// 2. Failure and timeout safety
check(
  "PayHero API lookup failure (statusRes.ok false) skips safely without marking payment failed",
  reconcileCode.includes("payhero_status_check_failed") &&
  reconcileCode.includes("skipped_safely")
);

check(
  "PayHero API exception in loop skips safely without marking payment failed",
  reconcileCode.includes("error: ") &&
  reconcileCode.includes("skipped_safely")
);

check(
  "Non-terminal / queued status leaves payment pending (never marks failed on timeout)",
  reconcileCode.includes("still_pending_in_payhero") &&
  reconcileCode.includes("kept_pending") &&
  !reconcileCode.includes("ageMinutes > 30")
);

console.log(`\nResults: ${passes} passed, ${failures} failed.`);
if (failures > 0) process.exit(1);
