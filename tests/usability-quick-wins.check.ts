import assert from "assert";
import fs from "fs";
import path from "path";

let pass = 0;
let fail = 0;

function check(name: string, condition: boolean) {
  if (condition) {
    pass++;
    console.log(`PASS: ${name}`);
  } else {
    fail++;
    console.error(`FAIL: ${name}`);
  }
}

function runTest() {
  console.log("Running Quick Wins & Usability Verification Check...\n");

  const scannerCode = fs.readFileSync(path.join(__dirname, "../app/scanner/page.tsx"), "utf8");
  const loginCode = fs.readFileSync(path.join(__dirname, "../app/login/page.tsx"), "utf8");
  const adminLoginRoute = fs.readFileSync(path.join(__dirname, "../app/api/admin/login/route.ts"), "utf8");
  const sellCode = fs.readFileSync(path.join(__dirname, "../app/vendor/sell/page.tsx"), "utf8");

  // 1. Sticky scanner rejections (ISS-02): auto-dismiss timer MUST ONLY trigger on data.success
  check(
    "Scanner auto-dismiss countdown only starts when data.success is true",
    scannerCode.includes("if (data.success) {") &&
    scannerCode.includes("autoDismissTimerRef.current = setInterval") &&
    scannerCode.includes("} else {\n        setAutoDismissCountdown(null);")
  );

  check(
    "Scanner shows NEXT TICKET button that works unconditionally when result is visible",
    scannerCode.includes("onClick={dismissHUD}") &&
    scannerCode.includes("NEXT TICKET")
  );

  // 2. Admin Login (ISS-03): single password/key input, no fake email confusion
  check(
    "Admin login page has Master Key or Password input without email input field",
    !loginCode.includes('type="email"') &&
    loginCode.includes('type="password"') &&
    (loginCode.includes("admin@goodlife.com") || loginCode.includes("MASTER ACCESS KEY") || loginCode.includes("ADMIN PASSWORD"))
  );

  check(
    "Admin login API accepts request with optional or defaulted email",
    adminLoginRoute.includes("admin@goodlife.com")
  );

  // 3. Category touch targets (ISS-06): minimum 44px touch friendly height on catalog buttons
  check(
    "POS Category pills have touch-friendly height (min-h-[44px] or py-2.5 on category buttons)",
    sellCode.includes("min-h-[44px]") || (sellCode.includes("py-2.5 text-xs") && sellCode.includes("setSelectedCategory"))
  );

  // 4. Cart wipe protection (ISS-07): 2-step confirmation or undo
  check(
    "POS Cart has clear confirmation before emptying active items",
    sellCode.includes("confirmClear") || sellCode.includes("CONFIRM CLEAR") || sellCode.includes("Clear Cart?")
  );

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

runTest();
