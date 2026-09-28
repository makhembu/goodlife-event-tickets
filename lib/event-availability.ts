/**
 * Event sellability, in exactly one place.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * The rule "can this event take money right now?" was written four separate
 * times: `isEventSellable()` plus a copy-pasted pair of sales-window checks in
 * `api/payhero/initialize`, `api/payments/till-submit` and
 * `api/tickets/rsvp-free`. They happened to agree, but they agreed by
 * coincidence, and the three routes had drifted into three different error
 * strings for the same condition. This module is the single definition; the
 * routes now only choose the wording.
 *
 * TWO CONCEPTS THAT WERE CONFLATED
 * --------------------------------
 * `events.is_active` used to mean BOTH "this is the event the homepage should
 * show" AND "this event may be sold". Those are unrelated. GOODLIFE 4 is the
 * homepage flagship; SUNDAY PARK & CHILL is a weekly mini-festival that should
 * be sellable without ever displacing the flagship. Since `fetchActiveEvent()`
 * is `WHERE is_active = TRUE LIMIT 1`, conflating them meant a recurring event
 * could either be unsellable or could hijack the homepage. So:
 *
 *   - `is_active`  -> now means ONLY "this is the default homepage event".
 *                     Read exclusively by `fetchActiveEvent`.
 *   - sellability  -> now means status + explicit sales window + recurrence.
 *                     `is_active` is deliberately NOT consulted here.
 *
 * RECURRENCE
 * ----------
 * `recurrence_pattern` / `recurrence_day` / `recurrence_time` already existed
 * as columns, but nothing in the codebase ever read them to make a decision -
 * they were only ever interpolated into the label "EVERY SUNDAY | 2:00 PM".
 * An event row has exactly one `event_date`, and `event_date` gates nothing
 * anywhere, so a "weekly" series did not actually recur: it needed a human to
 * bump the date by hand every week or it silently sat stale.
 *
 * The rule implemented here: for a recurring event, online sales are CLOSED on
 * each occurrence day and OPEN on every other day, reopening automatically at
 * 00:00 the following morning. That self-closes after every session and needs
 * no manual intervention, which is the whole point of a weekly series.
 *
 * An explicitly set `sales_open_date` / `sales_close_date` still applies and
 * is applied as an additional restriction, never as a replacement - so an
 * admin can always hard-close a series without editing code.
 *
 * TIMEZONE
 * ---------
 * All day-of-week maths is done in Africa/Nairobi wall clock, not UTC and not
 * the server's local time. Vercel runs in UTC, so a naive `getDay()` would
 * resolve "Sunday 14:00" to 17:00 in Nairobi and flip the close boundary by
 * three hours. Africa/Nairobi is a fixed UTC+3 with no DST, which is what
 * makes a constant offset correct here rather than a shortcut.
 */

import { KE_TZ } from "./utils";

/**
 * Fixed offset for Africa/Nairobi. Correct because the zone has observed
 * UTC+3 with no daylight saving since 1963; see the TIMEZONE note above.
 */
const KE_OFFSET_MS = 3 * 60 * 60 * 1000;

const WEEKDAYS: Record<string, number> = {
  sunday: 0, sun: 0,
  monday: 1, mon: 1,
  tuesday: 2, tue: 2, tues: 2,
  wednesday: 3, wed: 3,
  thursday: 4, thu: 4, thur: 4, thurs: 4,
  friday: 5, fri: 5,
  saturday: 6, sat: 6,
};

/** Only `weekly` is supported today. See `cadenceFor`. */
export type RecurrencePattern = "none" | "weekly" | "biweekly" | "monthly";

/** The minimum an event row needs for this module to reason about it. */
export type SchedulableEvent = {
  status?: string | null;
  sales_open_date?: string | null;
  sales_close_date?: string | null;
  recurrence_pattern?: string | null;
  recurrence_day?: string | null;
  recurrence_time?: string | null;
} | null | undefined;

export type UnavailabilityReason =
  | "not_live"
  | "not_open_yet"
  | "sales_closed"
  | "occurrence_day";

export type EventAvailability = {
  sellable: boolean;
  /** null when sellable. */
  reason: UnavailabilityReason | null;
  /** Strictly-future next occurrence, or null when not recurring. */
  nextOccurrence: Date | null;
};

function parseWeekday(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const v = WEEKDAYS[String(raw).trim().toLowerCase()];
  return v === undefined ? null : v;
}

/** Accepts "14:00", "14:00:00", "2:00 PM", "2pm". */
function parseTimeOfDay(raw: string | null | undefined): { hour: number; minute: number } | null {
  if (!raw) return null;
  const s = String(raw).trim().toLowerCase();

  const hms = /^(\d{1,2}):(\d{2})/.exec(s);
  if (hms) return { hour: Number(hms[1]), minute: Number(hms[2]) };

  const ampm = /^(\d{1,2})\s*(am|pm)$/.exec(s);
  if (ampm) {
    let hour = Number(ampm[1]) % 12;
    if (ampm[2] === "pm") hour += 12;
    return { hour, minute: 0 };
  }
  return null;
}

/**
 * Interval in days between occurrences, or null when the pattern is not
 * something we can schedule.
 *
 * Only `weekly` is implemented. `biweekly` would need a stored anchor week to
 * decide WHICH fortnight, and `monthly` would need an ordinal ("2nd Sunday"),
 * and neither is recorded anywhere in the schema. Rather than guess - and
 * rather than silently degrade a fortnightly or monthly series to weekly, which
 * would sell the wrong sessions - an unsupported pattern is treated as
 * non-recurring and falls back to the explicit sales-date window, with a dev
 * warning. No event currently uses either pattern.
 */
