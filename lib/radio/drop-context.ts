import { neonQuery } from "@/lib/supabase-db";
import { publicState, isEventSellable, getEventAvailability, type SchedulableEvent } from "@/lib/event-availability";
import { getPromotableEvents, speakPrice, normalizeEventTitle } from "@/lib/radio/events";
import { formatTrackTitle } from "@/lib/radio/media-helpers";

export type BroadcastTagCategory =
  | "event"
  | "tickets"
  | "lineup"
  | "radio"
  | "media"
  | "vendors"
  | "weather"
  | "traffic"
  | "news"
  | "clock";

export interface BroadcastContextTag {
  id: string;
  category: BroadcastTagCategory;
  label: string;
  value: string;
}

export interface UnifiedDropContextEvent {
  id: number;
  title: string;
  name_spoken: string;
  subtitle: string | null;
  venue: string;
  venue_spoken: string;
  maps_url: string | null;
  event_date: string | null;
  custom_schedule_text: string | null;
  status: string;
  public_state: string;
  sellable: boolean;
  availability_reason: string;
  category: string;
  recurrence_pattern: string | null;
  lineup: string[];
  lineup_confirmed: boolean;
  countdown_phrase: string | null;
  gates_open_phrase: string | null;
  spoken_ticket_url: string;
  max_tent_inventory: number;
  max_shared_beds: number;
  remaining_tents: number | null;
  remaining_beds: number | null;
  video_url: string | null;
  recap_video_url: string | null;
  ticker_text: string | null;
  waitlist_count: number;
  sales_24h: number;
  sales_6h: number;
  total_tickets_sold: number;
  tiers: Array<{
    id: string;
    name: string;
    price: number;
    price_spoken: string;
    admits_quantity: number;
    description: string | null;
    tag: string | null;
    badge_text: string | null;
    is_camping_bundle: boolean;
    camping_type: string | null;
    sold_count: number;
    max_quantity: number | null;
    remaining_count: number | null;
    is_free_rsvp: boolean;
    is_group_bundle: boolean;
  }>;
  free_rsvp_tiers: string[];
  group_bundles: Array<{ name: string; admits: number; price: number; description: string | null }>;
  vendors: Array<{ id: number; name: string; is_house: boolean }>;
  gallery_clips: Array<{ id: number; caption: string | null; tag: string | null; url: string; created_at: string }>;
}

export interface UnifiedDropContext {
  generated_at: string;
  station_name: string;
  site_url: string;
  clock: {
    eat_time: string;
    eat_day: string;
    daypart: "morning" | "afternoon" | "peak_evening" | "deep_overnight";
    coarse_phrase: string;
    is_weekend: boolean;
  };
  weather: {
    city: string;
    temp_c: number | null;
    condition: string;
    wind_kmh: number | null;
    precipitation_mm: number | null;
    spoken_summary: string;
    source: string;
  };
  traffic: {
    route_label: string;
    distance_km: number | null;
    free_flow_min: number | null;
    estimated_drive_min: number | null;
    congestion_level: "light" | "moderate" | "heavy";
    corridor_advisory: string;
    headlines: string[];
    source: string;
  };
  news: {
    headlines: Array<{ title: string; source: string | null }>;
    source: string;
  };
  radio: {
    broadcast_mode: string;
    active_playlist_id: number | null;
    active_playlist_name: string | null;
    now_playing: {
      id: number;
      title: string;
      artist: string | null;
      genre: string | null;
      bpm: number | null;
      musical_key: string | null;
      energy: number | null;
    } | null;
    up_next: Array<{
      id: number;
      title: string;
      artist: string | null;
      genre: string | null;
      bpm: number | null;
      musical_key: string | null;
    }>;
    ready_track_count: number;
    recent_library_adds: Array<{ id: number; title: string; artist: string | null; genre: string | null; created_at: string }>;
    active_listeners_10m: number;
    listeners_24h: number;
  };
  primary_event: UnifiedDropContextEvent | null;
  events: UnifiedDropContextEvent[];
  promos_highlights: string[];
  tags: BroadcastContextTag[];
}

// 15-minute in-memory cache for external zero-key feeds (Open-Meteo, OSRM, Google News RSS)
interface ExternalFeedsCache {
  weather: UnifiedDropContext["weather"];
  trafficHeadlines: string[];
  newsHeadlines: UnifiedDropContext["news"]["headlines"];
  osrmCache: Map<string, { distance_km: number; duration_min: number }>;
  fetchedAt: number;
}

let _externalCache: ExternalFeedsCache | null = null;
const EXTERNAL_CACHE_TTL_MS = 15 * 60 * 1000;

function decodeWmoCode(code: number | null | undefined, isDay = 1): string {
  if (code == null) return "Mild Nairobi skies";
  if (code === 0) return isDay ? "Clear sunny skies" : "Clear starry night";
  if (code === 1 || code === 2) return "Partly cloudy";
  if (code === 3) return "Overcast clouds";
  if (code >= 45 && code <= 48) return "Mist / hazy skies";
  if (code >= 51 && code <= 55) return "Light drizzle";
  if (code >= 61 && code <= 65) return "Rain showers";
  if (code >= 80 && code <= 82) return "Passing heavy showers";
  if (code >= 95) return "Thunderstorms";
  return "Warm Nairobi conditions";
}

