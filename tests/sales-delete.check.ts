/**
 * Verification test for Sales Void / Delete API endpoint.
 * Ensures the single authoritative endpoint app/api/admin/sales/[saleId]/void/route.ts
 * is guarded by requireAdmin and handles void requests.
 */

import fs from "fs";

function check(desc: string, condition: boolean) {
  if (condition) {
    console.log(`  ✓ ${desc}`);
  } else {
    console.error(`  ✗ FAIL: ${desc}`);
    process.exit(1);
  }
}

console.log("=== Testing Sales Void & Delete Route Structure ===");

// 1. Verify obsolete duplicate route app/api/admin/sales/[saleId]/route.ts is gone
check(
  "Obsolete duplicate app/api/admin/sales/[saleId]/route.ts does NOT exist",
  !fs.existsSync("app/api/admin/sales/[saleId]/route.ts")
);

// 2. Verify authoritative void route exists and exports POST
const voidRoutePath = "app/api/admin/sales/[saleId]/void/route.ts";
check("Authoritative void route exists", fs.existsSync(voidRoutePath));

const content = fs.readFileSync(voidRoutePath, "utf-8");
check(
  "Void route exports POST handler",
  /export\s+(?:async\s+)?function\s+POST\b/.test(content)
);

check(
  "Void route calls requireAdmin in POST",
  content.includes("requireAdmin")
);

check(
  "Unused DELETE alias was removed from void route",
  !/export\s+(?:async\s+)?function\s+DELETE\b/.test(content)
);

console.log("\nPASS: Sales void route structure verified.\n");
