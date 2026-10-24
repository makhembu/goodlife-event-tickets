/**
 * Date and lifecycle helpers for the admin event editor.
 *
 * All public-facing event and ticket dates operate in Kenya time (EAT, UTC+3).
 */

export const KENYA_TZ_OFFSET_HOURS = 3;
export const KENYA_TZ_OFFSET_MS = KENYA_TZ_OFFSET_HOURS * 60 * 60 * 1000;

/**
 * Format a DB date / ISO timestamp / Date object to `YYYY-MM-DD` for `<input type="date">`.
 * Ensures the date reflects Kenya wall-clock date.
 */
export function toDateInput(value: unknown): string {
  if (!value) return "";
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return "";
    const eat = new Date(value.getTime() + KENYA_TZ_OFFSET_MS);
    return eat.toISOString().slice(0, 10);
  }
  const str = String(value).trim();
  if (!str) return "";
  if (str.endsWith("Z") || /[+-]\d{2}:?\d{2}$/.test(str)) {
    const d = new Date(str);
    if (!Number.isNaN(d.getTime())) {
      const eat = new Date(d.getTime() + KENYA_TZ_OFFSET_MS);
      return eat.toISOString().slice(0, 10);
    }
  }
  return str.slice(0, 10);
}

/**
 * Format a DB timestamp / ISO string / Date object to `YYYY-MM-DDTHH:mm`
 * for `<input type="datetime-local">` in Kenya time (EAT, UTC+3).
 */
export function toDatetimeLocal(value: unknown): string {
  if (!value) return "";
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return "";
    const eat = new Date(value.getTime() + KENYA_TZ_OFFSET_MS);
    return eat.toISOString().slice(0, 16);
  }
  const str = String(value).trim();
  if (!str) return "";
  if (str.endsWith("Z") || /[+-]\d{2}:?\d{2}$/.test(str)) {
    const d = new Date(str);
    if (!Number.isNaN(d.getTime())) {
      const eat = new Date(d.getTime() + KENYA_TZ_OFFSET_MS);
      return eat.toISOString().slice(0, 16);
    }
  }
  return str.replace(" ", "T").slice(0, 16);
}

/**
 * Convert a `<input type="datetime-local">` value (entered as Kenya time `YYYY-MM-DDTHH:mm`)
 * to a standardized ISO UTC string for database persistence.
 */
export function fromDatetimeLocal(value: string | null | undefined): string | null {
  if (!value) return null;
  const str = String(value).trim();
  if (!str) return null;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(str)) {
    const d = new Date(`${str.slice(0, 16)}:00+03:00`);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  return str;
}

/**
 * Normalize a lifecycle status the same way the dashboard does.
 */
export function normalizeLifecycleStatus(
  status: unknown,
  isActive: unknown
): (typeof LIFECYCLE_STATUSES)[number] {
  const s = String(status ?? "").trim().toLowerCase();
  if ((LIFECYCLE_STATUSES as readonly string[]).includes(s)) {
    return s as (typeof LIFECYCLE_STATUSES)[number];
  }
  if (s === "active") return "live";
  return isActive ? "live" : "closed";
}

export const LIFECYCLE_STATUSES = [
  "live",
  "scheduled",
  "closed",
  "archived",
] as const;
