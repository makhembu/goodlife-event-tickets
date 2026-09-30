import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { restartWahaSession } from "@/lib/waha";

export const dynamic = "force-dynamic";

/**
 * Restart a crashed/failed WhatsApp session.
 *
 * Exists because the only prior recovery path was an SSH session, and the
 * console's own fallback was to tell the operator to wait 15-30 seconds for a
 * `FAILED` session that was never going to boot. Verified working against the
 * live engine on 2026-09-30: `FAILED` -> `STARTING` -> `SCAN_QR_CODE` in ~20s.
 *
 * Same sanitization contract as the rest of the console: the browser receives a
 * normalized status and an allow-listed message, never the gateway URL, its
 * credentials, or its error prose.
 *
 * Non-GET, so `middleware.ts` already requires an admin cookie; `requireAdmin()`
 * is still called so the handler is safe regardless of matcher drift.
 */
export async function POST() {
  const unauthorized = await requireAdmin();
  if (unauthorized) return unauthorized;

  const result = await restartWahaSession();

  return NextResponse.json(
    {
      ok: result.ok,
      status: result.status,
      message: result.message,
      checkedAt: Date.now(),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