function stripRssText(raw: string): string {
  return raw
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export function toSpokenPlace(raw?: string | null): string {
  if (!raw) return "the grounds";
  const main = raw.split(",")[0].trim();
  const letters = main.replace(/[^a-zA-Z]/g, "");
  // Convert shouting ALL-CAPS venues (e.g. THE HUB GARDEN) to natural Title Case for neural TTS
  if (letters.length > 3 && main === main.toUpperCase()) {
    return main
      .toLowerCase()
      .replace(/\b\w/g, (ch) => ch.toUpperCase())
      .replace(/\bCbd\b/g, "CBD");
  }
  return main;
}

function intToEnglishUnder100(n: number): string {
  const num = Math.max(0, Math.min(99, Math.round(n)));
  const ones = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
  const tens = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
  if (num < 20) return ones[num];
  const t = Math.floor(num / 10);
  const r = num % 10;
  return r === 0 ? tens[t] : `${tens[t]}-${ones[r]}`;
}

export function toSpokenDriveTime(minutes: number | null | undefined, venueSpoken: string): string {
  if (minutes == null || !isFinite(minutes)) return `a smooth cruise out to ${venueSpoken}`;
  const rounded = Math.max(10, Math.round(minutes / 5) * 5);
  if (rounded >= 60) {
    return `around an hour cruise out to ${venueSpoken}`;
  }
  return `just a ${intToEnglishUnder100(rounded)}-minute cruise out to ${venueSpoken}`;
}

export function toSpokenWeatherSummary(condition: string, tempC: number | null): string {
  const condLower = condition.toLowerCase();
  if (tempC == null) {
    return condLower.includes("rain") || condLower.includes("drizzle")
      ? "cool rainy Nairobi skies"
      : "clean Nairobi skies";
  }
  const rounded = Math.round(tempC);
  const tempWords = intToEnglishUnder100(rounded);
  if (condLower.includes("drizzle") || condLower.includes("rain")) {
    return `cool ${tempWords}-degree rainy Nairobi vibes`;
  }
  if (condLower.includes("cloud") || condLower.includes("overcast")) {
    return `mild ${tempWords}-degree Nairobi skies`;
  }
  if (rounded >= 25) {
    return `warm sunny ${tempWords}-degree Nairobi weather`;
  }
  return `crisp ${tempWords}-degree Nairobi skies`;
}

function parseGoogleRssItems(xml: string, limit = 4): Array<{ title: string; source: string | null }> {
  const items: Array<{ title: string; source: string | null }> = [];
  const itemMatches = xml.matchAll(/<item>([\s\S]*?)<\/item>/gi);
  for (const m of itemMatches) {
    const block = m[1];
    const titleMatch = block.match(/<title>([\s\S]*?)<\/title>/i);
    if (!titleMatch) continue;
    const rawTitle = stripRssText(titleMatch[1]);
    if (!rawTitle || rawTitle.toLowerCase().includes("google news")) continue;
    const dashIdx = rawTitle.lastIndexOf(" - ");
    const cleanTitle = dashIdx > 20 ? rawTitle.slice(0, dashIdx).trim() : rawTitle;
    const source = dashIdx > 20 ? rawTitle.slice(dashIdx + 3).trim() : null;
    items.push({ title: cleanTitle, source });
    if (items.length >= limit) break;
  }
  return items;
}

export function extractCoordsFromMapsUrl(
  mapsUrl?: string | null,
  venueName?: string | null
): { lat: number; lng: number } | null {
  const combined = `${mapsUrl || ""} ${venueName || ""}`.toLowerCase();
  if (mapsUrl) {
    const patterns = [
      /@(-?\d+\.\d+),(-?\d+\.\d+)/,
      /[?&](?:q|query|ll)=(-?\d+\.\d+),(-?\d+\.\d+)/,
      /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/,
    ];
    for (const p of patterns) {
      const m = mapsUrl.match(p);
      if (m) {
        const lat = Number(m[1]);
        const lng = Number(m[2]);
        if (isFinite(lat) && isFinite(lng) && lat >= -5 && lat <= 5 && lng >= 33 && lng <= 42) {
          return { lat, lng };
        }
      }
    }
  }
  if (combined.includes("karen") || combined.includes("hub garden")) {
    return { lat: -1.3198, lng: 36.7042 };
  }
  if (combined.includes("marara") || combined.includes("thika")) {
    return { lat: -1.0365, lng: 37.0721 };
  }
  return null;
}

async function getExternalFeeds(forceRefresh = false): Promise<ExternalFeedsCache> {
  const now = Date.now();
  if (!forceRefresh && _externalCache && now - _externalCache.fetchedAt < EXTERNAL_CACHE_TTL_MS) {
    return _externalCache;
  }

  const fallbackWeather: UnifiedDropContext["weather"] = {
    city: "Nairobi",
    temp_c: null,
    condition: "Warm equatorial skies",
    wind_kmh: null,
    precipitation_mm: null,
    spoken_summary: "Warm Nairobi weather",
    source: "fallback",
  };

  const [weatherRes, newsRes, trafficRes] = await Promise.all([
    fetch(
      "https://api.open-meteo.com/v1/forecast?latitude=-1.2921&longitude=36.8219&current=temperature_2m,precipitation,weather_code,wind_speed_10m,is_day&timezone=Africa%2FNairobi",
      { signal: AbortSignal.timeout(2500) }
    )
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null),
    fetch(
      "https://news.google.com/rss/search?q=Nairobi+OR+Kenya+entertainment+OR+music+OR+events&hl=en-KE&gl=KE&ceid=KE:en",
      { signal: AbortSignal.timeout(2500) }
    )
      .then((r) => (r.ok ? r.text() : ""))
      .catch(() => ""),
    fetch(
      "https://news.google.com/rss/search?q=Nairobi+traffic+OR+Thika+Road+OR+Waiyaki+Way&hl=en-KE&gl=KE&ceid=KE:en",
      { signal: AbortSignal.timeout(2500) }
    )
      .then((r) => (r.ok ? r.text() : ""))
      .catch(() => ""),
  ]);

  let weather = fallbackWeather;
  if (weatherRes?.current) {
    const c = weatherRes.current;
    const temp = typeof c.temperature_2m === "number" ? Math.round(c.temperature_2m) : null;
    const wind = typeof c.wind_speed_10m === "number" ? Math.round(c.wind_speed_10m) : null;
    const precip = typeof c.precipitation === "number" ? c.precipitation : null;
    const cond = decodeWmoCode(c.weather_code, c.is_day);
    weather = {
      city: "Nairobi",
      temp_c: temp,
      condition: cond,
      wind_kmh: wind,
      precipitation_mm: precip,
      spoken_summary: toSpokenWeatherSummary(cond, temp),
      source: "open-meteo",
    };
  }

  const newsHeadlines = newsRes ? parseGoogleRssItems(newsRes, 4) : [];
  const trafficHeadlines = trafficRes ? parseGoogleRssItems(trafficRes, 3).map((i) => i.title) : [];

  const osrmCache = _externalCache?.osrmCache || new Map();

  _externalCache = {
    weather,
    trafficHeadlines,
    newsHeadlines,
    osrmCache,
    fetchedAt: now,
  };
  return _externalCache;
}

