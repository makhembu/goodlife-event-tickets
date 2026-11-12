import { NextRequest, NextResponse } from "next/server";
import { recordListenerHeartbeat, removeListenerSession, getActiveListenersCount } from "@/lib/radio/listener-tracker";
import { resolveKenyaLocation } from "@/lib/radio/kenya-geo";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    let body: any = null;
    try {
      const text = await req.text();
      if (text) {
        body = JSON.parse(text);
      }
    } catch {}

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

    // Ingest Vercel Edge Geolocation Headers
    const rawCountry = req.headers.get("x-vercel-ip-country");
    const rawCity = req.headers.get("x-vercel-ip-city");
    const rawLat = parseFloat(req.headers.get("x-vercel-ip-latitude") || "");
    const rawLng = parseFloat(req.headers.get("x-vercel-ip-longitude") || "");

    const resolvedGeo = resolveKenyaLocation(
      rawCity,
      rawCountry,
      isNaN(rawLat) ? null : rawLat,
      isNaN(rawLng) ? null : rawLng
    );

    const res = await recordListenerHeartbeat(sessionId, clientType, {
      countyCode: resolvedGeo.countyCode,
      countyName: resolvedGeo.countyName,
      city: resolvedGeo.canonicalCity,
      country: resolvedGeo.country,
      latitude: resolvedGeo.lat,
      longitude: resolvedGeo.lng,
    });

    return NextResponse.json({
      ok: res.success,
      action: "ping",
      listeners_count: res.activeListeners,
      geo: {
        country: resolvedGeo.country,
        county: resolvedGeo.countyName,
        county_code: resolvedGeo.countyCode,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || "Internal error" }, { status: 500 });
  }
}

export async function GET() {
  const count = await getActiveListenersCount();
  return NextResponse.json({ listeners_count: count });
}
