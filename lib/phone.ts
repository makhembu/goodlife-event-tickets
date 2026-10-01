/**
 * Kenyan phone normalization for cross-system customer matching.
 *
 * WHY THIS EXISTS
 * ---------------
 * The customer audit used to treat a phone number as an opaque string, so the
 * same human being appeared as up to four different customers depending on
 * which system recorded them:
 *
 *   tickets.phone_number            "0712345678"   (PayHero, as typed by the buyer)
 *   pos_split_payments.payer_phone  "+254 712 345 678"
 *   customer_tabs.customer_phone    "254712345678"
 *   tickets.whatsapp_number         "0712 345 678"
 *
 * A single customer's tab balance and their POS spend would not join to their
 * ticket purchase, which is exactly how "BALANCE DUE" managed to read KES 0
 * for somebody with an open tab. The fix is to compare numbers in ONE
 * canonical form rather than as strings.
 *
 * CANONICAL FORM
 * --------------
 * National format, `07XXXXXXXX` — the form a Kenyan would read on a receipt.
 * Everything else (`2547XXXXXXXX`, `+254...`, `00254...`, spaced, dashed,
 * parenthesised) collapses onto it. `normalizePhone` returns "" for input it
 * cannot confidently interpret, and callers must treat that as "unknown", not
 * as a distinct value: two blanks must never be treated as a match, or every
 * unidentified walk-in would collapse into one phantom customer.
 */

/** Kenyan country calling code. */
const COUNTRY_CODE = "254";

/**
 * Reduce any user-typed Kenyan number to `07XXXXXXXX`, or "" if we cannot
 * make sense of it.
 *
 * Accepts, and treats as identical:
 *   "0712345678", "254712345678", "+254712345678", "00254712345678",
 *   "0712 345 678", "0712-345-678", "(0712) 345678"
 *
 * Returns "" for: empty input, letters, wrong-length numbers, and short
 * landline/USSD codes. A wrong guess here silently splits one customer's
 * history in two, so we decline rather than guess.
 */
export function normalizePhone(raw: string | null | undefined): string {
  if (raw === null || raw === undefined) return "";

  // Strip spaces, dashes, dots, brackets and a leading "+", keeping digits.
  // `replace(/[^\d]/g, "")` also swallows a leading "+", so "+254..." and
  // "254..." arrive here identically — which is the point.
  let digits = String(raw).replace(/\D/g, "");

  // International access prefix: 00254712345678 -> 254712345678
  if (digits.startsWith("00")) {
    digits = digits.slice(2);
  }

  // Full international: 254712345678 (12) or 2547123456 (11, 9-digit national)
  if (digits.startsWith(COUNTRY_CODE)) {
    const rest = digits.slice(COUNTRY_CODE.length);
    if (rest.length === 9) return `0${rest}`;       // 254 + 9  -> 07XXXXXXXX
    if (rest.length === 10) return rest;             // 254 + 0 + 9 -> 0XXXXXXXXX
    return "";
  }

  // National with leading zero: 0712345678 (10)
  if (digits.length === 10 && digits.startsWith("0")) {
    return digits;
  }

  // National without the trunk zero: 712345678 (9). Operators and pasted
  // spreadsheets routinely drop it.
  if (digits.length === 9 && digits.startsWith("7")) {
    return `0${digits}`;
  }

  return "";
}

/**
 * A key suitable for equality tests between two records from different
 * systems. Returns "" when the number is unusable.
 *
 * Use this — never the raw string — when deciding whether a ticket purchase
 * and a tab belong to the same person. Two empty keys are NOT equal; compare
 * with `key !== ""` first, as `matchingKeys()` does below.
 */
export function phoneMatchKey(raw: string | null | undefined): string {
  return normalizePhone(raw);
}

/**
 * Do two independently-entered numbers refer to the same person?
 *
 * False when either side is blank: an unidentified walk-in and an unticketed
 * tab-holder are not thereby the same customer, and treating "" as a wildcard
 * would merge every anonymous cash sale in the festival into one record.
 */
export function phonesMatch(
  a: string | null | undefined,
  b: string | null | undefined
): boolean {
  const na = normalizePhone(a);
  const nb = normalizePhone(b);
  if (!na || !nb) return false;
  return na === nb;
}

/**
 * Best-effort E.164 for a `wa.me` deep link. Returns "" when unusable.
 */
export function toWhatsAppNumber(raw: string | null | undefined): string {
  const national = normalizePhone(raw);
  if (!national) return "";
  return `${COUNTRY_CODE}${national.slice(1)}`;
}