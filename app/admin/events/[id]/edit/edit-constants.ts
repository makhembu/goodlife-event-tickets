export const LIFECYCLE_STATUSES = [
  "live",
  "scheduled",
  "closed",
  "archived",
] as const;

export type LifecycleStatus = (typeof LIFECYCLE_STATUSES)[number];
