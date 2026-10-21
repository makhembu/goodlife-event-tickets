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
  console.log("Running Task 3: Scanner Network Failure UX verification...\n");

  const scannerCode = fs.readFileSync(path.join(__dirname, "../app/scanner/page.tsx"), "utf8");

  check("Scanner defines networkError in ScannedResult interface", scannerCode.includes("networkError?: boolean;"));
  check("Scanner defines failedTicketId in ScannedResult interface", scannerCode.includes("failedTicketId?: string;"));
  check("Catch block sets networkError: true without calling triggerFeedback", 
    scannerCode.includes("networkError: true") && !scannerCode.includes("triggerFeedback(false);\n    } finally {")
  );
  check("HUD displays distinct 'NOT CONFIRMED — CHECK LOG BEFORE ADMITTING' banner", 
    scannerCode.includes("NOT CONFIRMED — CHECK LOG BEFORE ADMITTING")
  );
  check("HUD uses slate styling instead of red INVALID styling on network error", 
    scannerCode.includes("lastResult.networkError") && scannerCode.includes("bg-slate-100 text-slate-900 border-slate-700")
  );
  check("HUD renders RETRY SCAN button wired to retryTicketScan", 
    scannerCode.includes("RETRY SCAN") && scannerCode.includes("onClick={() => retryTicketScan(lastResult.failedTicketId!)}")
  );
  check("Scanner defines retryTicketScan with read-only probe before admitting",
    scannerCode.includes("const retryTicketScan = async") &&
    scannerCode.includes("ADMITTED JUST NOW")
  );

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

runTest();
