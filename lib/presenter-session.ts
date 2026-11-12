import bcrypt from "bcryptjs";

export const PRESENTER_COOKIE_NAME = "goodlife_presenter_session";

export interface PresenterSessionPayload {
  role: "presenter";
  presenterId: number;
  slug: string;
  email: string;
  djName: string;
  mustChangePassword: boolean;
  exp: number;
}

function getPresenterSecret(): string | null {
  const secret = process.env.PRESENTER_SESSION_SECRET?.trim();
  if (!secret) return null; // Fail closed: strictly no hardcoded fallback
  return secret;
}

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

/**
 * Signs a presenter session cookie.
 * Fails closed with an error if PRESENTER_SESSION_SECRET is not configured.
 */
export async function signPresenterSession(
  presenter: {
    id: number;
    slug: string;
    email: string;
    dj_name: string;
    must_change_password?: boolean;
  },
  maxAgeSec: number = 86400 * 7 // 7 days session
): Promise<string> {
  const secret = getPresenterSecret();
  if (!secret) {
    throw new Error("PRESENTER_SESSION_SECRET is not configured on the server (fail-closed)");
  }

  const payload: PresenterSessionPayload = {
    role: "presenter",
    presenterId: presenter.id,
    slug: presenter.slug,
    email: presenter.email,
    djName: presenter.dj_name,
    mustChangePassword: Boolean(presenter.must_change_password),
    exp: Math.floor(Date.now() / 1000) + maxAgeSec,
  };

  const payloadB64 = base64UrlEncode(JSON.stringify(payload));
  const signature = await computeHmac(payloadB64, secret);
  return `${payloadB64}.${signature}`;
}

/**
 * Verifies a presenter session cookie.
 * Returns decoded payload if valid and unexpired; null otherwise.
 */
export async function verifyPresenterSession(
  token: string | null | undefined
): Promise<PresenterSessionPayload | null> {
  if (!token || !token.includes(".")) return null;

  const secret = getPresenterSecret();
  if (!secret) return null; // Fail closed

  const [payloadB64, signature] = token.split(".");
  if (!payloadB64 || !signature) return null;

  try {
    const expectedSig = await computeHmac(payloadB64, secret);
    if (signature !== expectedSig) return null;

    const jsonStr = base64UrlDecode(payloadB64);
    if (!jsonStr) return null;

    const payload = JSON.parse(jsonStr) as PresenterSessionPayload;
    if (!payload || payload.role !== "presenter" || !payload.presenterId) {
      return null;
    }

    // Expiry check
    if (typeof payload.exp === "number" && Math.floor(Date.now() / 1000) > payload.exp) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

/**
 * Hashes a plaintext password with bcrypt.
 */
export async function hashPresenterPassword(password: string): Promise<string> {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
}

/**
 * Compares plaintext password against a bcrypt hash.
 */
export async function comparePresenterPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
