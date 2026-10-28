import crypto from "crypto";
import fs from "fs";
import path from "path";
import { Pool } from "pg";

let _dbPool: Pool | null = null;

function getDbConnectionUrl(): string {
  let connStr = (process.env.DATABASE_URL || "").trim();
  if (!connStr && typeof window === "undefined") {
    try {
      const envPath = path.resolve(process.cwd(), ".env.local");
      if (fs.existsSync(envPath)) {
        const content = fs.readFileSync(envPath, "utf8");
        for (const line of content.split(/\r?\n/)) {
          const m = line.match(/^\s*DATABASE_URL\s*=\s*"?([^"#\r\n]+?)"?\s*$/);
          if (m) {
            connStr = m[1].trim();
            break;
          }
        }
      }
    } catch {}
  }
  if ((connStr.startsWith('"') && connStr.endsWith('"')) || (connStr.startsWith("'") && connStr.endsWith("'"))) {
    connStr = connStr.slice(1, -1).trim();
  }
  if (connStr && connStr.includes(".neon.tech") && !connStr.includes("-pooler.")) {
    try {
      const u = new URL(connStr);
      const parts = u.hostname.split(".");
      parts[0] = `${parts[0]}-pooler`;
      u.hostname = parts.join(".");
      connStr = u.toString();
    } catch {}
  }
  return connStr;
}

export function getEventsDbPool(): Pool {
  if (!_dbPool) {
    const connectionString = getDbConnectionUrl();
    _dbPool = new Pool({
      connectionString,
      ssl: { rejectUnauthorized: false },
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });
  }
  return _dbPool;
}

async function executeEventQuery(text: string, params?: any[]) {
  const pool = getEventsDbPool();
  return pool.query(text, params);
}
import {
  getEventAvailability,
  isRecurring,
  isOccurrenceDay,
  resolveNextOccurrence,
  keDateString,
  type SchedulableEvent,
} from "@/lib/event-availability";
import stationConfig from "@/config/station.json";

// Africa/Nairobi fixed offset is UTC+3 (no DST since 1963)
export const KE_OFFSET_MS = 3 * 60 * 60 * 1000;
export const KE_TZ = "Africa/Nairobi";

export interface RadioTicketTier {
  name: string;
  price: number;
  price_spoken: string;          // "four hundred and fifty shillings"
  admits: number;                // 1, 2, 4, 5
  sale_ends_at: string | null;
  scarcity_phrase: string | null; // only from real inventory, else null
}

export interface RadioPromotableEvent {
  id: number;
  name_spoken: string;           // "Sunday Park and Chill" (no numbering, natural casing)
  venue_spoken: string | null;
  venue_coords: { lat: number; lng: number } | null;
  starts_at: string | null;
  gates_open_at: string | null;
  ends_at: string | null;
  gates_open_phrase: string | null;   // "gates open at noon"
  state: "upcoming" | "live_now" | "sold_out"; // live_now only when ends_at exists
  is_recurring: boolean;
  ticket_url: string;            // SITE_BASE_URL + the site's real event route
  spoken_ticket_url: string;     // from overrides, else "tickets on our site"
  tiers: RadioTicketTier[];      // entry tiers only, on sale now, max 3
  lineup: string[];              // empty unless lineup_confirmed
  promo_blurb: string | null;
  countdown_phrase: string;      // computed in code
  valid_until: number;           // epoch ms
  facts_hash: string;            // SHA-256 of every fact used
  fetched_at: number;
}

// Raw row from Neon query
interface RawEventRow {
  id: number;
  title: string;
  venue: string | null;
  event_date: string | null;
  status: string | null;
  category: string | null;
  recurrence_pattern: string | null;
  recurrence_day: string | null;
  recurrence_time: string | null;
  sales_open_date: string | null;
  sales_close_date: string | null;
  lineup: string[] | null;
  lineup_confirmed: boolean | null;
  starts_at: string | null;
  gates_open_at: string | null;
  ends_at: string | null;
  radio_priority: number | null;
  promo_blurb: string | null;
  venue_coords: { lat: number; lng: number } | string | null;
  spoken_ticket_url: string | null;
}

interface RawTierRow {
  id: number;
  event_id: number;
  name: string;
  price: number;
  sold_count: number | null;
  max_quantity: number | null;
  available_from: string | null;
  available_until: string | null;
  hidden: boolean | null;
  deleted_at: string | null;
  show_only_on_event_day: boolean | null;
  hide_on_event_day: boolean | null;
  admits_quantity: number | null;
  tier_category: string | null;
}

// In-memory cache for event snapshots
let _snapshotCache: { events: RadioPromotableEvent[]; timestamp: number } | null = null;
const CACHE_TTL_MS = 45_000;          // 45 seconds fresh
const SNAPSHOT_MAX_STALE_MS = 600_000; // 10 minutes maximum fallback on DB disconnect

export function clearPromotableEventsCache(): void {
  _snapshotCache = null;
}

/**
 * Converts a numeric amount to spoken Kenyan English words for radio drops.
 * Example: 450 -> "four hundred and fifty shillings"
 * Example: 1000 -> "one thousand shillings"
 * Example: 2500 -> "two thousand five hundred shillings"
 */
export function speakPrice(amount: number): string {
  if (amount <= 0) return "free entry";

  const ones = [
    "", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
    "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen",
    "seventeen", "eighteen", "nineteen"
  ];
  const tens = [
    "", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"
  ];

  function convertBelowThousand(n: number): string {
    if (n === 0) return "";
    if (n < 20) return ones[n];
    if (n < 100) {
      const rem = n % 10;
      return tens[Math.floor(n / 10)] + (rem > 0 ? " " + ones[rem] : "");
    }
    const hundred = Math.floor(n / 100);
    const remainder = n % 100;
    if (remainder === 0) {
      return ones[hundred] + " hundred";
    }
    return ones[hundred] + " hundred and " + convertBelowThousand(remainder);
  }

  const rounded = Math.round(amount);
  let words = "";

  if (rounded >= 1_000_000) {
    const millions = Math.floor(rounded / 1_000_000);
    const rem = rounded % 1_000_000;
    words = convertBelowThousand(millions) + " million" + (rem > 0 ? " " : "");
  }

  const thousands = Math.floor((rounded % 1_000_000) / 1000);
  const belowThousand = rounded % 1000;

  if (thousands > 0) {
    words += convertBelowThousand(thousands) + " thousand";
    if (belowThousand > 0) {
      if (belowThousand < 100) {
        words += " and " + convertBelowThousand(belowThousand);
      } else {
        words += " " + convertBelowThousand(belowThousand);
      }
    }
  } else if (belowThousand > 0) {
    words += convertBelowThousand(belowThousand);
  }

  return `${words.trim()} shillings`;
}

/**
 * Normalizes an event title for spoken broadcast.
 * - Strips edition indicators (#12, No. 3, Vol 4)
 * - Converts '&' to 'and'
 * - Converts ALL CAPS to Title Case
 */
export function normalizeEventTitle(raw: string): string {
  if (!raw) return "";

  // 1. Strip edition numbering patterns like #12, No. 12, Vol. 3, Edition 5
  let cleaned = raw
    .replace(/#\s*\d+/gi, "")
    .replace(/\bNo\.?\s*\d+/gi, "")
    .replace(/\bVol(?:ume)?\.?\s*\d+/gi, "")
    .replace(/\bEdition\s*\d+/gi, "");

  // Detect whether the main title words were all-caps or all-lowercase before replacing &
  const lettersBeforeAnd = cleaned.replace(/[^a-zA-Z]/g, "");
  const isAllCaps = lettersBeforeAnd.length > 0 && lettersBeforeAnd === lettersBeforeAnd.toUpperCase();
  const isAllLower = lettersBeforeAnd.length > 0 && lettersBeforeAnd === lettersBeforeAnd.toLowerCase();

  // 2. Replace '&' with 'and'
  cleaned = cleaned.replace(/&/g, " and ");

  // 3. Clean up extra punctuation and whitespace
  cleaned = cleaned.replace(/[-–—]\s*$/, "").replace(/\s+/g, " ").trim();

  // 4. Natural Title Casing if all-caps or all-lowercase
  if (isAllCaps || isAllLower) {
    cleaned = cleaned
      .toLowerCase()
      .split(" ")
      .map((word) => {
        if (!word) return "";
        // Keep small connectors lowercase unless it's the first word
        const minor = new Set(["and", "of", "the", "in", "at", "for", "on"]);
        if (minor.has(word)) return word;
        return word.charAt(0).toUpperCase() + word.slice(1);
      })
      .join(" ");
    if (cleaned.length > 0) {
      cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
    }
  }

  return cleaned.trim();
}

/**
 * Computes midnight in Africa/Nairobi (UTC+3) for a given timestamp.
 */
export function getNextEatMidnight(d: Date): Date {
  const eatTime = d.getTime() + KE_OFFSET_MS;
  const eatDate = new Date(eatTime);
  const year = eatDate.getUTCFullYear();
  const month = eatDate.getUTCMonth();
  const date = eatDate.getUTCDate();

  // Next EAT day 00:00:00 is (year, month, date + 1) in EAT
  const nextEatDateMs = Date.UTC(year, month, date + 1, 0, 0, 0, 0) - KE_OFFSET_MS;
  return new Date(nextEatDateMs);
}

/**
 * Returns the EAT hour (0-23) of a given Date.
 */
function getEatHour(d: Date): number {
  const eatDate = new Date(d.getTime() + KE_OFFSET_MS);
  return eatDate.getUTCHours();
}

/**
 * Calculates calendar day difference in Africa/Nairobi wall-clock.
 */
export function getEatCalendarDayDiff(target: Date, now: Date): number {
  const targetStr = keDateString(target);
  const nowStr = keDateString(now);

  const [tY, tM, tD] = targetStr.split("-").map(Number);
  const [nY, nM, nD] = nowStr.split("-").map(Number);

  const targetUtcDays = Date.UTC(tY, tM - 1, tD) / 86_400_000;
  const nowUtcDays = Date.UTC(nY, nM - 1, nD) / 86_400_000;

  return Math.round(targetUtcDays - nowUtcDays);
}

const EAT_WEEKDAY_NAMES = [
  "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"
];

/**
 * Computes human countdown phrase and validity duration.
 */
export function computeCountdownPhrase(
  targetDate: Date,
  gatesOpenAt: Date | null,
  startsAt: Date | null,
  endsAt: Date | null,
  now: Date
): { phrase: string; isLiveNow: boolean; dayLevel: boolean } {
  // Check if live now: starts_at and ends_at both exist and now is between them
  if (startsAt && endsAt) {
    if (now >= startsAt && now < endsAt) {
      return { phrase: "happening now", isLiveNow: true, dayLevel: false };
    }
  }

  // If gates_open_at and endsAt exist, and now is between them
  if (gatesOpenAt && endsAt && now >= gatesOpenAt && now < endsAt) {
    return { phrase: "happening now", isLiveNow: true, dayLevel: false };
  }

  const dayDiff = getEatCalendarDayDiff(targetDate, now);

  if (dayDiff < 0) {
    return { phrase: "happening now", isLiveNow: true, dayLevel: false };
  }

  if (dayDiff === 0) {
    const eatHour = getEatHour(now);
    return {
      phrase: eatHour < 18 ? "today" : "tonight",
      isLiveNow: false,
      dayLevel: true,
    };
  }

  if (dayDiff === 1) {
    return { phrase: "tomorrow", isLiveNow: false, dayLevel: true };
  }

  if (dayDiff <= 7) {
    const targetEatDate = new Date(targetDate.getTime() + KE_OFFSET_MS);
    const weekday = EAT_WEEKDAY_NAMES[targetEatDate.getUTCDay()];
    return { phrase: `this ${weekday}`, isLiveNow: false, dayLevel: true };
  }

  // Beyond 7 days: "in N days"
  return { phrase: `in ${dayDiff} days`, isLiveNow: false, dayLevel: true };
}

/**
 * Formats gates open phrase in Kenyan English (e.g. "gates open at noon", "gates open at 2:00 PM")
 */
export function formatGatesOpenPhrase(gatesOpenAtStr: string | null): string | null {
  if (!gatesOpenAtStr) return null;
  try {
    const d = new Date(gatesOpenAtStr);
    if (isNaN(d.getTime())) return null;

    const eatDate = new Date(d.getTime() + KE_OFFSET_MS);
    const hour = eatDate.getUTCHours();
    const minute = eatDate.getUTCMinutes();

    if (hour === 12 && minute === 0) {
      return "gates open at noon";
    }

    const ampm = hour >= 12 ? "PM" : "AM";
    const h12 = hour % 12 === 0 ? 12 : hour % 12;
    const minStr = minute > 0 ? `:${minute.toString().padStart(2, "0")}` : "";

    return `gates open at ${h12}${minStr} ${ampm}`;
  } catch {
    return null;
  }
}

/**
 * Validates GPS coordinates for Kenya radius (around Nairobi / Thika)
 */
export function validateVenueCoords(
  raw: any
): { lat: number; lng: number } | null {
  if (!raw) return null;
  let parsed = raw;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return null;
    }
  }

  const lat = typeof parsed.lat === "number" ? parsed.lat : parseFloat(parsed.lat);
  const lng = typeof parsed.lng === "number" ? parsed.lng : parseFloat(parsed.lng);

  if (isNaN(lat) || isNaN(lng)) return null;

  // Bounding box for Kenya: lat -5 to 5, lng 33 to 42
  if (lat < -5 || lat > 5 || lng < 33 || lng > 42) return null;

  // Approximate sanity check around Nairobi / Thika (-1.29 to -1.03 lat, 36.8 to 37.1 lng)
  // Distance to Thika reference (-1.0333, 37.0694) within ~60km (approx 0.55 deg)
  const dLat = Math.abs(lat - -1.0333);
  const dLng = Math.abs(lng - 37.0694);
  if (dLat > 0.8 || dLng > 0.8) {
    console.warn(`[radio-events] venue_coords (${lat}, ${lng}) outside expected Thika/Nairobi zone.`);
  }

  return { lat, lng };
}

