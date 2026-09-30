"use client";

import { useEffect, useMemo, useState } from "react";

/** Kenya is UTC+3 with no daylight saving, so a fixed offset is correct year-round. */
const EAT_OFFSET_MS = 3 * 60 * 60 * 1000;

export interface EatToday {
  /** 0 = Sunday .. 6 = Saturday, in EAT. */
  dayOfWeek: number;
  /** `YYYY-MM-DD` in EAT. */
  dateKey: string;
  /**
   * `Date.now()` shifted onto the EAT wall clock and read back as UTC.
   *
   * Naive tier windows (`available_from` / `available_until`) are stored without
   * a timezone and Postgres parses them in the session zone (UTC), so they have
   * to be compared in that same frame. Exposed by the hook rather than computed
   * at the call site so no component has to call `Date.now()` during render,
   * which the React compiler treats as impure.
   */
  eatNowMs: number;
}

function currentEatToday(): EatToday {
  const now = Date.now();
  // Shifted onto EAT and read back as UTC. Deliberately never uses
  // `Date.prototype.getDay()`, which reports the *runtime's* local day: a
  // visitor in Lagos or Los Angeles, or on a phone with a wrong clock, would
  // otherwise get a different answer to "is it the weekend in Kenya" and the
  // weekday-vs-weekend tier rules would flip for them.
  const eat = new Date(now + EAT_OFFSET_MS);
  return {
    dayOfWeek: eat.getUTCDay(),
    dateKey: eat.toISOString().slice(0, 10),
    eatNowMs: now + EAT_OFFSET_MS,
  };
}

/**
 * "Now" in Kenya EAT, refreshed on a short heartbeat and forced to re-render
 * when the EAT day rolls over.
 *
 * WHY THIS EXISTS
 * ---------------
 * `CheckoutClientPage` gates its tier ladder on the day of the week: mini
 * festivals sell a free RSVP on weekdays and paid passes at the weekend, and the
 * flagship hides Early Bird / Advance and shows only Gate passes on event day.
 * That was computed inline inside a `useMemo`, whose dependency list has no way
 * to express "now". Three real failures came out of that:
 *
 *  - It used the *visitor's* timezone offset to reach EAT, so a phone on a
 *    mis-set clock silently swapped weekday and weekend tiers.
 *  - A tab left open past the EAT midnight kept offering yesterday's tiers
 *    until an unrelated state change forced a re-render. On a weekday that
 *    means selling weekend passes all Monday morning.
 *  - A tier's own `available_from` / `available_until` window was effectively
 *    frozen, because `eatDate` was only recomputed when `ticketTiers` or
 *    `eventDetails` changed - not when time passed.
 *
 * The 60s heartbeat is what fixes the third one; the day-rollover comparison is
 * what makes the dependency list express "today" rather than "whenever
 * something else happened to change".
 */
export function useEatToday(): EatToday {
  const [today, setToday] = useState<EatToday>(currentEatToday);

  useEffect(() => {
    const id = setInterval(() => {
      const current = currentEatToday();
      // Compare on the day key, not the timestamp: a plain timestamp compare
      // would replace the object every 60s and re-render the entire checkout
      // (including the poster image) for nothing.
      setToday((prev) => (prev.dateKey === current.dateKey ? { ...prev, eatNowMs: current.eatNowMs } : current));
    }, 60000);
    return () => clearInterval(id);
  }, []);

  return today;
}

export default useEatToday;
