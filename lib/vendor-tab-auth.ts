import { NextRequest, NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/admin-session";

/**
 * Validates HMAC-SHA256 signature and returns decoded vendor session payload.
 * Fail closed: requires VENDOR_SESSION_SECRET, TAB_SELF_PAY_SECRET, or PAYHERO_CALLBACK_TOKEN.
 */
export async function verifyVendorSession(cookieValue: string | undefined | null): Promise<any | null> {
  if (!cookieValue || !cookieValue.includes(".")) return null;
  const [payloadB64, sig] = cookieValue.split(".");
  if (!payloadB64 || !sig) return null;

  const secret =
    process.env.VENDOR_SESSION_SECRET?.trim() ||
    process.env.TAB_SELF_PAY_SECRET?.trim() ||
    process.env.PAYHERO_CALLBACK_TOKEN?.trim();
  if (!secret) return null; // Fail closed

  try {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      enc.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );
    const base64 = sig.replace(/-/g, "+").replace(/_/g, "/");
    const padLen = (4 - (base64.length % 4)) % 4;
    const padded = base64 + "=".repeat(padLen);
    const binary = atob(padded);
    const sigBytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      sigBytes[i] = binary.charCodeAt(i);
    }
    const isValid = await crypto.subtle.verify("HMAC", key, sigBytes, enc.encode(payloadB64));
    if (!isValid) return null;

    const payloadRaw = Buffer.from(payloadB64, "base64url").toString("utf8");
    const parsed = JSON.parse(payloadRaw);
    if (!parsed || !parsed.vendorId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export interface TabActor {
  /** null for an admin acting outside any single vendor account. */
  vendorId: number | null;
  operatorId: number | null;
  isAdmin: boolean;
}

/** The admin dashboard session. */
export async function isAdminSession(request: NextRequest): Promise<boolean> {
  const session = request.cookies.get("goodlife_admin_session")?.value;
  return await verifyAdminSession(session);
}

/** Decode and cryptographically verify the vendor session, or null when absent/unparseable. */
export async function getTabActor(request: NextRequest): Promise<TabActor | null> {
  if (await isAdminSession(request)) {
    return { vendorId: null, operatorId: null, isAdmin: true };
  }

  const sessionCookie = request.cookies.get("goodlife_vendor_session");
  if (!sessionCookie || !sessionCookie.value) return null;

  const parsed = await verifyVendorSession(sessionCookie.value);
  if (!parsed || !parsed.vendorId) return null;

  return {
    vendorId: Number(parsed.vendorId),
    operatorId: parsed.operatorId != null ? Number(parsed.operatorId) : null,
    isAdmin: false,
  };
}

/**
 * Vendor-ownership guard.
 *
 * Returns a 403 response when the actor may not touch this tab, or `null` when
 * they may. An admin passes for any vendor; a vendor operator only for their
 * own tabs. A tab with no `vendor_id` is legacy data and is left open to
 * vendors, matching the previous behaviour exactly.
 */
export function tabOwnershipGuard(
  tabVendorId: number | null | undefined,
  actor: TabActor
): NextResponse | null {
  if (actor.isAdmin) return null;
  if (tabVendorId && tabVendorId !== actor.vendorId) {
    return NextResponse.json(
      { error: "Forbidden: You cannot access tabs belonging to another vendor" },
      { status: 403 }
    );
  }
  return null;
}
