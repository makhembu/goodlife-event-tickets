import { NextRequest, NextResponse } from "next/server";
import { recordListenerHeartbeat, removeListenerSession, getActiveListenersCount } from "@/lib/radio/listener-tracker";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const sessionId = body?.sessionId || body?.session_id;

    if (!sessionId) {
      return NextResponse.json({ ok: false, error: "Missing sessionId" }, { status: 400 });
    }

    const action = body?.action || "ping";
    const clientType = body?.client === "studio" ? "studio" : "listener";

    if (action === "leave") {
      await removeListenerSession(sessionId);
      const count = await getActiveListenersCount();
      return NextResponse.json({ ok: true, action: "leave", listeners_count: count });
    }

    const res = await recordListenerHeartbeat(sessionId, clientType);
    return NextResponse.json({
      ok: res.success,
      action: "ping",
      listeners_count: res.activeListeners,
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || "Internal error" }, { status: 500 });
  }
}

export async function GET() {
  const count = await getActiveListenersCount();
  return NextResponse.json({ listeners_count: count });
}
