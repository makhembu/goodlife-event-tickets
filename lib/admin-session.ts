/**
 * HMAC-SHA256 Admin Session Token Management.
 * Implements specifications from RADIO-MASTER-PLAN.md §5.1 / D4 and Phase 5 RBAC.
 * Supports roles: "superadmin" | "station_manager" | "ticketing_admin" (defaults to "superadmin").
 * Fail closed: strictly rejects legacy unhashed/unauthenticated cookies.
 */

export type AdminRole = "superadmin" | "station_manager" | "ticketing_admin";

export interface AdminSessionPayload {
  role: "admin";
  adminRole?: AdminRole;
  email?: string;
  exp: number;
}

function getAdminSecret(): string | null {
  const secret = process.env.ADMIN_SESSION_SECRET?.trim() || process.env.ADMIN_PASSWORD?.trim();
  return secret || null;
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

export async function signAdminSession(
  maxAgeSec: number = 86400,
  adminRole: AdminRole = "superadmin",
  email?: string
): Promise<string> {
  const secret = getAdminSecret();
  if (!secret) {
    throw new Error("Admin session secret not configured. Fail-closed.");
  }

  const payload: AdminSessionPayload = {
    role: "admin",
    adminRole,
    email: email || "admin@goodlife.com",
    exp: Math.floor(Date.now() / 1000) + maxAgeSec,
  };
  const payloadB64 = base64UrlEncode(JSON.stringify(payload));
  const signature = await computeHmac(payloadB64, secret);
  return `${payloadB64}.${signature}`;
}

export async function getAdminSessionPayload(token: string | null | undefined): Promise<AdminSessionPayload | null> {
  if (!token) return null;

  // Legacy cookie cutover is complete: legacy "true" is rejected (fail-closed)
  if (token === "true") {
    return null;
  }

  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payloadB64, signature] = parts;

  const secret = getAdminSecret();
  if (!secret) return null;

  try {
    const expectedSig = await computeHmac(payloadB64, secret);
    if (signature !== expectedSig) return null;

    const decoded = base64UrlDecode(payloadB64);
    if (!decoded) return null;
    const data: AdminSessionPayload = JSON.parse(decoded);

    if (data.role !== "admin") return null;
    if (typeof data.exp === "number" && Math.floor(Date.now() / 1000) > data.exp) {
      return null; // Expired
    }
    return data;
  } catch {
    return null;
  }
}

export async function verifyAdminSession(token: string | null | undefined): Promise<boolean> {
  const payload = await getAdminSessionPayload(token);
  return payload !== null;
}
