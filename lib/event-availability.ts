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
 * Mini-festivals come in four shapes, and each needs different handling:
 *
 *   none      - ONE DAY ONLY. Happens on `event_date` and nowhere else.
 *               Sales close once that day has passed, which is what the date
 *               was always supposed to mean. Previously it closed never.
 *   daily     - EVERY DAY. There is no single "the day it happens" to close
 *               on, so sales stay open continuously.
 *   weekly    - every week on `recurrence_day`. Sales close on that day and
 *               reopen at 00:00 the next morning, automatically.
 *   biweekly  - every second week, alternating on and off, anchored to the week
 *               containing `event_date`.
 *
 * The weekly/biweekly rule is the interesting one: it self-closes after every
 * session and needs no manual intervention, which is the whole point of a
 * series. An explicitly set `sales_open_date` / `sales_close_date` still
 * applies to every pattern, as an additional restriction and never as a
 * replacement - so an admin can always hard-close any event without editing
 * code.
 *
 * `monthly` is deliberately not supported: it would need an ordinal ("2nd
 * Sunday") and the schema has nowhere to record one, so guessing would sell
 * the wrong sessions. An unsupported pattern degrades to the non-recurring
 * path with a dev warning rather than failing quietly.
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
  /** Anchors a `biweekly` series to a specific fortnight, and IS the day a
   *  one-off (`none`) event happens. */
  event_date?: string | null;
  sales_open_date?: string | null;
  sales_close_date?: string | null;
  recurrence_pattern?: string | null;
  recurrence_day?: string | null;
  recurrence_time?: string | null;
  /** Recurring series vs. one-off flagship. Decides whether `status` is even
   *  the right field to ask. See `publicState`. */
  category?: string | null;
  archived_at?: string | null;
} | null | undefined;

export type UnavailabilityReason =
  | "not_live"
  | "not_open_yet"
  | "sales_closed"
  | "occurrence_day"
  | "event_finished";

export type EventAvailability = {
  sellable: boolean;
  /** null when sellable. */
  reason: UnavailabilityReason | null;
  /** Strictly-future next occurrence, or null when not recurring. */
  nextOccurrence: Date | null;
};

/**
 * Which page the public site should render for an event.
 *
 * `recap`      - it happened. Recap copy, gallery, radio.
 * `coming_soon`- announced and real, tickets not on sale yet. Countdown.
 * `checkout`   - take money now.
 * `unavailable`- archived; not routable at all.
 */
export type PublicState = "recap" | "coming_soon" | "checkout" | "unavailable";

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
 * `daily`, `weekly` and `biweekly` are supported. `biweekly` additionally needs
 * an anchor to decide WHICH fortnight, which is taken from `event_date`; with no
 * anchor it degrades to `weekly` with a dev warning rather than guessing an
 * arbitrary one. `monthly` would need an ordinal ("2nd Sunday"), which the
 * schema does not record, so it is still unsupported and falls back to the
 * explicit sales-date window.
 */
function cadenceFor(pattern: string | null | undefined): number | null {
  switch (String(pattern ?? "none").trim().toLowerCase()) {
    case "daily": return 1;
    case "weekly": return 7;
    case "biweekly": return 14;
    default: return null;
  }
}

const SUPPORTED = new Set(["none", "daily", "weekly", "biweekly"]);

/**
 * Whether this pattern has a meaningful "the day it happens".
 *
 * This distinction is load-bearing. The sales rule closes online sales on the
 * occurrence day and reopens the next morning. For `weekly`/`biweekly` there is
 * exactly one such day, so that rule is right. For `daily` EVERY day is an
 * occurrence day, so the same rule would close sales permanently and the
 * festival could never sell a ticket - the opposite of what "every day" means.
 * A daily festival therefore stays open, subject to status and any explicit
 * sales window.
 */
function hasOccurrenceDay(pattern: string | null | undefined): boolean {
  const p = String(pattern ?? "none").trim().toLowerCase();
  return p === "weekly" || p === "biweekly";
}

/** True when the event runs on a repeating schedule rather than one fixed day. */
export function isRecurring(event: SchedulableEvent): boolean {
  if (!event) return false;
  return cadenceFor(event.recurrence_pattern) !== null;
}

