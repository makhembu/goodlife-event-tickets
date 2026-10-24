/**
 * `YYYY-MM-DDTHH:mm` for a `<input type="datetime-local">`.
 *
 * The DB stores these as naive EAT strings, so a plain `slice(0, 16)` is correct
 * and a `toISOString()` round-trip would be wrong — it would shift the value by
 * the browser's offset and move the sales window. Anything with a real timezone
 * offset is converted to EAT first so a value written by a script in UTC still
 * shows the right wall-clock time.
 */
export function toDatetimeLocal(
  value: string | null | undefined
): string {
  if (!value) return "";
  const trimmed = String(value).trim();
  if (!trimmed) return "";
  // Already naive: no `Z` and no `+HH:MM` suffix.
  if (!/(Z|[+-]\d{2}:?\d{2})$/i.test(trimmed)) return trimmed.slice(0, 16);
  const d = new Date(trimmed);
  if (Number.isNaN(d.getTime())) return trimmed.slice(0, 16);
  const eat = new Date(d.getTime() + 3 * 60 * 60 * 1000);
  return eat.toISOString().slice(0, 16);
}

/**
 * Normalize a lifecycle status the same way the dashboard does.
 *
 * The option values MUST be the exact strings the rest of the system tests for.
 * This dropdown used to offer `<option value="active">` for "live", which wrote
 * `status = 'active'` — a value `getEventAvailability` rejects, so picking the
 * green "Active / Live" option produced an event that rendered checkout and then
 * refused every payment. `'live'` is the value that means live.
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
