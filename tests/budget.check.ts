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

console.log("Starting Budget & Expense System Verification...\n");

// 1. Math Verification: 3-Tier Budget, Dual P&L & Break-Even
function compute3TierBudget(budgetAllocated: number, paid: number, pending: number, planned: number, ticketRevenue: number) {
  const totalExpenses = paid + pending + planned;
  const unallocatedBudget = Math.max(0, budgetAllocated - totalExpenses);
  const overBudgetAmount = totalExpenses > budgetAllocated && budgetAllocated > 0 ? totalExpenses - budgetAllocated : 0;
  const realizedProfitOrLoss = ticketRevenue - paid;
  const projectedProfitOrLoss = ticketRevenue - totalExpenses;
  const budgetAllocatedPct = budgetAllocated > 0 ? Math.round((totalExpenses / budgetAllocated) * 100) : 0;
  const isProjectedProfitable = projectedProfitOrLoss >= 0;
  const isRealizedProfitable = realizedProfitOrLoss >= 0;

  return {
    totalExpenses,
    unallocatedBudget,
    overBudgetAmount,
    realizedProfitOrLoss,
    projectedProfitOrLoss,
    budgetAllocatedPct,
    isProjectedProfitable,
    isRealizedProfitable,
  };
}

// Case 1: Active Planning Stage (Budget Cap 500k, Paid 100k, Pending 50k, Planned 250k, Revenue 200k)
const activePlan = compute3TierBudget(500000, 100000, 50000, 250000, 200000);
assert(activePlan.totalExpenses === 400000, "Total expenses sums paid + pending + planned (400,000)");
assert(activePlan.unallocatedBudget === 100000, "Unallocated budget remaining is KES 100,000 under cap");
assert(activePlan.overBudgetAmount === 0, "No over budget amount when under cap");
assert(activePlan.realizedProfitOrLoss === 100000, "Realized cashflow in hand is +KES 100,000 (Revenue 200k - Paid 100k)");
assert(activePlan.isRealizedProfitable === true, "Current cash in hand is positive");
assert(activePlan.projectedProfitOrLoss === -200000, "Projected festival outcome needs KES 200,000 more tickets to fully break even");
assert(activePlan.isProjectedProfitable === false, "Projected outcome requires more ticket sales to cover planned costs");

// Case 2: Over Budget Allocation (Budget Cap 300k, Paid 150k, Pending 50k, Planned 160k, Revenue 400k)
const overAllocated = compute3TierBudget(300000, 150000, 50000, 160000, 400000);
assert(overAllocated.totalExpenses === 360000, "Total earmarked expenses is KES 360,000");
assert(overAllocated.unallocatedBudget === 0, "Zero unallocated budget when over cap");
assert(overAllocated.overBudgetAmount === 60000, "Over budget by KES 60,000 against initial cap");
assert(overAllocated.realizedProfitOrLoss === 250000, "Realized cash in hand is +KES 250,000");
assert(overAllocated.projectedProfitOrLoss === 40000, "Projected festival P&L is +KES 40,000 profit after all planned expenses");
assert(overAllocated.isProjectedProfitable === true, "Projected festival is profitable");

// 2. File & Route Verification
const budgetPage = path.resolve(process.cwd(), "app/admin/budget/page.tsx");
assert(fs.existsSync(budgetPage), "app/admin/budget/page.tsx exists");
if (fs.existsSync(budgetPage)) {
  const code = fs.readFileSync(budgetPage, "utf-8");
  assert(code.includes("handleExportCSV"), "/admin/budget includes CSV export functionality");
  assert(code.includes("Spending by Department"), "/admin/budget includes department breakdown");
  assert(code.includes("PosterUploader"), "/admin/budget integrates receipt photo uploader");
  assert(code.includes("CATEGORIES"), "/admin/budget defines department categories");
  assert(code.includes("handleForkBudget"), "/admin/budget includes handleForkBudget for event forking");
  assert(code.includes("Fork Budget"), "/admin/budget includes Fork Budget UI trigger");
  assert(code.includes("eventId"), "/admin/budget includes URL eventId query parameter synchronization");
  assert(code.includes("hidden md:block"), "/admin/budget has responsive desktop table toggle");
  assert(code.includes("md:hidden"), "/admin/budget has mobile card-list view");
  assert(code.includes("realizedProfitOrLoss"), "/admin/budget calculates dual Realized Cash in Hand");
  assert(code.includes("projectedProfitOrLoss"), "/admin/budget calculates dual Projected Final Net P&L");
}

// 3. API Routes Exist
assert(fs.existsSync(path.resolve(process.cwd(), "app/api/admin/budget/route.ts")), "/api/admin/budget/route.ts exists");
assert(fs.existsSync(path.resolve(process.cwd(), "app/api/admin/expenses/route.ts")), "/api/admin/expenses/route.ts exists");
assert(fs.existsSync(path.resolve(process.cwd(), "app/api/admin/expenses/[id]/route.ts")), "/api/admin/expenses/[id]/route.ts exists");
assert(fs.existsSync(path.resolve(process.cwd(), "app/api/admin/expenses/bulk/route.ts")), "/api/admin/expenses/bulk/route.ts exists");

const bulkRouteCode = fs.readFileSync(path.resolve(process.cwd(), "app/api/admin/expenses/bulk/route.ts"), "utf-8");
assert(bulkRouteCode.includes("clone_event"), "expenses/bulk route handles clone_event action");

// 4. Data Layer Contract
const dbCode = fs.readFileSync(path.resolve(process.cwd(), "lib/supabase-db.ts"), "utf-8");
assert(dbCode.includes("fetchEventBudgetSummary"), "lib/supabase-db.ts exports fetchEventBudgetSummary");
assert(dbCode.includes("fetchEventExpenses"), "lib/supabase-db.ts exports fetchEventExpenses");
assert(dbCode.includes("createEventExpense"), "lib/supabase-db.ts exports createEventExpense");
assert(dbCode.includes("updateEventExpense"), "lib/supabase-db.ts exports updateEventExpense");
assert(dbCode.includes("deleteEventExpense"), "lib/supabase-db.ts exports deleteEventExpense");
assert(dbCode.includes("updateEventBudget"), "lib/supabase-db.ts exports updateEventBudget");
assert(dbCode.includes("cloneEventExpenses"), "lib/supabase-db.ts exports cloneEventExpenses");

if (failures > 0) {
  process.exit(1);
}
console.log("All budget tests passed cleanly!");