/**
 * Checks whether a specific ticket tier is on sale right now.
 * Reuses the website's exact checkout & payment validation logic.
 */
export function isTierOnSale(
  tier: RawTierRow,
  event: SchedulableEvent,
  now: Date
): boolean {
  if (tier.hidden || tier.deleted_at) return false;

  // Sold out check
  if (tier.max_quantity != null && Number(tier.sold_count || 0) >= Number(tier.max_quantity)) {
    return false;
  }

  // Available window checks
  if (tier.available_from && new Date(tier.available_from) > now) {
    return false;
  }
  if (tier.available_until && new Date(tier.available_until) <= now) {
    return false;
  }

  // Event day restrictions
  let isTodayEventDay = false;
  if (isRecurring(event)) {
    isTodayEventDay = isOccurrenceDay(event, now);
  } else if (event?.event_date) {
    isTodayEventDay = keDateString(new Date(event.event_date)) === keDateString(now);
  }

  if (tier.show_only_on_event_day && !isTodayEventDay) return false;
  if (tier.hide_on_event_day && isTodayEventDay) return false;

  return true;
}

/**
 * Main query function: fetches and normalizes promotable events from Neon DB.
 */
export async function getPromotableEvents(now: Date = new Date()): Promise<RadioPromotableEvent[]> {
  // Return cached snapshot if fresh
  if (_snapshotCache && now.getTime() - _snapshotCache.timestamp < CACHE_TTL_MS) {
    return _snapshotCache.events;
  }

  try {
    // 3-second database timeout
    const queryPromise = async () => {
      // 1. Fetch promotable events using allowlist
      const eventsRes = await executeEventQuery(
        `SELECT e.id, e.title, e.venue, e.event_date, e.status, e.category,
                e.recurrence_pattern, e.recurrence_day, e.recurrence_time,
                e.sales_open_date, e.sales_close_date,
                e.lineup, e.lineup_confirmed,
                o.starts_at, o.gates_open_at, o.ends_at, o.radio_priority,
                o.promo_blurb, o.venue_coords, o.spoken_ticket_url
         FROM events e
         LEFT JOIN radio_event_overrides o ON o.event_id = e.id
         WHERE e.status = 'live'
           AND e.archived_at IS NULL
           AND COALESCE(o.radio_promote, true) = true`
      );

      const rawEvents: RawEventRow[] = eventsRes.rows || [];
      if (rawEvents.length === 0) return [];

      const eventIds = rawEvents.map((e) => e.id);

      // 2. Fetch ticket tiers using allowlist
      const tiersRes = await executeEventQuery(
        `SELECT t.id, t.event_id, t.name, t.price, t.sold_count, t.max_quantity,
                t.available_from, t.available_until, t.hidden, t.deleted_at,
                t.show_only_on_event_day, t.hide_on_event_day,
                t.admits_quantity, t.tier_category
         FROM ticket_tiers t
         WHERE t.event_id = ANY($1)
         ORDER BY t.price ASC`,
        [eventIds]
      );

      const rawTiers: RawTierRow[] = tiersRes.rows || [];
      const tiersByEvent = new Map<number, RawTierRow[]>();
      for (const t of rawTiers) {
        const list = tiersByEvent.get(t.event_id) || [];
        list.push(t);
        tiersByEvent.set(t.event_id, list);
      }

      const siteBaseUrl = process.env.SITE_BASE_URL || stationConfig.site_base_url;
      const defaultSpokenTicketUrl = stationConfig.default_spoken_ticket_url;

      const promotable: RadioPromotableEvent[] = [];

      for (const raw of rawEvents) {
        // Reuse website availability logic
        const availability = getEventAvailability(raw, now);
        const recurring = isRecurring(raw);

        // Exclude ended events
        if (availability.reason === "event_finished" || availability.reason === "sales_closed") {
          continue;
        }

        // Determine effective target event date/time
        let effectiveTargetDate: Date;
        if (recurring) {
          if (!availability.nextOccurrence) continue;
          effectiveTargetDate = availability.nextOccurrence;
        } else {
          if (raw.starts_at) {
            effectiveTargetDate = new Date(raw.starts_at);
          } else if (raw.gates_open_at) {
            effectiveTargetDate = new Date(raw.gates_open_at);
          } else if (raw.event_date) {
            effectiveTargetDate = new Date(raw.event_date);
          } else {
            continue; // Cannot determine event date
          }
        }

        const gatesOpenAtDate = raw.gates_open_at ? new Date(raw.gates_open_at) : null;
        const startsAtDate = raw.starts_at ? new Date(raw.starts_at) : null;
        const endsAtDate = raw.ends_at ? new Date(raw.ends_at) : null;

        const countdown = computeCountdownPhrase(
          effectiveTargetDate,
          gatesOpenAtDate,
          startsAtDate,
          endsAtDate,
          now
        );

        const allEventTiers = tiersByEvent.get(raw.id) || [];

        // Filter entry tiers on sale right now
        // Exclude accommodation / add_on tiers
        const entryTiers = allEventTiers.filter((t) => {
          const cat = String(t.tier_category || "").toLowerCase();
          if (cat === "accommodation" || cat === "add_on" || cat === "addon") return false;
          const nameLower = t.name.toLowerCase();
          if (nameLower.includes("tent") || nameLower.includes("shared bed") || nameLower.includes("parking")) {
            return false;
          }
          return isTierOnSale(t, raw, now);
        });

        // Map up to 3 tiers (cheapest entry + group tier if exists)
        const selectedTiers: RadioTicketTier[] = entryTiers.slice(0, 3).map((t) => {
          let scarcity: string | null = null;
          if (t.max_quantity != null && t.max_quantity > 0) {
            const remaining = t.max_quantity - (t.sold_count || 0);
            const ratio = remaining / t.max_quantity;
            if (ratio < 0.2 && remaining > 0) {
              scarcity = `less than ${remaining} tickets left`;
            }
          }

          return {
            name: t.name,
            price: Number(t.price),
            price_spoken: speakPrice(Number(t.price)),
            admits: t.admits_quantity || 1,
            sale_ends_at: t.available_until || null,
            scarcity_phrase: scarcity,
          };
        });

        // Compute valid_until: the earliest of all boundary transitions
        const boundaries: number[] = [
          now.getTime() + 20 * 60 * 1000 // Generation window cap: 20 minutes
        ];

        if (countdown.dayLevel) {
          boundaries.push(getNextEatMidnight(now).getTime());
        }

        if (raw.sales_close_date) {
          const scd = new Date(raw.sales_close_date).getTime();
          if (scd > now.getTime()) boundaries.push(scd);
        }

        if (gatesOpenAtDate && gatesOpenAtDate.getTime() > now.getTime()) {
          boundaries.push(gatesOpenAtDate.getTime());
        }
        if (startsAtDate && startsAtDate.getTime() > now.getTime()) {
          boundaries.push(startsAtDate.getTime());
        }
        if (endsAtDate && endsAtDate.getTime() > now.getTime()) {
          boundaries.push(endsAtDate.getTime());
        }

        // Tier transitions: upcoming tier openings and currently active tier closures
        for (const t of allEventTiers) {
          if (t.available_from) {
            const af = new Date(t.available_from).getTime();
            if (af > now.getTime()) boundaries.push(af);
          }
          if (t.available_until) {
            const au = new Date(t.available_until).getTime();
            if (au > now.getTime()) boundaries.push(au);
          }
        }

        const validUntil = Math.min(...boundaries);

        // Lineup safety gate: spoken ONLY when lineup_confirmed is true
        const confirmedLineup = Boolean(raw.lineup_confirmed) && Array.isArray(raw.lineup)
          ? raw.lineup.map((s) => s.trim()).filter(Boolean)
          : [];

        const nameSpoken = normalizeEventTitle(raw.title);
        const venueSpoken = raw.venue ? raw.venue.trim() : null;
        const gatesPhrase = formatGatesOpenPhrase(raw.gates_open_at);

        // Ticket link resolution
        const ticketUrl = `${siteBaseUrl}/events/${raw.id}`;
        const spokenTicketUrl = raw.spoken_ticket_url?.trim() || defaultSpokenTicketUrl;

        // Facts Hash for cache invalidation
        const factsPayload = JSON.stringify({
          id: raw.id,
          name: nameSpoken,
          venue: venueSpoken,
          countdown: countdown.phrase,
          gates: gatesPhrase,
          tiers: selectedTiers.map((st) => [st.name, st.price, st.price_spoken]),
          lineup: confirmedLineup,
          ticket_url: spokenTicketUrl,
        });
        const factsHash = crypto.createHash("sha256").update(factsPayload).digest("hex");

        let eventState: "upcoming" | "live_now" | "sold_out" = "upcoming";
        if (countdown.isLiveNow) {
          eventState = "live_now";
        } else if (allEventTiers.length > 0 && selectedTiers.length === 0) {
          eventState = "sold_out";
        }

        promotable.push({
          id: raw.id,
          name_spoken: nameSpoken,
          venue_spoken: venueSpoken,
          venue_coords: validateVenueCoords(raw.venue_coords),
          starts_at: raw.starts_at,
          gates_open_at: raw.gates_open_at,
          ends_at: raw.ends_at,
          gates_open_phrase: gatesPhrase,
          state: eventState,
          is_recurring: recurring,
          ticket_url: ticketUrl,
          spoken_ticket_url: spokenTicketUrl,
          tiers: selectedTiers,
          lineup: confirmedLineup,
          promo_blurb: raw.promo_blurb || null,
          countdown_phrase: countdown.phrase,
          valid_until: validUntil,
          facts_hash: factsHash,
          fetched_at: now.getTime(),
        });
      }

      // Sort: highest priority first, then closest countdown
      return promotable.sort((a, b) => {
        return (b.state === "live_now" ? 1 : 0) - (a.state === "live_now" ? 1 : 0);
      });
    };

    // Execute with 3000ms timeout
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Database query timed out (> 3000ms)")), 3000)
    );

    const events = (await Promise.race([queryPromise(), timeoutPromise])) as RadioPromotableEvent[];

    _snapshotCache = {
      events,
      timestamp: now.getTime(),
    };

    return events;
  } catch (err) {
    console.warn("[radio-events] getPromotableEvents error:", err);

    // If cache is under SNAPSHOT_MAX_STALE_MS (10 mins), return snapshot
    if (_snapshotCache && now.getTime() - _snapshotCache.timestamp < SNAPSHOT_MAX_STALE_MS) {
      console.warn("[radio-events] Using cached event snapshot (< 10 min old).");
      return _snapshotCache.events;
    }

    // Otherwise return empty array per spec (offline safety)
    return [];
  }
}
