import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { getWahaQr, getWahaSession, wahaSessionId, type WahaStatus } from "@/lib/waha";

export const dynamic = "force-dynamic";

/**
 * Pairing QR for the admin gateway console.
 *
 * Always answers HTTP 200 with a normalized
 * `{ status, me, qrRaw, qrDataUrl, failed }` body (401 when unauthenticated).
 * WAHA statuses are collapsed into STARTING / SCAN_QR_CODE / CONNECTED /
 * OFFLINE, and WAHA's own error text is never forwarded — the base URL, API key
 * and engine messages stay server side.
 */
export async function GET() {
  const unauthorized = await requireAdmin();
  if (unauthorized) return unauthorized;

  const session = await getWahaSession();

  // `FAILED` is only a reporting state for the console; the normalized
  // `WahaStatus` enum deliberately stops at OFFLINE so no other caller can
  // mistake a crash for a stopped session.
  let status: WahaStatus | "FAILED" = session.status;
  let qrRaw: string | null = null;
  let qrDataUrl: string | null = null;

  // A crashed session reports OFFLINE, which on its own is indistinguishable
  // from "stopped" and left the console telling the operator to wait for a boot
  // that would never happen. `failed` lets the page offer a Restart instead.
  if (session.failed) {
    status = "FAILED";
  } else if (session.status === "SCAN_QR_CODE") {
    const qr = await getWahaQr();
    qrRaw = qr.raw;
    qrDataUrl = qr.dataUrl;

    // WAHA reports SCAN_QR_CODE a moment before the code is actually
    // rendered. Treat a missing payload as still booting so the UI shows the
    // warming state rather than an empty frame.
    if (!qrRaw && !qrDataUrl) status = "STARTING";
  }

  return NextResponse.json(
    {
      status,
      me: session.me,
      qrRaw,
      qrDataUrl,
      failed: session.failed,
      sessionId: wahaSessionId(),
      checkedAt: Date.now(),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