/**
 * Whether the recurrence columns are complete enough to schedule on.
 *
 * Both `resolveNextOccurrence` and `isOccurrenceDay` must agree on this, or the
 * module contradicts itself: an event with a `recurrence_day` but no
 * `recurrence_time` was producing a null next-occurrence (so the caller fell
 * back to the explicit sales window) while `isOccurrenceDay` still returned
 * true - closing sales for the whole of every Sunday with no admin-visible
 * explanation and nothing to debug. A malformed row is not a schedule, so the
 * occurrence close is skipped and the explicit window governs, which is the
 * same documented fallback the resolver already took.
 */
function isSchedulable(event: SchedulableEvent): boolean {
  if (!event) return false;
  if (cadenceFor(event.recurrence_pattern) === null) return false;

  const time = parseTimeOfDay(event.recurrence_time);
  if (!time || time.hour > 23 || time.minute > 59) return false;

  // `daily` matches every day, so it needs no weekday.
  if (cadenceFor(event.recurrence_pattern) === 1) return true;
  return parseWeekday(event.recurrence_day) !== null;
}

function toKeWallClock(d: Date): Date {
  return new Date(d.getTime() + KE_OFFSET_MS);
}

function fromKeWallClock(d: Date): Date {
  return new Date(d.getTime() - KE_OFFSET_MS);
}

/**
 * The EAT calendar day of an instant, as "YYYY-MM-DD".
 *
 * Used to compare an event's DAY against today rather than comparing instants,
 * because the admin editor stores a bare date and midnight-UTC is not midnight
 * in Nairobi. See the one-off gate in `getEventAvailability`.
 */
export function keDateString(d: Date): string {
  return d.toLocaleDateString("en-CA", { timeZone: KE_TZ }); // en-CA is ISO YYYY-MM-DD
}

/**
 * Days from the start of a Monday-starting week to `weekday` (0 = Sunday).
 *
 * Sunday is the LAST day of a Monday-starting week, not the first, so this is
 * `(weekday + 6) % 7` and not `weekday`. Getting that wrong silently resolves a
 * Sunday session to the Monday of the same week - an off-by-one that is
 * invisible in a diff and only shows up as a session date one day early.
 */
function daysSinceMonday(weekday: number): number {
  return (weekday + 6) % 7;
}

/**
 * Index of the Monday-starting week containing this EAT wall-clock date.
 * Used to decide which fortnight a `biweekly` event falls on.
 */
