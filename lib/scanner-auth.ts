import { NextRequest, NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/admin-session";

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

async function verifyHmacSha256(data: string, sigB64Url: string, secret: string): Promise<boolean> {
  try {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      enc.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );
    const base64 = sigB64Url.replace(/-/g, "+").replace(/_/g, "/");
    const padLen = (4 - (base64.length % 4)) % 4;
    const padded = base64 + "=".repeat(padLen);
    const binary = atob(padded);
    const sigBytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      sigBytes[i] = binary.charCodeAt(i);
    }
    return await crypto.subtle.verify("HMAC", key, sigBytes, enc.encode(data));
  } catch {
    return false;
  }
}

export async function isValidScannerSession(cookieValue: string | undefined | null): Promise<boolean> {
  if (!cookieValue) return false;
  if (!cookieValue.includes(".")) return false;
  const [payloadB64, sig] = cookieValue.split(".");
  if (!payloadB64 || !sig) return false;
  const secret =
    process.env.SCANNER_SESSION_SECRET?.trim() ||
    process.env.TAB_SELF_PAY_SECRET?.trim() ||
    process.env.PAYHERO_CALLBACK_TOKEN?.trim();
  if (!secret) return false; // Fail closed: strictly no hardcoded salt
  const isSigValid = await verifyHmacSha256(payloadB64, sig, secret);
  if (!isSigValid) return false;
  const decoded = base64UrlDecode(payloadB64);
  if (!decoded) return false;
  try {
    const parsed = JSON.parse(decoded);
    if (!parsed || parsed.role !== "scanner") return false;
    if (typeof parsed.exp === "number" && Math.floor(Date.now() / 1000) > parsed.exp) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Gate scanner endpoints guard:
 * Accepts valid scanner session OR admin superuser session.
 */
export async function requireScannerOrAdmin(request: NextRequest): Promise<NextResponse | null> {
  const adminCookie = request.cookies.get("goodlife_admin_session")?.value;
  if (await verifyAdminSession(adminCookie)) {
    return null;
  }
  const scannerCookie = request.cookies.get("goodlife_scanner_session")?.value;
  if (await isValidScannerSession(scannerCookie)) {
    return null;
  }
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
