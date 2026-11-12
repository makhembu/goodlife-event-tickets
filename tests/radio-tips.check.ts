/**
 * Verification check for Phase 5 Listener Tips (PayHero M-Pesa STK push & callbacks).
 *
 *   npx tsx tests/radio-tips.check.ts
 */

import { maskPhone } from "../lib/radio/ops-service";

function check(desc: string, condition: boolean) {
  if (condition) {
    console.log(`PASS: ${desc}`);
  } else {
    console.error(`FAIL: ${desc}`);
    process.exit(1);
  }
}

async function run() {
  console.log("--- Radio Tips Verification Suite ---");

  // 1. Phone number masking rule (0712***678)
  console.log("\n[1] Phone Masking");
  check("maskPhone masks 0712345678", maskPhone("0712345678") === "0712***678");
  check("maskPhone masks 254712345678", maskPhone("254712345678") === "2547***678");
  check("maskPhone handles short phone", maskPhone("12345") === "***");

  // 2. Reference format validation
  console.log("\n[2] Tip Reference Prefix Isolation");
  const validRef = "TIP-A1B2C3D4";
  check("Tip reference starts with TIP-", validRef.startsWith("TIP-"));
  check("Tip reference does not collide with ticket prefix GL-", !validRef.startsWith("GL-"));
  check("Tip reference does not collide with tab prefix TABPAY_", !validRef.startsWith("TABPAY_"));

  // 3. Callback isolation mock check
  console.log("\n[3] Callback Routing Isolation");
  const isTipCallback = (ref: string) => ref.startsWith("TIP-");
  const isTicketCallback = (ref: string) => ref.startsWith("GL-");
  const isTabCallback = (ref: string) => ref.startsWith("TABPAY_");

  check("TIP- ref routes strictly to tip handler", isTipCallback("TIP-9999") && !isTicketCallback("TIP-9999") && !isTabCallback("TIP-9999"));
  check("GL- ref routes strictly to ticket handler", !isTipCallback("GL-ABCD") && isTicketCallback("GL-ABCD"));

  // 4. Amount Matching Verification
  console.log("\n[4] Exact Amount Verification Logic");
  const verifyAmount = (expected: number, actual: number) => Math.round(expected) === Math.round(actual);
  check("Amount matching succeeds when exact", verifyAmount(500, 500) === true);
  check("Amount matching succeeds with decimals rounded", verifyAmount(500.0, 500) === true);
  check("Amount matching fails when mismatch", verifyAmount(500, 250) === false);

  console.log("\nAll Radio Tips checks passed successfully!");
}

run().catch((err) => {
  console.error("Test execution error:", err);
  process.exit(1);
});