function weekIndexKe(ke: Date): number {
  const midnight = Date.UTC(ke.getUTCFullYear(), ke.getUTCMonth(), ke.getUTCDate());
  const mondayOffset = daysSinceMonday(ke.getUTCDay());
  return Math.floor((midnight - mondayOffset * 86400000) / (7 * 86400000));
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
  if (!SUPPORTED.has(pattern)) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        `[event-availability] recurrence_pattern="${pattern}" is not supported yet; ` +
          `treating the event as non-recurring. Supported: daily, weekly, biweekly, none.`
      );
    }
    return null;
  }

  const step = cadenceFor(pattern);
  if (step === null) return null;

  const time = parseTimeOfDay(event.recurrence_time);
  if (!time || time.hour > 23 || time.minute > 59) return null;

  // Work in EAT wall-clock: the UTC getters on this shifted Date read Nairobi
  // local fields, which is what recurrence_day/recurrence_time are written in.
  const ke = toKeWallClock(from);

  // `daily` has no weekday to match - every day qualifies. 0 is a stand-in
  // there rather than a null check, because the only branch below that reads
  // `weekday` is the fortnight anchor, which is never `daily`.
  const weekday = step === 1 ? 0 : parseWeekday(event.recurrence_day);
  if (weekday === null) return null;

  const daysAhead = step === 1 ? 0 : (weekday - ke.getUTCDay() + 7) % 7;

  // Candidate = that day at the recurrence time, in EAT wall clock.
  const candidateKe = new Date(
    Date.UTC(ke.getUTCFullYear(), ke.getUTCMonth(), ke.getUTCDate() + daysAhead, time.hour, time.minute, 0, 0)
  );

  // Strictly in the future. If today's slot has already passed, roll one step.
  if (candidateKe.getTime() <= ke.getTime()) {
    candidateKe.setUTCDate(candidateKe.getUTCDate() + step);
  }

  // Fortnightly: the anchor decides which fortnight is "on". Two distinct
  // problems to handle - parity, and an anchor that lies in the future.
  //
  // The parity loop below can only ever nudge by one week ((x+1)%2 always flips
  // parity), so it cannot walk forward to a future anchor. Left alone, an event
  // anchored to June 2027 would report its next session as a Sunday eight
  // months early, and a surface showing that date would advertise a session
  // before the series has started. So jump straight to the anchor's week first.
  if (step === 14) {
    const anchor = event.event_date ? new Date(event.event_date) : null;
    if (!anchor || Number.isNaN(anchor.getTime())) {
      if (process.env.NODE_ENV !== "production") {
        console.warn(
          `[event-availability] biweekly event has no event_date to anchor the ` +
            `fortnight to; treating it as weekly.`
        );
      }
    } else {
      const anchorKe = toKeWallClock(anchor);
      const anchorWeek = weekIndexKe(anchorKe);

      if (weekIndexKe(candidateKe) < anchorWeek) {
        // The series has not started yet. The first on-week is the anchor's own
        // week, so snap to the chosen weekday inside it.
        const anchorMonday = new Date(
          Date.UTC(
            anchorKe.getUTCFullYear(),
            anchorKe.getUTCMonth(),
            anchorKe.getUTCDate() - daysSinceMonday(anchorKe.getUTCDay())
          )
        );
        candidateKe.setTime(anchorMonday.getTime());
        candidateKe.setUTCDate(candidateKe.getUTCDate() + daysSinceMonday(weekday));
        candidateKe.setUTCHours(time.hour, time.minute, 0, 0);

        // Defensive only: the anchor week is strictly after the current week in
        // this branch, so this cannot fire. Kept so the function's
        // strictly-in-the-future contract holds unconditionally.
        if (candidateKe.getTime() <= ke.getTime()) {
          candidateKe.setUTCDate(candidateKe.getUTCDate() + 7);
        }
      } else {
        // Adding one week always flips parity, so a single step always suffices;
        // the guard exists only to bound the loop if that invariant is broken.
        if ((weekIndexKe(candidateKe) - anchorWeek) % 2 !== 0) {
          candidateKe.setUTCDate(candidateKe.getUTCDate() + 7);
        }
      }
    }
  }

  return fromKeWallClock(candidateKe);
}

/**
 * True when `now` falls on one of this event's occurrence days (EAT).
 *
 * Only meaningful for patterns that actually have a single occurrence day
 * (`weekly`, `biweekly`); see `hasOccurrenceDay`.
 */
