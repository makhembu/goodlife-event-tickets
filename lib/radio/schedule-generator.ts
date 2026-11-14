import { neonQuery } from "@/lib/supabase-db";
import { Show, ShowSlot, ShowRecurrencePattern } from "./types";

export const KE_TZ = "Africa/Nairobi";
export const KE_OFFSET_HOURS = 3;

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

/**
 * Converts a calendar date string (YYYY-MM-DD) and Nairobi local time (HH:MM[:SS])
 * into a UTC Date object.
 * Since Africa/Nairobi has had no Daylight Saving Time since 1963, offset is strictly UTC+3.
 */
export function nairobiToUtcDate(dateStr: string, timeStr: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  const parts = timeStr.split(":").map(Number);
  const hours = parts[0] || 0;
  const minutes = parts[1] || 0;
  const seconds = parts[2] || 0;

  // Nairobi is UTC+3, so UTC hour = Nairobi hour - 3
  const utcDate = new Date(Date.UTC(year, month - 1, day, hours - KE_OFFSET_HOURS, minutes, seconds));
  return utcDate;
}

/**
 * Formats a UTC Date to YYYY-MM-DD in Africa/Nairobi time.
 */
export function utcToNairobiDateString(utcDate: Date): string {
  // Add 3 hours to UTC for Nairobi calendar date
  const nairobiMs = utcDate.getTime() + KE_OFFSET_HOURS * 3600 * 1000;
  const d = new Date(nairobiMs);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Formats a UTC Date to "YYYY-MM-DD HH:MM:SS" in Africa/Nairobi time.
 */
export function utcToNairobiDateTimeString(utcDate: Date): string {
  const nairobiMs = utcDate.getTime() + KE_OFFSET_HOURS * 3600 * 1000;
  const d = new Date(nairobiMs);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  const ss = String(d.getUTCSeconds()).padStart(2, "0");
  return `${y}-${m}-${day} ${hh}:${mm}:${ss}`;
}

export interface GeneratedSlotResult {
  totalGenerated: number;
  totalSkipped: number;
  createdSlots: Array<{
    show_id: number;
    show_title: string;
    starts_at: string;
    ends_at: string;
  }>;
  skipped: Array<{
    show_id: number;
    show_title: string;
    starts_at: string;
    reason: string;
  }>;
}

/**
 * Generates schedule slots for all active recurring shows over the specified horizon.
 * Defaults to 30 days from today.
 * Single channel guarantee: verifies no overlapping non-cancelled slot exists.
 */
export async function generateScheduleSlots(
  daysAhead = 30,
  referenceDate: Date = new Date(),
  showId?: number
): Promise<GeneratedSlotResult> {
  const result: GeneratedSlotResult = {
    totalGenerated: 0,
    totalSkipped: 0,
    createdSlots: [],
    skipped: [],
  };

  // 1. Fetch active recurring shows (or single target show)
  const showsRes = await neonQuery(
    `SELECT id, title, slug, primary_presenter_id, default_duration_min,
            recurrence_pattern, recurrence_days, default_start_time, is_active, created_at
     FROM shows
     WHERE is_active = true AND recurrence_pattern != 'none'
       ${showId ? "AND id = $1" : ""}
     ORDER BY id ASC;`,
    showId ? [showId] : []
  );

  const shows: Show[] = (showsRes.rows || []).map((r: any) => ({
    id: r.id,
    title: r.title,
    slug: r.slug,
    primary_presenter_id: r.primary_presenter_id,
    default_duration_min: Number(r.default_duration_min) || 120,
    recurrence_pattern: r.recurrence_pattern as ShowRecurrencePattern,
    recurrence_days: Array.isArray(r.recurrence_days) ? r.recurrence_days : ["Friday"],
    default_start_time: r.default_start_time || "20:00:00",
    is_active: r.is_active,
    created_at: r.created_at,
    updated_at: r.created_at,
    genre: "Eclectic",
  }));

  if (shows.length === 0) {
    return result;
  }

  // 2. Compute date horizon in Africa/Nairobi
  const startDateStr = utcToNairobiDateString(referenceDate);
  const [startYear, startMonth, startDay] = startDateStr.split("-").map(Number);
  // Anchor to 00:00 Nairobi time
  const startNairobi = new Date(Date.UTC(startYear, startMonth - 1, startDay));

  for (let dayOffset = 0; dayOffset < daysAhead; dayOffset++) {
    const currentNairobiDate = new Date(startNairobi.getTime() + dayOffset * 86400000);
    const dateStr = currentNairobiDate.toISOString().slice(0, 10);
    const dayOfWeek = WEEKDAYS[currentNairobiDate.getUTCDay()];

    for (const show of shows) {
      let isMatch = false;

      if (show.recurrence_pattern === "daily") {
        isMatch = true;
      } else if (show.recurrence_pattern === "weekdays") {
        isMatch = ["monday", "tuesday", "wednesday", "thursday", "friday"].includes(dayOfWeek);
      } else if (show.recurrence_pattern === "weekends") {
        isMatch = ["saturday", "sunday"].includes(dayOfWeek);
      } else if (show.recurrence_pattern === "weekly") {
        const targetDays = show.recurrence_days.map((d) => d.trim().toLowerCase());
        isMatch = targetDays.includes(dayOfWeek);
      } else if (show.recurrence_pattern === "biweekly") {
        const targetDays = show.recurrence_days.map((d) => d.trim().toLowerCase());
        if (targetDays.includes(dayOfWeek)) {
          // Check alternating fortnight anchored to created_at week
          const createdNairobi = utcToNairobiDateString(new Date(show.created_at));
          const [cYear, cMonth, cDay] = createdNairobi.split("-").map(Number);
          const anchorDate = new Date(Date.UTC(cYear, cMonth - 1, cDay));
          const diffDays = Math.floor((currentNairobiDate.getTime() - anchorDate.getTime()) / 86400000);
          const weekNum = Math.floor(diffDays / 7);
          isMatch = Math.abs(weekNum) % 2 === 0;
        }
      }

      if (!isMatch) continue;

      // 3. Compute slot start and end in UTC
      const startsAt = nairobiToUtcDate(dateStr, show.default_start_time);
      const endsAt = new Date(startsAt.getTime() + show.default_duration_min * 60 * 1000);

      // Do not generate slots that ended before referenceDate
      if (endsAt.getTime() <= referenceDate.getTime()) {
        continue;
      }

      const startsAtIso = startsAt.toISOString();
      const endsAtIso = endsAt.toISOString();

      // 4. Check for existing slot for this exact show & time (Idempotency)
      const existingRes = await neonQuery(
        `SELECT id FROM show_slots WHERE show_id = $1 AND starts_at = $2 LIMIT 1;`,
        [show.id, startsAtIso]
      );

      if (existingRes.rows && existingRes.rows.length > 0) {
        result.skipped.push({
          show_id: show.id,
          show_title: show.title,
          starts_at: startsAtIso,
          reason: "already_exists",
        });
        result.totalSkipped++;
        continue;
      }

      // 5. Overlap Detection: Single broadcast channel rule
      // Check if any non-cancelled slot overlaps with [startsAt, endsAt)
      const overlapRes = await neonQuery(
        `SELECT id, show_id, starts_at, ends_at, status
         FROM show_slots
         WHERE status != 'cancelled'
           AND starts_at < $2
           AND ends_at > $1
         LIMIT 1;`,
        [startsAtIso, endsAtIso]
      );

      if (overlapRes.rows && overlapRes.rows.length > 0) {
        const conflict = overlapRes.rows[0];
        result.skipped.push({
          show_id: show.id,
          show_title: show.title,
          starts_at: startsAtIso,
          reason: `overlap_with_slot_${conflict.id}`,
        });
        result.totalSkipped++;
        continue;
      }

      // 6. Insert new slot
      try {
        await neonQuery(
          `INSERT INTO show_slots (
            show_id, presenter_id, starts_at, ends_at, status, generated_from_recurrence, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, 'scheduled', true, NOW(), NOW())
          ON CONFLICT (show_id, starts_at) DO NOTHING;`,
          [show.id, show.primary_presenter_id, startsAtIso, endsAtIso]
        );

        result.createdSlots.push({
          show_id: show.id,
          show_title: show.title,
          starts_at: startsAtIso,
          ends_at: endsAtIso,
        });
        result.totalGenerated++;
      } catch (err: any) {
        result.skipped.push({
          show_id: show.id,
          show_title: show.title,
          starts_at: startsAtIso,
          reason: `insert_error: ${err.message}`,
        });
        result.totalSkipped++;
      }
    }
  }

  return result;
}