async function getOsrmRouteEstimate(
  dest: { lat: number; lng: number },
  cache: Map<string, { distance_km: number; duration_min: number }>
): Promise<{ distance_km: number; duration_min: number; source: string }> {
  // Nairobi CBD (-1.2921, 36.8219) -> destination venue coordinates
  const key = `${dest.lat.toFixed(3)},${dest.lng.toFixed(3)}`;
  const cached = cache.get(key);
  if (cached) return { ...cached, source: "osrm" };

  try {
    const res = await fetch(
      `https://router.project-osrm.org/route/v1/driving/36.8219,-1.2921;${dest.lng},${dest.lat}?overview=false`,
      { signal: AbortSignal.timeout(2200) }
    );
    if (res.ok) {
      const j = await res.json();
      const route = j?.routes?.[0];
      if (route && typeof route.distance === "number" && typeof route.duration === "number") {
        const result = {
          distance_km: Math.round((route.distance / 1000) * 10) / 10,
          duration_min: Math.max(10, Math.round(route.duration / 60)),
        };
        cache.set(key, result);
        return { ...result, source: "osrm" };
      }
    }
  } catch {}

  return { distance_km: 44, duration_min: 48, source: "estimate" };
}

function getEatClock(now = new Date()) {
  const eatMs = now.getTime() + 3 * 60 * 60 * 1000;
  const eatDate = new Date(eatMs);
  const h = eatDate.getUTCHours();
  const m = eatDate.getUTCMinutes();
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const eatDay = days[eatDate.getUTCDay()];
  const isWeekend = eatDate.getUTCDay() === 0 || eatDate.getUTCDay() === 5 || eatDate.getUTCDay() === 6;

  let daypart: UnifiedDropContext["clock"]["daypart"] = "deep_overnight";
  if (h >= 6 && h < 12) daypart = "morning";
  else if (h >= 12 && h < 18) daypart = "afternoon";
  else if (h >= 18) daypart = "peak_evening";

  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const eatTime = `${h12}:${m < 10 ? "0" : ""}${m} ${ampm} EAT`;

  let coarse = "late night";
  if (h >= 5 && h < 9) coarse = "early morning";
  else if (h >= 9 && h < 12) coarse = "mid-morning";
  else if (h >= 12 && h < 15) coarse = "early afternoon";
  else if (h >= 15 && h < 18) coarse = "late afternoon rush";
  else if (h >= 18 && h < 21) coarse = "evening drive time";
  else if (h >= 21) coarse = "prime night";

  return {
    eat_time: eatTime,
    eat_day: eatDay,
    daypart,
    coarse_phrase: `${eatDay} ${coarse}`,
    is_weekend: isWeekend,
    eatHour: h,
  };
}

function computeTrafficState(
  eatHour: number,
  isWeekend: boolean,
  freeFlowMin: number,
  distanceKm: number,
  venueName: string,
  headlines: string[],
  hasTomTomKey: boolean
): UnifiedDropContext["traffic"] {
  let multiplier = 1.08;
  let congestion_level: "light" | "moderate" | "heavy" = "light";
  let advisory = `Cruising smooth from Nairobi CBD toward ${venueName}.`;

  if (!isWeekend && ((eatHour >= 7 && eatHour <= 9) || (eatHour >= 17 && eatHour <= 20))) {
    multiplier = 1.48;
    congestion_level = "heavy";
    advisory = "Peak Nairobi rush on Thika Rd, Waiyaki Way & Mombasa Rd — plan extra departure buffer.";
  } else if ((eatHour >= 12 && eatHour < 17) || (isWeekend && eatHour >= 15 && eatHour <= 21)) {
    multiplier = 1.24;
    congestion_level = "moderate";
    advisory = `Steady flow out of town toward ${venueName}; Expressway & Bypass moving cleanly.`;
  }

  const estimatedMin = Math.round(freeFlowMin * multiplier);
  return {
    route_label: `Nairobi CBD → ${venueName}`,
    distance_km: distanceKm,
    free_flow_min: freeFlowMin,
    estimated_drive_min: estimatedMin,
    congestion_level,
    corridor_advisory: headlines.length > 0 ? `${advisory} Alert: ${headlines[0]}` : advisory,
    headlines,
    source: hasTomTomKey ? "osrm+tomtom" : headlines.length > 0 ? "osrm+news-rss" : "osrm+eat-model",
  };
}

/**
 * Single authoritative parallel aggregator feeding the AI Drop Studio tags,
 * script writers (/write-script), and automated drop engine.
 * Zero PII — strictly aggregates sales velocity, inventories, and public metadata.
 */