export function isOccurrenceDay(event: SchedulableEvent, now: Date = new Date()): boolean {
  if (!event) return false;
  if (!hasOccurrenceDay(event.recurrence_pattern)) return false;
  if (!isSchedulable(event)) return false;

  const weekday = parseWeekday(event.recurrence_day);
  if (weekday === null) return false;

  const ke = toKeWallClock(now);
  if (ke.getUTCDay() !== weekday) return false;

  if (cadenceFor(event.recurrence_pattern) === 14) {
    const anchor = event.event_date ? new Date(event.event_date) : null;
    // With no anchor, treat the current week as an "on" week rather than
    // closing the event on a coin flip.
    if (!anchor || Number.isNaN(anchor.getTime())) return true;
    return (weekIndexKe(ke) - weekIndexKe(toKeWallClock(anchor))) % 2 === 0;
  }

  return true;
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
 * The canonical `events.status`, folding the one legacy value that is still in
 * the wild.
 *
 * The admin event editor's lifecycle dropdown used to offer
 * `<option value="active">` labelled "🟢 Active / Live (Ticket sales open)".
 * Any event saved through it therefore has `status = 'active'` in the database,
 * and `getEventAvailability` tested `status !== "live" && status !== "scheduled"`
 * — so those events were **unable to take a single shilling**: the page rendered
 * a full checkout and every payment was refused as "not live".
 *
 * `'active'` is not some foreign value; it is the app's own earlier spelling of
 * `live` (it is still in the `EventDetails` type union), so it is normalised
 * here rather than left to silently block sales. The dropdown now writes `live`,
 * so this can be deleted once no rows carry `active`:
 *
 *   UPDATE events SET status = 'live' WHERE status = 'active';
 */
export function canonicalStatus(raw: string | null | undefined): string {
  const s = String(raw ?? "").trim().toLowerCase();
  return s === "active" ? "live" : s;
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
  const status = canonicalStatus(event.status);
  if (status !== "live" && status !== "scheduled") {
    return { sellable: false, reason: "not_live", nextOccurrence };
  }

  // Explicit admin-set window, applied as an extra restriction.
  if (event.sales_open_date && now < new Date(event.sales_open_date)) {
    return { sellable: false, reason: "not_open_yet", nextOccurrence };
  }
  if (event.sales_close_date && now > new Date(event.sales_close_date)) {
    return { sellable: false, reason: "sales_closed", nextOccurrence };
  }

  // A one-off event happens on its `event_date` and nowhere else. This is what
  // "just one day" means, and it was previously unenforced: `event_date` gated
  // nothing anywhere, so a one-off with a past date stayed sellable forever.
  //
  // Compared as EAT CALENDAR DAYS, not instants, and that distinction is not
  // cosmetic. The admin event editor writes a bare "YYYY-MM-DD" into a
  // `TIMESTAMP WITH TIME ZONE` column, which Postgres parses as midnight in the
  // session timezone (UTC) - so GOODLIFE 4's event_date "2026-11-07" becomes
  // 2026-11-07T00:00Z, which is 03:00 EAT on the event day. Comparing instants
  // therefore closed sales at 3am on the day of a 2pm festival, refusing the
  // gate-VIP tier that is explicitly sold ON the event day. Comparing the EAT
  // date string means the event sells through its own day and closes at the
  // following midnight, which is what "one day only" means.
  //
  // The precise closing time within the day is the admin's to set via
  // sales_close_date, which is checked above and still wins.
  if (
    !isRecurring(event) &&
    event.event_date &&
    !Number.isNaN(new Date(event.event_date).getTime()) &&
    keDateString(now) > keDateString(new Date(event.event_date))
  ) {
    return { sellable: false, reason: "event_finished", nextOccurrence };
  }

  // Recurring series: sales shut on session day and reopen on their own.
  // `isOccurrenceDay` is false for `daily` by design - see `hasOccurrenceDay`.
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
  event_finished: "This one-day event has finished. Online sales are closed.",
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

/**
 * Is this event hidden from the public site?
 *
 * Shares `publicState`'s rule, and exists as a separate export because the
 * editions switcher and the mini-festival promo need to answer exactly this
 * question about *other* events, without paying for a full availability
 * evaluation of each one.
 *
 * `closed` is exempt for the reason documented in `publicState`: a concluded
 * edition still gets its recap page even if a stamp also says archived.
 */
export function isHiddenFromSite(event: SchedulableEvent): boolean {
  if (!event) return true;
  const status = canonicalStatus(event.status);
  if (status === "closed") return false;
  return status === "archived" || !!event.archived_at;
}

/**
 * The one answer to "which page does the public site show for this event?".
 *
 * WHY THIS IS NOT JUST `status === 'closed'`
 * ------------------------------------------
 * The homepage used to read `status` directly and collapse `closed` and
 * `scheduled` into one page, which told customers a festival that had not
 * happened yet had "CONCLUDED" and thanked them for coming. Two things were
 * wrong with that and only one of them was the wording:
 *
 *  1. `scheduled` and `closed` are genuinely different states, so they need
 *     different pages.
 *  2. For a RECURRING MINI FESTIVAL, `status` is not the right field at all.
 *     `status` is a hand-set label an admin types once and nothing ever
 *     updates, whereas whether a weekly Park & Chill is on is computed fresh
 *     from `recurrence_day` / `recurrence_time` on every request (see
 *     `getEventAvailability`). A series parked on `scheduled` is sellable today
 *     - `getEventAvailability` treats `scheduled` as a live status precisely so
 *     an edition can be announced before its sales window opens - so gating the
 *     page on `status` would have put a buyable mini festival behind a
 *     countdown while the payment API kept taking its money.
 *
 * So: a mini festival's on/off day is never taken from `status`. It always
 * reaches a selling page, and the recurrence engine (plus the existing
 * unavailability messages) decides what it is allowed to buy. One-off flagships
 * use `status` and the sales window.
 *
 * Two reasons deliberately do NOT route to checkout even though the page would
 * be able to render one:
 *
 *  - `not_live` - nothing can pay, so there is nothing to sell.
 *  - `not_open_yet` - the admin has explicitly set a future open date, and the
 *    payment routes already enforce it.
 *
 * `occurrence_day` and `sales_closed` DO route to checkout, on purpose. Both
 * have specific, non-alarming messages ("Today's session is under way. Online
 * tickets reopen once it ends." / "Online ticket sales have closed. Gate
 * tickets available at entrance.") and both can be real, correct states for an
 * event that is otherwise open - stopping the customer from reading why is
 * worse than letting them read it. `scripts/check-public-state.ts` encodes this
 * distinction as an explicit allowlist so it cannot drift by accident.
 *
 * NOTE this never mutates `status`. An event that auto-opens when its
 * `sales_open_date` passes stays `scheduled` on purpose: rewriting it to `live`
 * would hand the next edition's sales window to this one and destroy the
 * distinction this function exists to preserve.
 */
export function publicState(
  event: SchedulableEvent,
  now: Date = new Date()
): PublicState {
  if (!event) return "unavailable";

  const status = canonicalStatus(event.status);

  // Archived means hidden. Previously `app/page.tsx` only special-cased
  // `closed`/`scheduled`, so an archived event fell through to the checkout
  // page and stayed publicly buyable.
  //
  // A CLOSED event is deliberately exempt, and that is not a loophole. The
  // dashboard's "END / CLOSE" button used to call `archiveEvent`, which stamped
  // `archived_at = NOW()` as well as `status = 'closed'` - so concluding an
  // edition also hid it, and `/` began returning 404 for a festival that had
  // simply finished. The UI never offered "closed AND archived" as a state an
  // admin chose, and the live database is full of rows that have it because of
  // that bug. Reading a `closed` row as a recap page is the safe direction: it
  // can never sell anything, and it is the page the admin's own confirm dialog
  // promised ("visitors will see the Event Concluded page").
  //
  // `scripts/repair-event-status.js` clears those accidental stamps; once it
  // has run this exemption can be removed.
  if (status === "closed") return "recap";
  if (status === "archived" || event.archived_at) return "unavailable";

  const { reason } = getEventAvailability(event, now);

  // `not_live` means NO payment route will accept this event: its status is
  // blank, or a value nothing recognises. Falling through to `checkout` here
  // was the last remaining way for the page to advertise a price ladder that
  // all three payment routes then refuse - the exact "page says buy, payment
  // says no" failure this function exists to prevent. It also applied to mini
  // festivals, which is why the old mini branch had to special-case it.
  //
  // `coming_soon` is the honest landing spot: it claims nothing is on sale, it
  // keeps the URL and the waitlist working, and `app/page.tsx` promotes it to
  // checkout by itself the moment the admin sets a status the payment layer
  // accepts. Returning `unavailable` (a 404) would instead break a bookmark for
  // an event that merely has not been set up yet.
  if (reason === "not_live") return "coming_soon";

  // Recurring series: reach the page, let the recurrence engine decide which
  // passes it is selling today. `not_open_yet` is deliberately NOT waived for
  // minis - an explicit `sales_open_date` is an admin-set window that the
  // payment routes already enforce, and routing to checkout past it would
  // reinstate the same lie on a smaller scale.
  if (event.category === "mini") return reason === "not_open_yet" ? "coming_soon" : "checkout";

  if (reason === "not_open_yet") return "coming_soon";

  // A one-off flagship whose day has passed but which nobody marked `closed` is
  // still being advertised as buyable. Payment already refused it, so showing
  // the recap is strictly more honest than a dead checkout.
  if (reason === "event_finished") return "recap";

  return "checkout";
}
