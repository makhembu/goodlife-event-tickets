"use client";

import { useEffect, useMemo, useState } from "react";

export interface CountdownParts {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

const ZERO: CountdownParts = { days: 0, hours: 0, minutes: 0, seconds: 0 };

function partsUntil(deadline: number | null, now: number): CountdownParts {
  if (deadline === null) return ZERO;
  const distance = deadline - now;
  if (distance <= 0) return ZERO;
  return {
    days: Math.floor(distance / 86400000),
    hours: Math.floor((distance % 86400000) / 3600000),
    minutes: Math.floor((distance % 3600000) / 60000),
    seconds: Math.floor((distance % 60000) / 1000),
  };
}

/**
 * Ticks down to an ISO timestamp, and reads as zero once it has passed or is
 * missing.
 *
 * Extracted so the coming-soon and recap pages cannot drift apart again. The
 * recap page used to render a countdown bound to the *current* event's
 * `sales_open_date` under a heading naming a *different* event ("NEXT EDITION:
 * GOODLIFE 4", hardcoded as a fallback), so a concluded festival sat at
 * 00:00:00:00 forever while the copy announced an imminent release. Callers
 * must only pass a deadline that genuinely belongs to the copy they render —
 * see `ScheduledEventClientPage`.
 *
 * Implementation notes, because both details are load-bearing:
 *
 *  - Switching target recomputes during render (the sanctioned "adjust state
 *    while rendering" pattern) rather than in an effect, so switching editions
 *    can never paint one frame of the previous edition's numbers. Doing it in
 *    an effect instead produces a cascading render and a visible stale frame.
 *  - `Date.now()` is never called during render. The effect body only
 *    subscribes; the clock is read inside callbacks.
 *  - The interval clears itself once the deadline is reached, so a page left
 *    open past its own date stops running a timer forever.
 */
export function useCountdown(target?: string | null): CountdownParts {
  const deadline = useMemo(() => {
    if (!target) return null;
    const t = new Date(target).getTime();
    return Number.isNaN(t) ? null : t;
  }, [target]);

  // The deadline the visible numbers belong to. `null` means "no target yet",
  // which is indistinguishable from "already passed" for display purposes.
  const [shownFor, setShownFor] = useState<number | null>(deadline);
  const [parts, setParts] = useState<CountdownParts>(ZERO);

  if (shownFor !== deadline) {
    // Deferred to the first tick: reading the clock here would be impure.
    setShownFor(deadline);
    setParts(ZERO);
  }

  useEffect(() => {
    if (deadline === null) return;

    let timer: ReturnType<typeof setInterval> | null = null;

    const tick = () => {
      const distance = deadline - Date.now();
      if (distance <= 0) {
        setParts(ZERO);
        if (timer) clearInterval(timer);
        return;
      }
      setParts(partsUntil(deadline, Date.now()));
    };

    tick();
    timer = setInterval(tick, 1000);

    return () => {
      if (timer) clearInterval(timer);
    };
  }, [deadline]);

  return parts;
}

export default useCountdown;
