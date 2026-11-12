import { NextRequest, NextResponse } from "next/server";
import { recordListenerHeartbeat, removeListenerSession, getActiveListenersCount } from "@/lib/radio/listener-tracker";
import { resolveKenyaLocation, TOWN_TO_COUNTY_CODE, KENYA_COUNTIES } from "@/lib/radio/kenya-geo";

export const dynamic = "force-dynamic";

// In-memory cache for IP resolution to avoid redundant external calls
interface IpGeoResult {
  city: string | null;
  country: string | null;
  lat: number | null;
  lng: number | null;
}

const _ipGeoCache = new Map<string, { data: IpGeoResult; ts: number }>();
const IP_GEO_CACHE_TTL = 3600 * 1000; // 1 hour

async function resolveClientIpGeo(ip?: string | null): Promise<IpGeoResult | null> {
  if (!ip || ip === "127.0.0.1" || ip === "::1" || ip.startsWith("192.168.") || ip.startsWith("10.")) {
    return null;
  }
  const cached = _ipGeoCache.get(ip);
  if (cached && Date.now() - cached.ts < IP_GEO_CACHE_TTL) {
    return cached.data;
  }
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1200);
    const res = await fetch(`http://ip-api.com/json/${ip}?fields=status,countryCode,city,lat,lon`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const json = await res.json();
    if (json.status === "success") {
      const data: IpGeoResult = {
        city: json.city || null,
        country: json.countryCode || null,
        lat: typeof json.lat === "number" ? json.lat : null,
        lng: typeof json.lon === "number" ? json.lon : null,
      };
      _ipGeoCache.set(ip, { data, ts: Date.now() });
      return data;
    }
  } catch {}
  return null;
}

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

    // 1. Extract Real Client IP (checking Cloudflare, proxies, x-forwarded-for)
    const clientIp = req.headers.get("cf-connecting-ip") 
      || req.headers.get("x-real-ip") 
      || req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();

    // 2. Extract Cloudflare and Vercel edge headers
    const cfCountry = req.headers.get("cf-ipcountry");
    const cfCity = req.headers.get("cf-ipcity");
    const vercelCountry = req.headers.get("x-vercel-ip-country");
    const vercelCity = req.headers.get("x-vercel-ip-city");

    let rawCountry = cfCountry || vercelCountry;
    let rawCity = cfCity || vercelCity;
    let rawLat: number | null = parseFloat(req.headers.get("cf-iplatitude") || req.headers.get("x-vercel-ip-latitude") || "");
    let rawLng: number | null = parseFloat(req.headers.get("cf-iplongitude") || req.headers.get("x-vercel-ip-longitude") || "");
    if (isNaN(rawLat)) rawLat = null;
    if (isNaN(rawLng)) rawLng = null;

    // 3. Cloudflare Proxy Egress Fix:
    // When traffic passes through Cloudflare, Vercel sees Cloudflare's egress server (e.g. Zagreb, Budapest, Frankfurt).
    // Check if rawCity is a genuine Kenyan town or county
    const cleanCity = rawCity ? rawCity.trim().toLowerCase() : null;
    const isKnownKenyaTown = Boolean(
      cleanCity && (
        TOWN_TO_COUNTY_CODE[cleanCity] || 
        Object.values(KENYA_COUNTIES).some(c => c.name.toLowerCase() === cleanCity)
      )
    );

    // If client is in Kenya (or CF country is KE or timezone is Africa/Nairobi) but rawCity is NOT a genuine Kenyan town,
    // resolve the real client IP directly to bypass the CDN proxy location.
    const isKenyanClient = rawCountry === "KE" || cfCountry === "KE" || body?.tz === "Africa/Nairobi";
    const needsIpResolution = clientIp && (!rawCountry || !rawCity || (isKenyanClient && !isKnownKenyaTown));

    if (needsIpResolution) {
      const ipGeo = await resolveClientIpGeo(clientIp);
      if (ipGeo && ipGeo.country) {
        rawCountry = ipGeo.country;
        rawCity = ipGeo.city;
        rawLat = ipGeo.lat;
        rawLng = ipGeo.lng;
      }
    }

    // Client timezone / Kenya fallback: If confirmed in Kenya but specific town is still unlocated, assign to Nairobi
    if ((body?.tz === "Africa/Nairobi" || cfCountry === "KE") && (!rawCity || !isKnownKenyaTown)) {
      rawCountry = "KE";
      if (!rawCity || !isKnownKenyaTown) {
        rawCity = "Nairobi";
      }
    }

    const resolvedGeo = resolveKenyaLocation(
      rawCity,
      rawCountry,
      rawLat,
      rawLng
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
        city: resolvedGeo.canonicalCity,
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