function cadenceFor(pattern: string | null | undefined): number | null {
  return String(pattern ?? "none").trim().toLowerCase() === "weekly" ? 7 : null;
}

function toKeWallClock(d: Date): Date {
  return new Date(d.getTime() + KE_OFFSET_MS);
}

function fromKeWallClock(d: Date): Date {
  return new Date(d.getTime() - KE_OFFSET_MS);
}

function isSupportedPattern(pattern: string | null | undefined): boolean {
  const p = String(pattern ?? "none").trim().toLowerCase();
  return p === "none" || p === "weekly";
}

/**
 * The next occurrence strictly after `from`, as a real UTC Date.
 *
 * Returns null when the event is not recurring, or when its recurrence columns
 * are missing/unparseable - in which case callers fall back to the explicit
 * sales-date window rather than guessing a schedule.
 */
export function resolveNextOccurrence(
  event: SchedulableEvent,
  from: Date = new Date()
): Date | null {
  if (!event) return null;

  const pattern = String(event.recurrence_pattern ?? "none").trim().toLowerCase();
  if (!isSupportedPattern(pattern)) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        `[event-availability] recurrence_pattern="${pattern}" is not supported yet; ` +
          `treating the event as non-recurring. Only "weekly" is implemented.`
      );
    }
    return null;
  }
  if (cadenceFor(pattern) === null) return null;

  const weekday = parseWeekday(event.recurrence_day);
  const time = parseTimeOfDay(event.recurrence_time);
  if (weekday === null || !time) return null;
  if (time.hour > 23 || time.minute > 59) return null;

  // Work in EAT wall-clock: the UTC getters on this shifted Date read Nairobi
  // local fields, which is what recurrence_day/recurrence_time are written in.
  const ke = toKeWallClock(from);
  const daysAhead = (weekday - ke.getUTCDay() + 7) % 7;

  // Candidate = that weekday at the recurrence time, in EAT wall clock.
  const candidateKe = new Date(
    Date.UTC(ke.getUTCFullYear(), ke.getUTCMonth(), ke.getUTCDate() + daysAhead, time.hour, time.minute, 0, 0)
  );

  // Strictly in the future. If today's slot has already passed, roll a week.
  if (candidateKe.getTime() <= ke.getTime()) {
    candidateKe.setUTCDate(candidateKe.getUTCDate() + 7);
  }

  return fromKeWallClock(candidateKe);
}

/** True when `now` falls on one of this event's occurrence days (EAT). */
export function isOccurrenceDay(event: SchedulableEvent, now: Date = new Date()): boolean {
  if (!event) return false;
  if (cadenceFor(event.recurrence_pattern) === null) return false;

  const weekday = parseWeekday(event.recurrence_day);
  if (weekday === null) return false;

  return toKeWallClock(now).getUTCDay() === weekday;
}

/** Human-readable next occurrence, e.g. "Sun 28 Sep, 2:00 PM". */
export function formatOccurrence(occurrence: Date | null): string {
  if (!occurrence) return "no scheduled session";
  return occurrence.toLocaleString("en-KE", {
    timeZone: KE_TZ,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * The one true answer to "may this event take money right now?".
 *
 * `events.is_active` is intentionally NOT part of this decision - it means
 * "homepage event" only. See the note at the top of the file.
 */
export function getEventAvailability(
  event: SchedulableEvent,
  now: Date = new Date()
): EventAvailability {
  const nextOccurrence = resolveNextOccurrence(event, now);

  if (!event) return { sellable: false, reason: "not_live", nextOccurrence };

  // A closed event must never take money. This is checked before the date
  // window on purpose: GOODLIFE XP is status='closed' with no sales_close_date,
  // so a date-only check would happily admit a finished event.
  if (event.status !== "live" && event.status !== "scheduled") {
    return { sellable: false, reason: "not_live", nextOccurrence };
  }

  // Explicit admin-set window, applied as an extra restriction.
  if (event.sales_open_date && now < new Date(event.sales_open_date)) {
    return { sellable: false, reason: "not_open_yet", nextOccurrence };
  }
  if (event.sales_close_date && now > new Date(event.sales_close_date)) {
    return { sellable: false, reason: "sales_closed", nextOccurrence };
  }

  // Recurring series: sales shut on session day and reopen on their own.
  if (isOccurrenceDay(event, now)) {
    return { sellable: false, reason: "occurrence_day", nextOccurrence };
  }

  return { sellable: true, reason: null, nextOccurrence };
}

const DEFAULT_MESSAGES: Record<UnavailabilityReason, string> = {
  not_live: "Ticket sales are not open for this event.",
  not_open_yet: "Ticket sales have not opened yet for this event.",
  sales_closed: "Online ticket sales have closed. Gate tickets available at entrance.",
  occurrence_day: "Today's session is under way. Online tickets reopen once it ends.",
};

/**
 * Map a reason to the wording a given endpoint should show. The condition lives
 * in one place; only the phrasing is per-route, because the free-RSVP route has
 * always said "reservations" where the paid routes say "ticket sales".
 */
export function unavailabilityMessage(
  reason: UnavailabilityReason,
  overrides: Partial<Record<UnavailabilityReason, string>> = {}
): string {
  return overrides[reason] ?? DEFAULT_MESSAGES[reason];
}
