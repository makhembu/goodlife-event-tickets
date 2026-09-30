import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { getWahaSession, wahaSessionId } from "@/lib/waha";

export const dynamic = "force-dynamic";

/**
 * Gateway heartbeat for the admin console.
 *
 * Same sanitization contract as `/qr`: the browser learns the normalized
 * status and the linked identity, never the gateway URL, its version payload
 * or its error strings.
 */
export async function GET() {
  const unauthorized = await requireAdmin();
  if (unauthorized) return unauthorized;

  const session = await getWahaSession();

  return NextResponse.json(
    {
      status: session.status,
      me: session.me,
      reachable: session.reachable,
      warming: session.warming,
      sessionId: wahaSessionId(),
      checkedAt: Date.now(),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
