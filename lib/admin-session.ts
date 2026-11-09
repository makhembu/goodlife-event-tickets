/**
 * HMAC-SHA256 Admin Session Token Management.
 * Implements specifications from RADIO-MASTER-PLAN.md §5.1 / D4.
 * Dual-accepts signed tokens and legacy session cookies during migration window.
 */

const ADMIN_SECRET =
  process.env.ADMIN_SESSION_SECRET ||
  process.env.ADMIN_PASSWORD ||
  "goodlife_admin_secret_fallback_salt";

const ALLOW_LEGACY_ADMIN_COOKIE =
  process.env.ALLOW_LEGACY_ADMIN_COOKIE !== "false"; // Default true for 24h dual-accept

function base64UrlEncode(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(str: string): string | null {
  try {
    const base64 = str.replace(/-/g, "+").replace(/_/g, "/");
    const padLen = (4 - (base64.length % 4)) % 4;
    const padded = base64 + "=".repeat(padLen);
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

async function computeHmac(data: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sigBuffer = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  const bytes = new Uint8Array(sigBuffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function signAdminSession(maxAgeSec: number = 86400): Promise<string> {
  const payload = JSON.stringify({
    role: "admin",
    exp: Math.floor(Date.now() / 1000) + maxAgeSec,
  });
  const payloadB64 = base64UrlEncode(payload);
  const signature = await computeHmac(payloadB64, ADMIN_SECRET);
  return `${payloadB64}.${signature}`;
}

export async function verifyAdminSession(token: string | null | undefined): Promise<boolean> {
  if (!token) return false;

  // 1. Dual-accept legacy "true" cookie during migration window
  if (process.env.ALLOW_LEGACY_ADMIN_COOKIE !== "false" && token === "true") {
    return true;
  }

  // 2. Verify signed token: payload.signature
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const [payloadB64, signature] = parts;

  try {
    const expectedSig = await computeHmac(payloadB64, ADMIN_SECRET);
    if (signature !== expectedSig) return false;

    const decoded = base64UrlDecode(payloadB64);
    if (!decoded) return false;
    const data = JSON.parse(decoded);

    if (data.role !== "admin") return false;
    if (typeof data.exp === "number" && Math.floor(Date.now() / 1000) > data.exp) {
      return false; // Expired
    }
    return true;
  } catch {
    return false;
  }
}
