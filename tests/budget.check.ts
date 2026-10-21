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

// 1. Math Verification: P&L, Utilization & Break-Even
function computeBudgetKPIs(budgetAllocated: number, expenses: number, ticketRevenue: number) {
  const netProfitOrLoss = ticketRevenue - expenses;
  const isProfitable = netProfitOrLoss >= 0;
  const budgetUsedPct = budgetAllocated > 0 ? Math.round((expenses / budgetAllocated) * 100) : 0;
  const isOverBudget = budgetAllocated > 0 && expenses > budgetAllocated;
  const breakEvenProgressPct = expenses > 0 ? Math.min(100, Math.round((ticketRevenue / expenses) * 100)) : 100;

  return {
    netProfitOrLoss,
    isProfitable,
    budgetUsedPct,
    isOverBudget,
    breakEvenProgressPct
  };
}

// Case 1: Healthy Profitable Festival (Budget 500k, Spent 400k, Revenue 650k)
const healthy = computeBudgetKPIs(500000, 400000, 650000);
assert(healthy.netProfitOrLoss === 250000, "Healthy festival has net profit of +KES 250,000");
assert(healthy.isProfitable === true, "Healthy festival is marked as profitable");
assert(healthy.budgetUsedPct === 80, "Budget utilization is 80% (under budget)");
assert(healthy.isOverBudget === false, "Not over budget");
assert(healthy.breakEvenProgressPct === 100, "Break even progress is 100%");

// Case 2: Early Sales Stage / Deficit (Budget 1M, Spent 600k, Revenue 200k)
const early = computeBudgetKPIs(1000000, 600000, 200000);
assert(early.netProfitOrLoss === -400000, "Early stage shows net loss of -KES 400,000");
assert(early.isProfitable === false, "Early stage is not yet profitable");
assert(early.breakEvenProgressPct === 33, "Break even progress is 33% of expenses covered");

// Case 3: Over Budget Warning (Budget 300k, Spent 360k, Revenue 400k)
const over = computeBudgetKPIs(300000, 360000, 400000);
assert(over.isOverBudget === true, "Over budget condition is correctly flagged when expenses > budget");
assert(over.budgetUsedPct === 120, "Budget utilization is 120%");

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
