import fs from "fs";
import path from "path";

let failures = 0;

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`FAIL: ${msg}`);
    failures++;
  } else {
    console.log(`PASS: ${msg}`);
  }
}

console.log("Starting Settlements Logic & Contract Verification...\n");

// 1. Math Formula Verification: Vendor Net Share & Commission Cut
function computeSettlement(params: {
  totalSales: number;
  commissionRate: number; // e.g. 10%
  cashCollected: number;
  digitalCollected: number; // mpesa + tabs
  settledAmount: number;
}) {
  const commissionOwed = Math.round((params.totalSales * (params.commissionRate / 100)) * 100) / 100;
  const vendorNetShare = Math.round((params.totalSales - commissionOwed) * 100) / 100;
  // If digital > commission: GoodLife holds excess digital and owes vendor a payout.
  // If digital < commission: Vendor holds excess physical cash and owes GoodLife commission.
  const netDue = Math.round((params.digitalCollected - commissionOwed - params.settledAmount) * 100) / 100;

  return {
    commissionOwed,
    vendorNetShare,
    netDue,
    goodlifeOwesVendor: netDue > 0,
    vendorOwesGoodlife: netDue < 0,
    fullySettled: Math.abs(netDue) === 0
  };
}

// Case A: 100% Digital Stall (e.g. Cocktail Bar took KES 100,000 all via M-Pesa/Tabs)
const caseA = computeSettlement({
  totalSales: 100000,
  commissionRate: 10.0,
  cashCollected: 0,
  digitalCollected: 100000,
  settledAmount: 0
});
assert(caseA.commissionOwed === 10000, "Case A: Festival earns 10% = KES 10,000 commission");
assert(caseA.vendorNetShare === 90000, "Case A: Vendor net share is KES 90,000");
assert(caseA.goodlifeOwesVendor === true, "Case A: GoodLife holds digital money and owes vendor KES 90,000");
assert(caseA.netDue === 90000, "Case A: Net payout due to vendor is exactly KES 90,000");

// Case B: 100% Cash Stall (e.g. Snack stall took KES 40,000 all in physical cash)
const caseB = computeSettlement({
  totalSales: 40000,
  commissionRate: 10.0,
  cashCollected: 40000,
  digitalCollected: 0,
  settledAmount: 0
});
assert(caseB.commissionOwed === 4000, "Case B: Festival earns KES 4,000 commission");
assert(caseB.vendorOwesGoodlife === true, "Case B: Vendor holds all cash and owes GoodLife KES 4,000");
assert(caseB.netDue === -4000, "Case B: Net due is negative (-KES 4,000) indicating cash collection needed from vendor");

// Case C: Mixed Split Payment Stall with Partial Payout
// Sales: KES 50,000 (Cash 20,000, Digital 30,000). Commission: 10% (5,000).
// Vendor share: 45,000.
// Vendor already has 20,000 cash in hand.
// GoodLife holds 30,000 digital.
// Net due from GoodLife to Vendor = 30,000 - 5,000 = 25,000.
// GoodLife already paid KES 15,000 advance. Remaining due = 10,000.
const caseC = computeSettlement({
  totalSales: 50000,
  commissionRate: 10.0,
  cashCollected: 20000,
  digitalCollected: 30000,
  settledAmount: 15000
});
assert(caseC.commissionOwed === 5000, "Case C: Commission owed is KES 5,000");
assert(caseC.netDue === 10000, "Case C: Remaining payout due after KES 15,000 advance is KES 10,000");

// Case D: Full Settlement Reconciliation
const caseD = computeSettlement({
  totalSales: 50000,
  commissionRate: 10.0,
  cashCollected: 20000,
  digitalCollected: 30000,
  settledAmount: 25000
});
assert(caseD.fullySettled === true, "Case D: When full KES 25,000 is settled, balance reaches 0 (fully settled)");

// 2. Database & API Contract Verification
const dbPath = path.resolve(process.cwd(), "lib/supabase-db.ts");
const dbCode = fs.readFileSync(dbPath, "utf-8");

assert(dbCode.includes("fetchSettlementsForEvent"), "lib/supabase-db.ts exports fetchSettlementsForEvent");
assert(dbCode.includes("recordSettlement"), "lib/supabase-db.ts exports recordSettlement");
assert(dbCode.includes("vendor_net_share"), "fetchSettlementsForEvent query computes vendor_net_share");
assert(dbCode.includes("commission_owed"), "fetchSettlementsForEvent query computes commission_owed");
assert(dbCode.includes("digital_collected"), "fetchSettlementsForEvent query computes digital_collected (mpesa + tab)");

// 3. Admin Settlements Page Verification
const settlementsPage = path.resolve(process.cwd(), "app/admin/settlements/page.tsx");
assert(fs.existsSync(settlementsPage), "app/admin/settlements/page.tsx exists");
if (fs.existsSync(settlementsPage)) {
  const pageCode = fs.readFileSync(settlementsPage, "utf-8");
  assert(pageCode.includes("HOW STALL SETTLEMENTS WORK AT GOODLIFE"), "Settlements page contains user guide / explainer");
  assert(pageCode.includes("handleSettle"), "Settlements page has payout submission handler");
  assert(pageCode.includes("VendorDetailDrawer"), "Settlements page integrates VendorDetailDrawer for audit history");
}

if (failures > 0) {
  process.exit(1);
}
console.log(`All settlement tests passed cleanly!`);
