/**
 * Event card availability & countdown helpers for Goodlife Radio.
 */

import { isEventSellable } from "@/lib/event-availability";
import { Event as EventType } from "@/lib/supabase-db-types";

// Countdown calculation in Kenya Time (Africa/Nairobi, UTC+3)
export function computeKenyaCountdown(targetDateIso?: string | null, nowMs: number = Date.now()) {
  if (!targetDateIso) return null;
  const target = new Date(targetDateIso).getTime();
  if (isNaN(target)) return null;
  const diffMs = target - nowMs;
  if (diffMs <= 0) return { days: 0, hours: 0, minutes: 0, isPassed: true };

  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  return { days, hours, minutes, isPassed: false };
}

// Determines whether the event card should remain visible.
// Does NOT vanish at 03:00 Kenya time on event day (event_date 00:00Z).
// Stays visible while tickets are sellable, until sales_close_date, or through event day.
export function isEventCardVisible(event: EventType | null, nowMs: number = Date.now()): boolean {
  if (!event || event.status === "closed" || event.status === "archived") return false;

  const nowDate = new Date(nowMs);

  // 1. If currently sellable according to availability engine at nowMs, always visible
  if (isEventSellable(event, nowDate)) return true;

  // 2. If sales_close_date exists, stay visible until sales close
  if (event.sales_close_date) {
    const closeMs = new Date(event.sales_close_date).getTime();
    if (!isNaN(closeMs) && nowMs <= closeMs) return true;
  }

  // 3. Keep visible through the full 24h of event_date (until 23:59:59 EAT of event day)
  if (event.event_date) {
    const eventMs = new Date(event.event_date).getTime();
    if (!isNaN(eventMs) && nowMs <= eventMs + 24 * 60 * 60 * 1000) return true;
  }

  return false;
}