export async function buildUnifiedDropContext(options?: {
  refreshExternal?: boolean;
}): Promise<UnifiedDropContext> {
  const now = new Date();
  const clock = getEatClock(now);
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "https://goodlife.smwhr.space").replace(/\/+$/, "");

  const [
    eventsRes,
    tiersRes,
    salesStatsRes,
    galleryRes,
    vendorsRes,
    waitlistRes,
    promotableRes,
    livePlaylistRes,
    catalogSetsRes,
    settingsRes,
    recentAddsRes,
    playsStatsRes,
    externalFeeds,
  ] = await Promise.all([
    neonQuery(
      `SELECT e.*, COALESCE(e.lineup, ARRAY[]::text[]) AS lineup_arr
       FROM events e
       WHERE e.archived_at IS NULL
       ORDER BY e.is_active DESC,
                CASE WHEN LOWER(COALESCE(e.status,'')) = 'live' THEN 0
                     WHEN LOWER(COALESCE(e.status,'')) = 'scheduled' THEN 1
                     ELSE 2 END,
                e.id DESC`
    ).catch(() => ({ rows: [] })),
    neonQuery(
      `SELECT t.* FROM ticket_tiers t
       WHERE t.deleted_at IS NULL AND COALESCE(t.hidden, false) = false
       ORDER BY t.price ASC, t.admits_quantity ASC`
    ).catch(() => ({ rows: [] })),
    neonQuery(
      `SELECT event_id, ticket_tier,
              COUNT(*)::int AS total_sold,
              COALESCE(SUM(COALESCE(guest_count, 1)), 0)::int AS total_guests,
              COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours')::int AS sold_24h,
              COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '6 hours')::int AS sold_6h,
              COUNT(*) FILTER (WHERE is_camping = true AND camping_type = 'private')::int AS tents_booked,
              COUNT(*) FILTER (WHERE is_camping = true AND camping_type = 'shared_bed')::int AS beds_booked
       FROM tickets
       WHERE deleted_at IS NULL
         AND COALESCE(status, 'valid') NOT IN ('cancelled', 'refunded', 'deleted', 'expired')
       GROUP BY event_id, ticket_tier`
    ).catch(() => ({ rows: [] })),
    neonQuery(
      `SELECT id, event_id, COALESCE(thumbnail_url, image_url) AS url, caption, tag, created_at
       FROM event_gallery
       ORDER BY created_at DESC
       LIMIT 16`
    ).catch(() => ({ rows: [] })),
    neonQuery(
      `SELECT vea.event_id, v.id, v.name, COALESCE(v.is_house, false) AS is_house
       FROM vendor_event_assignments vea
       JOIN vendors v ON v.id = vea.vendor_id
       WHERE v.deleted_at IS NULL AND COALESCE(vea.status, 'active') <> 'removed'
       ORDER BY v.is_house DESC, v.name ASC`
    ).catch(() => ({ rows: [] })),
    neonQuery(
      `SELECT event_id, COUNT(*)::int AS total
       FROM event_waitlist
       GROUP BY event_id`
    ).catch(() => ({ rows: [] })),
    getPromotableEvents(now).catch(() => []),
    neonQuery(
      `SELECT p.id as playlist_id, p.name as playlist_name, p.activated_at,
              s.id, s.title, s.dj_name, s.genre, s.bpm, s.musical_key, s.energy, s.duration_sec
       FROM radio_playlists p
       JOIN radio_playlist_tracks pt ON pt.playlist_id = p.id
       JOIN radio_sets s ON s.id = pt.track_id AND s.deleted_at IS NULL AND (s.is_active = true OR s.is_active IS NULL)
       WHERE p.is_broadcast_active = true AND p.deleted_at IS NULL
       ORDER BY pt.position ASC, pt.id ASC`
    ).catch(() => ({ rows: [] })),
    neonQuery(
      `SELECT id, title, dj_name, genre, bpm, musical_key, energy, duration_sec
       FROM radio_sets
       WHERE deleted_at IS NULL AND (is_active = true OR is_active IS NULL) AND processing_status = 'ready'
       ORDER BY display_order ASC, id ASC`
    ).catch(() => ({ rows: [] })),
    neonQuery(
      `SELECT broadcast_mode, active_set_id, active_started_at FROM radio_settings WHERE id = 1`
    ).catch(() => ({ rows: [] })),
    neonQuery(
      `SELECT id, title, dj_name, genre, created_at
       FROM radio_sets
       WHERE deleted_at IS NULL AND (is_active = true OR is_active IS NULL)
       ORDER BY created_at DESC
       LIMIT 5`
    ).catch(() => ({ rows: [] })),
    neonQuery(
      `SELECT COUNT(*) FILTER (WHERE played_at > NOW() - INTERVAL '10 minutes')::int AS active_10m,
              COUNT(*) FILTER (WHERE played_at > NOW() - INTERVAL '24 hours')::int AS plays_24h
       FROM radio_plays`
    ).catch(() => ({ rows: [{ active_10m: 0, plays_24h: 0 }] })),
    getExternalFeeds(Boolean(options?.refreshExternal)),
  ]);

  // Index tiers, stats, gallery, vendors, waitlist, promotable by event_id
  const statsByEventTier = new Map<string, any>();
  const eventStatsTotals = new Map<
    number,
    { sold: number; sold_24h: number; sold_6h: number; tents: number; beds: number }
  >();
  for (const row of salesStatsRes.rows) {
    const eid = Number(row.event_id);
    statsByEventTier.set(`${eid}:${String(row.ticket_tier || "").toLowerCase()}`, row);
    const cur = eventStatsTotals.get(eid) || { sold: 0, sold_24h: 0, sold_6h: 0, tents: 0, beds: 0 };
    cur.sold += Number(row.total_sold || 0);
    cur.sold_24h += Number(row.sold_24h || 0);
    cur.sold_6h += Number(row.sold_6h || 0);
    cur.tents += Number(row.tents_booked || 0);
    cur.beds += Number(row.beds_booked || 0);
    eventStatsTotals.set(eid, cur);
  }

  const tiersByEvent = new Map<number, any[]>();
  for (const t of tiersRes.rows) {
    const eid = Number(t.event_id);
    if (!tiersByEvent.has(eid)) tiersByEvent.set(eid, []);
    tiersByEvent.get(eid)!.push(t);
  }

  const galleryByEvent = new Map<number, any[]>();
  for (const g of galleryRes.rows) {
    const eid = Number(g.event_id);
    if (!galleryByEvent.has(eid)) galleryByEvent.set(eid, []);
    galleryByEvent.get(eid)!.push(g);
  }

  const vendorsByEvent = new Map<number, Array<{ id: number; name: string; is_house: boolean }>>();
  for (const v of vendorsRes.rows) {
    const eid = Number(v.event_id);
    if (!vendorsByEvent.has(eid)) vendorsByEvent.set(eid, []);
    vendorsByEvent.get(eid)!.push({ id: Number(v.id), name: v.name, is_house: Boolean(v.is_house) });
  }

  const waitlistByEvent = new Map<number, number>();
  for (const w of waitlistRes.rows) {
    waitlistByEvent.set(Number(w.event_id), Number(w.total || 0));
  }

  const promoById = new Map(promotableRes.map((p) => [p.id, p]));

  const events: UnifiedDropContextEvent[] = eventsRes.rows.map((e: any) => {
    const eid = Number(e.id);
    const sched: SchedulableEvent = {
      status: e.status,
      archived_at: e.archived_at,
      event_date: e.event_date,
      sales_open_date: e.sales_open_date,
      sales_close_date: e.sales_close_date,
      category: e.category,
      recurrence_pattern: e.recurrence_pattern,
      recurrence_day: e.recurrence_day,
      recurrence_time: e.recurrence_time,
    };
    const pState = publicState(sched, now);
    const sellable = isEventSellable(sched, now);
    const avail = getEventAvailability(sched, now);
    const promo = promoById.get(eid);
    const tot = eventStatsTotals.get(eid) || { sold: 0, sold_24h: 0, sold_6h: 0, tents: 0, beds: 0 };

    const rawTiers = tiersByEvent.get(eid) || [];
    const mappedTiers = rawTiers.map((t: any) => {
      const price = Number(t.price || 0);
      const st = statsByEventTier.get(`${eid}:${String(t.name || "").toLowerCase()}`) ||
        statsByEventTier.get(`${eid}:${String(t.id || "").toLowerCase()}`);
      const soldCount = Number(st?.total_sold || 0);
      const maxQ = t.max_quantity != null ? Number(t.max_quantity) : null;
      const remaining = maxQ != null ? Math.max(0, maxQ - soldCount) : null;
      const admits = Math.max(1, Number(t.admits_quantity || 1));
      const descLower = `${t.name || ""} ${t.description || ""} ${t.badge_text || ""}`.toLowerCase();
      const isFreeRsvp = price === 0;
      const isGroupBundle =
        admits > 1 ||
        descLower.includes("4+1") ||
        descLower.includes("group") ||
        descLower.includes("squad") ||
        descLower.includes("table");

      return {
        id: String(t.id),
        name: String(t.name),
        price,
        price_spoken: speakPrice(price),
        admits_quantity: admits,
        description: t.description || null,
        tag: t.tag || null,
        badge_text: t.badge_text || null,
        is_camping_bundle: Boolean(t.is_camping_bundle),
        camping_type: t.camping_type || null,
        sold_count: soldCount,
        max_quantity: maxQ,
        remaining_count: remaining,
        is_free_rsvp: isFreeRsvp,
        is_group_bundle: isGroupBundle,
      };
    });

    const freeRsvpTiers = mappedTiers.filter((t) => t.is_free_rsvp).map((t) => t.name);
    const groupBundles = mappedTiers
      .filter((t) => t.is_group_bundle)
      .map((t) => ({ name: t.name, admits: t.admits_quantity, price: t.price, description: t.description }));

    const maxTents = Number(e.max_tent_inventory ?? 0);
    const maxBeds = Number(e.max_shared_beds ?? 0);
    const lineupArr: string[] = Array.isArray(e.lineup_arr) ? e.lineup_arr.filter(Boolean) : [];
    const lineupConfirmed = Boolean(e.lineup_confirmed);
    const rawVenue = String(e.venue || "Marara Camp").trim();
    const spokenVenue = toSpokenPlace(promo?.venue_spoken || rawVenue);

    return {
      id: eid,
      title: String(e.title || ""),
      name_spoken: promo?.name_spoken || normalizeEventTitle(String(e.title || "")),
      subtitle: e.subtitle || null,
      venue: rawVenue,
      venue_spoken: spokenVenue,
      maps_url: e.maps_url || null,
      event_date: e.event_date ? new Date(e.event_date).toISOString() : null,
      custom_schedule_text: e.custom_schedule_text || null,
      status: String(e.status || "scheduled"),
      public_state: pState,
      sellable,
      availability_reason: avail.reason,
      category: String(e.category || "flagship"),
      recurrence_pattern: e.recurrence_pattern || null,
      lineup: lineupConfirmed ? lineupArr : [],
      lineup_confirmed: lineupConfirmed,
      countdown_phrase: promo?.countdown_phrase || e.custom_schedule_text || null,
      gates_open_phrase: promo?.gates_open_phrase || null,
      spoken_ticket_url: e.spoken_ticket_url || promo?.spoken_ticket_url || "goodlife.smwhr.space",
      max_tent_inventory: maxTents,
      max_shared_beds: maxBeds,
      remaining_tents: maxTents > 0 ? Math.max(0, maxTents - tot.tents) : null,
      remaining_beds: maxBeds > 0 ? Math.max(0, maxBeds - tot.beds) : null,
      video_url: e.video_url || null,
      recap_video_url: e.recap_video_url || null,
      ticker_text: e.ticker_text || null,
      waitlist_count: waitlistByEvent.get(eid) || 0,
      sales_24h: tot.sold_24h,
      sales_6h: tot.sold_6h,
      total_tickets_sold: tot.sold,
      tiers: mappedTiers,
      free_rsvp_tiers: freeRsvpTiers,
      group_bundles: groupBundles,
      vendors: vendorsByEvent.get(eid) || [],
      gallery_clips: (galleryByEvent.get(eid) || []).map((g: any) => ({
        id: Number(g.id),
        caption: g.caption || null,
        tag: g.tag || null,
        url: String(g.url),
        created_at: g.created_at ? new Date(g.created_at).toISOString() : "",
      })),
    };
  });

  // Pick primary event: prefer currently sellable flagship/mini or highest-priority event
  const primaryEvent =
    events.find((e) => e.sellable && e.public_state === "checkout") ||
    events.find((e) => e.public_state === "coming_soon") ||
    events[0] ||
    null;

  // Radio current playout resolution
  const activePlaylistRows = livePlaylistRes.rows;
  const activePlaylistId = activePlaylistRows[0]?.playlist_id ? Number(activePlaylistRows[0].playlist_id) : null;
  const activePlaylistName = activePlaylistRows[0]?.playlist_name || null;
  const sets = activePlaylistRows.length > 0 ? activePlaylistRows : catalogSetsRes.rows;
  const settings = settingsRes.rows[0] || {};
  const broadcastMode = settings.broadcast_mode || "autodj";

  let activeIdx = -1;
  if (sets.length > 0) {
    if (broadcastMode === "mania" && settings.active_set_id) {
      activeIdx = sets.findIndex((s: any) => Number(s.id) === Number(settings.active_set_id));
    }
    if (activeIdx === -1) {
      const totalDurationSec = sets.reduce((acc: number, s: any) => acc + (Number(s.duration_sec) || 180), 0);
      const nowSec = Math.floor(Date.now() / 1000);
      const activatedAtSec = activePlaylistRows[0]?.activated_at
        ? Math.floor(new Date(activePlaylistRows[0].activated_at).getTime() / 1000)
        : 0;
      const cycleSec = totalDurationSec > 0 ? Math.max(0, nowSec - activatedAtSec) % totalDurationSec : 0;
      let cum = 0;
      activeIdx = 0;
      for (let i = 0; i < sets.length; i++) {
        const d = Number(sets[i].duration_sec) || 180;
        if (cum + d > cycleSec) {
          activeIdx = i;
          break;
        }
        cum += d;
      }
    }
  }

  const curRow = activeIdx >= 0 ? sets[activeIdx] : null;
  const upNextRows =
    sets.length > 1
      ? [1, 2, 3].map((offset) => sets[(activeIdx + offset) % sets.length]).filter(Boolean)
      : [];

  // OSRM route distance to primary event venue
  const primaryPromo = primaryEvent ? promoById.get(primaryEvent.id) : null;
  const venueCoords =
    primaryPromo?.venue_coords ||
    extractCoordsFromMapsUrl(primaryEvent?.maps_url, primaryEvent?.venue) || { lat: -1.0365, lng: 37.0721 };

  const osrmEst = await getOsrmRouteEstimate(venueCoords, externalFeeds.osrmCache);
  const traffic = computeTrafficState(
    clock.eatHour,
    clock.is_weekend,
    osrmEst.duration_min,
    osrmEst.distance_km,
    primaryEvent?.venue_spoken || "Marara Camp",
    externalFeeds.trafficHeadlines,
    Boolean(process.env.TOMTOM_API_KEY?.trim())
  );

  // Promotional & bundle highlights across live events
  const promos_highlights: string[] = [];
  for (const ev of events.filter((e) => e.sellable || e.public_state === "coming_soon")) {
    if (ev.free_rsvp_tiers.length > 0) {
      promos_highlights.push(`${ev.name_spoken}: Free RSVP (${ev.free_rsvp_tiers[0]})`);
    }
    for (const b of ev.group_bundles) {
      promos_highlights.push(`${ev.name_spoken}: ${b.name} (${b.admits} passes — ${speakPrice(b.price)})`);
    }
    if (ev.sales_24h > 0) {
      promos_highlights.push(`${ev.name_spoken}: ${ev.sales_24h} passes locked in last 24h`);
    }
    if (ev.remaining_tents != null && ev.remaining_tents > 0 && ev.max_tent_inventory > 0) {
      promos_highlights.push(`${ev.name_spoken}: ${ev.remaining_tents}/${ev.max_tent_inventory} camping tents left`);
    }
  }

  // Build categorized clickable Broadcast Tags for Drop Studio
  const tags: BroadcastContextTag[] = [];
  if (primaryEvent) {
    tags.push({
      id: "event",
      category: "event",
      label: `🎪 Event: ${primaryEvent.name_spoken}`,
      value: primaryEvent.name_spoken,
    });
    tags.push({
      id: "venue",
      category: "event",
      label: `📍 Venue: ${primaryEvent.venue_spoken}`,
      value: primaryEvent.venue_spoken,
    });
    if (primaryEvent.countdown_phrase) {
      tags.push({
        id: "date",
        category: "event",
        label: `📅 When: ${primaryEvent.countdown_phrase}`,
        value: primaryEvent.countdown_phrase,
      });
    }
    const cleanTicketTarget =
      primaryEvent.spoken_ticket_url.includes("smwhr") || primaryEvent.spoken_ticket_url.includes("somewhere")
        ? "tickets on goodlife dot smwhr dot space"
        : primaryEvent.spoken_ticket_url;
    tags.push({
      id: "tickets_url",
      category: "tickets",
      label: "🎟️ URL: goodlife.smwhr.space",
      value: cleanTicketTarget,
    });

    const entryTier = primaryEvent.tiers.find((t) => !t.is_camping_bundle) || primaryEvent.tiers[0];
    if (entryTier) {
      tags.push({
        id: "price",
        category: "tickets",
        label: `💰 From: ${entryTier.price === 0 ? "Free Entry" : entryTier.price_spoken}`,
        value: `${entryTier.name} (${entryTier.price_spoken})`,
      });
    }
    if (primaryEvent.group_bundles.length > 0) {
      const gb = primaryEvent.group_bundles[0];
      tags.push({
        id: "bundle",
        category: "tickets",
        label: `👥 Squad Deal: ${gb.name}`,
        value: `${gb.name} (${speakPrice(gb.price)})`,
      });
    }
    if (primaryEvent.sales_24h > 0) {
      tags.push({
        id: "velocity",
        category: "tickets",
        label: `🔥 Sales 24h: ${primaryEvent.sales_24h} passes`,
        value: `${primaryEvent.sales_24h} festival lovers already grabbed passes in the last 24 hours`,
      });
    }
    if (primaryEvent.lineup_confirmed && primaryEvent.lineup.length > 0) {
      tags.push({
        id: "lineup",
        category: "lineup",
        label: `🎤 Lineup: ${primaryEvent.lineup.slice(0, 3).join(", ")}`,
        value: `Confirmed lineup featuring ${primaryEvent.lineup.join(", ")}`,
      });
    }
    if (primaryEvent.vendors.length > 0) {
      const names = primaryEvent.vendors.slice(0, 3).map((v) => v.name).join(", ");
      tags.push({
        id: "vendors",
        category: "vendors",
        label: `🍔 Vendors: ${primaryEvent.vendors.length} stalls (${names})`,
        value: `food, drinks and activations on ground by ${names}`,
      });
    }
    if (primaryEvent.video_url) {
      tags.push({
        id: "video",
        category: "media",
        label: `🎬 New Video Promo Live`,
        value: `check the fresh promo video on the Goodlife site`,
      });
    }
  }

  // Secondary live event quick tag (e.g. flagship + mini active simultaneously)
  const secondaryEvent = events.find((e) => primaryEvent && e.id !== primaryEvent.id && e.sellable);
  if (secondaryEvent) {
    tags.push({
      id: "second_event",
      category: "event",
      label: `✨ Also On Sale: ${secondaryEvent.name_spoken}`,
      value: `${secondaryEvent.name_spoken} at ${secondaryEvent.venue_spoken}`,
    });
  }

  if (curRow) {
    const cleanNow = formatTrackTitle(curRow.title);
    tags.push({
      id: "now_playing",
      category: "radio",
      label: `📻 On Air: ${cleanNow}`,
      value: `Now playing ${cleanNow}${curRow.dj_name ? ` by ${curRow.dj_name}` : ""}`,
    });
  }
  if (upNextRows[0]) {
    const cleanNext = formatTrackTitle(upNextRows[0].title);
    tags.push({
      id: "up_next",
      category: "radio",
      label: `⏭️ Up Next: ${cleanNext}`,
      value: `Up next: ${upNextRows[0].dj_name ? `${upNextRows[0].dj_name} - ` : ""}${cleanNext}`,
    });
  }
  tags.push({
    id: "station",
    category: "radio",
    label: `📡 Station: GOODLIFE Radio 254`,
    value: "GOODLIFE Radio 254",
  });
  tags.push({
    id: "clock",
    category: "clock",
    label: `🕒 ${clock.eat_time} · ${clock.daypart.replace("_", " ")}`,
    value: `${clock.coarse_phrase} across Nairobi`,
  });
  if (externalFeeds.weather.temp_c != null) {
    tags.push({
      id: "weather",
      category: "weather",
      label: `🌤️ Nairobi: ${externalFeeds.weather.temp_c}°C ${externalFeeds.weather.condition}`,
      value: `under ${externalFeeds.weather.spoken_summary}`,
    });
  }
  const spokenDrive = toSpokenDriveTime(traffic.estimated_drive_min, primaryEvent?.venue_spoken || "the venue");
  tags.push({
    id: "traffic",
    category: "traffic",
    label: `🚗 ${traffic.route_label}: ~${traffic.estimated_drive_min} min (${traffic.congestion_level})`,
    value: spokenDrive,
  });
  if (externalFeeds.newsHeadlines[0]) {
    const hl = externalFeeds.newsHeadlines[0].title;
    tags.push({
      id: "news",
      category: "news",
      label: `📰 Buzz: ${hl.slice(0, 48)}${hl.length > 48 ? "…" : ""}`,
      value: hl,
    });
  }

  return {
    generated_at: now.toISOString(),
    station_name: "GOODLIFE Radio 254",
    site_url: siteUrl,
    clock: {
      eat_time: clock.eat_time,
      eat_day: clock.eat_day,
      daypart: clock.daypart,
      coarse_phrase: clock.coarse_phrase,
      is_weekend: clock.is_weekend,
    },
    weather: externalFeeds.weather,
    traffic,
    news: {
      headlines: externalFeeds.newsHeadlines,
      source: externalFeeds.newsHeadlines.length > 0 ? "google-news-ke-rss" : "unavailable",
    },
    radio: {
      broadcast_mode: broadcastMode,
      active_playlist_id: activePlaylistId,
      active_playlist_name: activePlaylistName,
      now_playing: curRow
        ? {
            id: Number(curRow.id),
            title: formatTrackTitle(curRow.title),
            artist: curRow.dj_name || null,
            genre: curRow.genre || null,
            bpm: curRow.bpm != null ? Number(curRow.bpm) : null,
            musical_key: curRow.musical_key || null,
            energy: curRow.energy != null ? Number(curRow.energy) : null,
          }
        : null,
      up_next: upNextRows.map((u: any) => ({
        id: Number(u.id),
        title: formatTrackTitle(u.title),
        artist: u.dj_name || null,
        genre: u.genre || null,
        bpm: u.bpm != null ? Number(u.bpm) : null,
        musical_key: u.musical_key || null,
      })),
      ready_track_count: catalogSetsRes.rows.length,
      recent_library_adds: recentAddsRes.rows.map((r: any) => ({
        id: Number(r.id),
        title: formatTrackTitle(r.title),
        artist: r.dj_name || null,
        genre: r.genre || null,
        created_at: r.created_at ? new Date(r.created_at).toISOString() : "",
      })),
      active_listeners_10m: Number(playsStatsRes.rows?.[0]?.active_10m || 0),
      listeners_24h: Number(playsStatsRes.rows?.[0]?.plays_24h || 0),
    },
    primary_event: primaryEvent,
    events,
    promos_highlights,
    tags,
  };
}

