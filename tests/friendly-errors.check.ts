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
  console.log("Running Task 4: Friendly Error Messages verification...\n");

  const payheroInit = fs.readFileSync(path.join(__dirname, "../app/api/payhero/initialize/route.ts"), "utf8");
  check("PayHero route does not expose raw 'PayHero not configured' to user", 
    !payheroInit.includes('"PayHero not configured — missing PAYHERO credentials."')
  );
  check("PayHero route logs details and returns friendly message", 
    payheroInit.includes("Payments are temporarily unavailable. Try again in a few minutes or message us on WhatsApp.") &&
    payheroInit.includes("console.error(\"[PayHero Init]")
  );

  const checkoutPage = fs.readFileSync(path.join(__dirname, "../app/CheckoutClientPage.tsx"), "utf8");
  check("Checkout page replaced 'Payment initialization failed.' with friendly message", 
    !checkoutPage.includes('"Payment initialization failed."') &&
    checkoutPage.includes("Payments are temporarily unavailable. Try again in a few minutes or message us on WhatsApp.")
  );

  const adminLogin = fs.readFileSync(path.join(__dirname, "../app/api/admin/login/route.ts"), "utf8");
  check("Admin login replaced 'Server misconfiguration' with friendly message", 
    !adminLogin.includes('message: "Server misconfiguration"') &&
    adminLogin.includes("Authentication service is temporarily unavailable. Please contact the system administrator.") &&
    adminLogin.includes("console.error(\"[Admin Login]")
  );

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

runTest();
