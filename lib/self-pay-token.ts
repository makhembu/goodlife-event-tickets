import { createHmac, timingSafeEqual } from "crypto";

/**
 * Signed self-pay link tokens.
 *
 * Public `/pay/tab/[id]` links dispatched via WhatsApp carry an HMAC-SHA256
 * token derived from the tab ID. The public API verifies the token with a
 * timing-safe comparison, so sequential/guessable tab IDs can't be probed
 * for other customers' spending ledgers, and STK pushes can't be triggered
 * for arbitrary tabs.
 *
 * Secret: TAB_SELF_PAY_SECRET env var. If unset, falls back to the PayHero
 * callback token. DATABASE_URL is intentionally excluded — using the database
 * password as a cryptographic signing key is a security anti-pattern.
 * If no secret is configured, an empty string is returned and all verification
 * calls will fail, which is safe (no forged tokens accepted).
 */

function getSecret(): string {
  return (
    process.env.TAB_SELF_PAY_SECRET ||
    process.env.PAYHERO_CALLBACK_TOKEN ||
    ""
  );
}

export function isSelfPayTokenConfigured(): boolean {
  return Boolean(process.env.TAB_SELF_PAY_SECRET || process.env.PAYHERO_INTERNAL_TOKEN);
}

/**
 * Sign a tab ID. Returns a 43-char base64url string (no padding, URL-safe).
 */
export function signSelfPayToken(tabId: number): string {
  const mac = createHmac("sha256", getSecret())
    .update(`tab:${tabId}`)
    .digest("base64url");
  return mac;
}

/**
 * Timing-safe verification of a self-pay token for a tab ID.
 */
export function verifySelfPayToken(tabId: number, token: string | null): boolean {
  if (!token || token.length < 20 || token.length > 128) {
    return false;
  }
  const expected = Buffer.from(signSelfPayToken(tabId), "utf8");
  const provided = Buffer.from(token, "utf8");
  if (expected.length !== provided.length) {
    return false;
  }
  return timingSafeEqual(expected, provided);
}

/**
 * Build an absolute self-pay URL with its token for WhatsApp dispatch.
 */
export function buildSelfPayUrl(appUrl: string, tabId: number): string {
  const base = appUrl.replace(/\/+$/, "");
  const token = signSelfPayToken(tabId);
  return `${base}/pay/tab/${tabId}?t=${token}`;
}