/**
 * Formats a concise, hallucination-safe factual briefing for LLM drop script prompts.
 */
export function formatContextPromptSummary(ctx: UnifiedDropContext): string {
  const lines: string[] = [
    `Station: ${ctx.station_name} | Nairobi Time: ${ctx.clock.coarse_phrase}`,
    `[OPTIONAL WEATHER COLOR - only mention if asked or relevant]: ${ctx.weather.spoken_summary}`,
    `[OPTIONAL DRIVE COLOR - only mention if asked or relevant]: ${toSpokenDriveTime(ctx.traffic.estimated_drive_min, ctx.primary_event?.venue_spoken || "the venue")} (${ctx.traffic.congestion_level} traffic)`,
  ];

  if (ctx.primary_event) {
    const ev = ctx.primary_event;
    const entryTier = ev.tiers.find((t) => !t.is_camping_bundle) || ev.tiers[0];
    const spokenSite =
      ev.spoken_ticket_url.includes("smwhr") || ev.spoken_ticket_url.includes("somewhere")
        ? "tickets on goodlife dot smwhr dot space (or on the Goodlife website)"
        : ev.spoken_ticket_url;
    lines.push(
      `Primary Event: ${ev.name_spoken} (${ev.public_state}) at ${ev.venue_spoken}`,
      `Schedule / Countdown: ${ev.countdown_phrase || ev.custom_schedule_text || "Coming up soon"}${ev.gates_open_phrase ? ` · ${ev.gates_open_phrase}` : ""}`,
      `Ticket Purchase Destination: ${spokenSite}${entryTier ? ` · Entry from ${entryTier.price_spoken}` : ""}`
    );
    if (ev.free_rsvp_tiers.length > 0) {
      lines.push(`Free RSVP Tier Available: ${ev.free_rsvp_tiers.join(", ")}`);
    }
    if (ev.group_bundles.length > 0) {
      lines.push(
        `Group / Squad Offers: ${ev.group_bundles.map((b) => `${b.name} (${speakPrice(b.price)})`).join("; ")}`
      );
    }
    if (ev.lineup_confirmed && ev.lineup.length > 0) {
      lines.push(`Confirmed Lineup (safe to mention): ${ev.lineup.join(", ")}`);
    } else {
      lines.push(`Lineup: UNCONFIRMED — DO NOT invent or name any artist performing at the event.`);
    }
    if (ev.vendors.length > 0) {
      lines.push(`Confirmed On-Ground Vendors: ${ev.vendors.slice(0, 6).map((v) => v.name).join(", ")}`);
    }
    if (ev.sales_24h > 0) {
      lines.push(`Live Ticket Momentum: ${intToEnglishUnder100(Math.min(99, ev.sales_24h))} passes booked recently`);
    }
  }

  if (ctx.radio.now_playing) {
    lines.push(
      `Now Playing On Air: ${ctx.radio.now_playing.title}${ctx.radio.now_playing.artist ? ` by ${ctx.radio.now_playing.artist}` : ""}`
    );
  }
  if (ctx.radio.up_next[0]) {
    const up = ctx.radio.up_next[0];
    const isSlowMood =
      (up.bpm != null && up.bpm < 98) ||
      /sam smith|soul|r&b|lounge|chill|stay with me|adele|sza|burna/i.test(`${up.title} ${up.artist || ""} ${up.genre || ""}`);
    lines.push(
      `Up Next Track (TEASE THIS!): ${up.title}${up.artist ? ` by ${up.artist}` : ""}`,
      `Recommended Vocal Emotion for Up Next: ${isSlowMood ? "[warm tone] or [confident] (soulful smooth bridge into the track — avoid screaming [hype]!)" : "[hype] or [energetic]"}`
    );
  }
  if (ctx.news.headlines[0]) {
    lines.push(`[OPTIONAL NEWS COLOR - only mention if asked]: ${ctx.news.headlines[0].title}`);
  }

  return lines.join("\n");
}
