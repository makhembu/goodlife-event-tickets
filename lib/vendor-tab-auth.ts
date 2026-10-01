import { NextRequest, NextResponse } from "next/server";

/**
 * Who is acting on a customer tab.
 *
 * Tabs are a vendor-side feature (`app/vendor/tabs`), and their routes were
 * gated on the `goodlife_vendor_session` cookie only. That left the ADMIN
 * customer-audit panel (`components/admin/VendorDetailDrawer.tsx`) unable to
 * act on the very balances it displayed: an admin could see a customer owed
 * KES 4,500 and had no way to record a payment, send a reminder, or settle the
 * tab without logging out of the dashboard and into a stall operator's PIN.
 *
 * The admin cookie is therefore accepted as a superuser — the same precedent
 * as `app/api/scanner/auth/route.ts`, where the master admin password is a
 * superuser bypass on a device-local session.
 *
 * Note the asymmetry with `middleware.ts`: the vendor session there is
 * HMAC-signed, whereas `goodlife_vendor_session` is only base64 JSON. So
 * `vendorId` arriving from a *request body* is always untrusted, and nothing
 * in this file should be read as validating one.
 */
export interface TabActor {
  /** null for an admin acting outside any single vendor account. */
  vendorId: number | null;
  operatorId: number | null;
  isAdmin: boolean;
}

/** The admin dashboard session. */
export function isAdminSession(request: NextRequest): boolean {
  return request.cookies.get("goodlife_admin_session")?.value === "true";
}

/** Decode the vendor session, or null when absent/unparseable. */
export function getTabActor(request: NextRequest): TabActor | null {
  if (isAdminSession(request)) {
    return { vendorId: null, operatorId: null, isAdmin: true };
  }

  const sessionCookie = request.cookies.get("goodlife_vendor_session");
  if (!sessionCookie || !sessionCookie.value) return null;

  try {
    const raw = sessionCookie.value.includes(".")
      ? sessionCookie.value.split(".")[0]
      : sessionCookie.value;
    let parsed: any;
    try {
      parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    } catch {
      parsed = JSON.parse(atob(raw));
    }
    if (!parsed || !parsed.vendorId) return null;
    return {
      vendorId: Number(parsed.vendorId),
      operatorId: parsed.operatorId != null ? Number(parsed.operatorId) : null,
      isAdmin: false
    };
  } catch {
    return null;
  }
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
      { success: false, message: "Forbidden" },
      { status: 403 }
    );
  }
  return null;
}