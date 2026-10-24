import { readFileSync } from "fs";
import { join } from "path";

let failures = 0;

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`FAIL: ${msg}`);
    failures++;
  } else {
    console.log(`PASS: ${msg}`);
  }
}

function read(...parts: string[]): string {
  return readFileSync(join(process.cwd(), ...parts), "utf8");
}

// 1. Vendor deletion is a soft delete: it hides the vendor and blocks login but
//    keeps sales/tabs/settlements for the audit trail.
const vendorRoute = read("app", "api", "admin", "vendors", "[id]", "route.ts");
assert(
  /export async function DELETE/.test(vendorRoute),
  "Vendor API exposes a DELETE handler"
);
assert(
  vendorRoute.includes("deleteVendor"),
  "Vendor DELETE uses the existing soft-delete helper"
);
assert(
  vendorRoute.includes("is_house") && vendorRoute.includes("House vendors cannot be deleted"),
  "House vendors (bar/kitchen) are protected from deletion"
);

const vendorPage = read("app", "admin", "vendors", "page.tsx");
assert(
  vendorPage.includes("handleDeleteVendor") &&
    vendorPage.includes('method: "DELETE"') &&
    vendorPage.includes("Delete Vendor"),
  "Admin vendors page offers a confirmed delete action"
);
assert(
  vendorPage.includes("disabled={Boolean(v.is_house)") ||
    vendorPage.includes("disabled={v.is_house"),
  "The delete button is disabled for house vendors"
);

// 2. A sale delete is a void, never a hard DELETE: the row is the only record
//    that money moved, and stock/tab/commission all need reversing.
const voidRoute = read("app", "api", "admin", "sales", "[saleId]", "void", "route.ts");
assert(
  voidRoute.includes("requireAdmin") &&
    voidRoute.includes("voidSale") &&
    voidRoute.includes("already voided"),
  "Admin sale-void route is authenticated, idempotent and reuses voidSale"
);
assert(
  voidRoute.includes("A reason is required"),
  "A void requires an audit reason"
);

const db = read("lib", "supabase-db.ts");
assert(
  db.includes("UPDATE vendors SET deleted_at = NOW()"),
  "Vendor deletion is a soft delete that preserves sales history"
);
assert(
  /voidSale\(saleId: string, voidedBy: number \| null, reason: string\)/.test(db),
  "voidSale accepts NULL for an admin actor (voided_by references operators)"
);
const voidFnStart = db.indexOf("export async function voidSale");
const voidFn = db.slice(voidFnStart, voidFnStart + 3500);
assert(
  voidFn.includes("payment_status = 'voided'") &&
    voidFn.includes("stock_qty = stock_qty +") &&
    voidFn.includes("balance = balance -") &&
    voidFn.includes("commission_owed = commission_owed -"),
  "Void reverses status, stock, tab balance and commission atomically"
);
assert(
  voidFn.includes("COMMIT") && voidFn.includes("ROLLBACK"),
  "Void is wrapped in a transaction so a partial reversal cannot stick"
);
assert(
  voidFn.includes("'void', $3, 'void'"),
  "Void writes a distinct tab-ledger reversal row instead of a payment"
);

const drawer = read("components", "admin", "VendorDetailDrawer.tsx");
assert(
  drawer.includes("handleVoidSale") &&
    drawer.includes("/api/admin/sales/") &&
    drawer.includes("VOIDED") &&
    drawer.includes("DELETE"),
  "Vendor audit ledger exposes a DELETE (void) action and marks voided rows"
);

// 3. Voided sales must not count toward money.
const analytics = read("app", "api", "admin", "vendors", "[id]", "analytics", "route.ts");
assert(
  analytics.includes("payment_status !== \"voided\"") &&
    analytics.includes("ps.payment_status != 'voided'"),
  "Vendor analytics excludes voided sales from totals and payment breakdowns"
);
assert(
  analytics.includes("ps.void_reason"),
  "Vendor analytics returns the void reason for the audit ledger"
);
assert(
  analytics.includes('tx.type === "void"') && analytics.includes("isVoid ? -paidAmt : paidAmt"),
  "Customer audit treats a tab void as a negative payment, not extra money paid"
);

if (failures > 0) {
  console.error(`\n${failures} test(s) failed.`);
  process.exit(1);
} else {
  console.log("\nAll admin-delete tests passed successfully.");
}
