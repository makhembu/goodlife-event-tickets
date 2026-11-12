import { NextRequest, NextResponse } from "next/server";
import { verifyInternalMachineAuth } from "@/lib/radio/internal-auth";
import { executeSlotLifecycleTick, LifecycleTickPayload } from "@/lib/radio/slot-lifecycle";

export const dynamic = "force-dynamic";

/**
 * POST /api/internal/radio-tick
 * Periodic machine ticker invoked by the streaming daemon (every 30 seconds).
 * HMAC-signed with RADIO_BRIDGE_SECRET / GOODLIFE_RADIO_SECRET_KEY.
 *
 * Responsibilities:
 * 1. Checks no-show timeouts for scheduled slots.
 * 2. Checks live broadcast transitions when a presenter connects.
 * 3. Checks overrun cutoffs when next slot is queued.
 * 4. Checks reconnection grace timers (5 min) when a presenter drops.
 * 5. Returns active operational directives (kick_source, broadcast_mode, active_slot).
 */
export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const authErr = await verifyInternalMachineAuth(req, rawBody);
  if (authErr) return authErr;

  let payload: LifecycleTickPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const result = await executeSlotLifecycleTick(payload);
    return NextResponse.json({ ok: true, ...result });
  } catch (err: any) {
    console.error("[radio-tick] Lifecycle tick failed:", err);
    return NextResponse.json(
      { error: err.message || "Failed to execute lifecycle tick" },
      { status: 500 }
    );
  }
}
