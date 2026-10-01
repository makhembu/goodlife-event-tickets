/**
 * Checks for lib/phone.ts — the canonicalization that lets the customer audit
 * join `tickets`, `pos_split_payments` and `customer_tabs` into one person.
 *
 * Run: npx tsx tests/phone.check.ts
 *
 * No database and no environment needed. Every case here corresponds to a way
 * the same human being's number is actually stored in this codebase: the buyer
 * types one form at checkout, the till operator types another, and the tab
 * record usually carries a third.
 */

import { normalizePhone, phoneMatchKey, phonesMatch, toWhatsAppNumber } from "../lib/phone";

let passed = 0;
let failed = 0;

function check(label: string, actual: unknown, expected: unknown) {
  if (actual === expected) {
    passed++;
  } else {
    failed++;
    console.log(`  FAIL  ${label}\n        expected: ${JSON.stringify(expected)}\n        actual:   ${JSON.stringify(actual)}`);
  }
}

console.log("\nnormalizePhone — one person, many spellings");
for (const input of [
  "0712345678",
  "254712345678",
  "+254712345678",
  "00254712345678",
  "0712 345 678",
  "0712-345-678",
  "(0712) 345678",
  "+254 712 345 678",
  "712345678",
  " 0712345678 ",
]) {
  check(`normalizePhone(${JSON.stringify(input)})`, normalizePhone(input), "0712345678");
}

console.log("normalizePhone — refuses to guess");
for (const input of ["", "   ", "abc", "0712345", "07123456789", "12345", "254"]) {
  check(`normalizePhone(${JSON.stringify(input)})`, normalizePhone(input), "");
}

// Deliberately permissive about the subscriber prefix: any 10-digit national
// number is accepted, not just `07`. Kenyan mobiles are `07XXXXXXXX`, but a
// strict rule would REJECT a real number typed slightly wrong and, worse,
// would split that customer's ticket history from their tab — the exact
// failure this module exists to prevent. A near-miss match is recoverable; a
// silently missing purchase is not.
check("08-prefixed number is still accepted", normalizePhone("0812345678"), "0812345678");
check("normalizePhone(null)", normalizePhone(null), "");
check("normalizePhone(undefined)", normalizePhone(undefined), "");

console.log("\nnormalizePhone — distinct people stay distinct");
check("0712345678 !== 0722345678", phonesMatch("0712345678", "0722345678"), false);
check("different country prefix", phonesMatch("0712345678", "+254722345678"), false);

console.log("\nphonesMatch — cross-system join");
check("ticket 0712345678 vs tab +254 712 345 678", phonesMatch("0712345678", "+254 712 345 678"), true);
check("payer 254... vs tab 0712...", phonesMatch("254712345678", "0712345678"), true);
check("identical", phonesMatch("0712345678", "0712345678"), true);

// The failure mode that matters most: an unidentifiable number must NOT match
// another unidentifiable number, or every anonymous walk-in in the festival
// collapses into one phantom customer with a fabricated combined total.
console.log("phonesMatch — blanks never match");
check("blank vs blank", phonesMatch("", ""), false);
check("null vs blank", phonesMatch(null, ""), false);
check("blank vs real", phonesMatch("", "0712345678"), false);
check("unparseable vs unparseable", phonesMatch("abc", "xyz"), false);

console.log("\ntoWhatsAppNumber — wa.me link target");
check("national", toWhatsAppNumber("0712345678"), "254712345678");
check("international", toWhatsAppNumber("+254 712 345 678"), "254712345678");
check("bare subscriber", toWhatsAppNumber("712345678"), "254712345678");
check("blank yields no link", toWhatsAppNumber(""), "");

console.log("\nphoneMatchKey");
check("matches normalizePhone", phoneMatchKey("+254712345678"), "0712345678");
check("blank", phoneMatchKey(""), "");

console.log(`\n${passed} passing, ${failed} failing\n`);
if (failed > 0) process.exit(1);