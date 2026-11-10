/**
 * Public allowlist for event_details.
 *
 * Strictly defines which fields from the singleton `event_details` table
 * are allowed to be exposed in public API responses.
 *
 * Secrets such as `gate_pin`, `budget_allocated`, `budget_total`, or administrative
 * notes must NEVER be added to this allowlist.
 */
export const PUBLIC_EVENT_DETAILS_FIELDS = [
  "id",
  "title",
  "subtitle",
  "tag",
  "venue",
  "till_number",
  "flyer_url",
  "regulations",
  "ticker_text",
  "logo_url",
  "event_date",
  "maps_url",
  "footer_title",
  "footer_legal",
  "payment_contact",
  "event_id",
  "whatsapp_message",
  "status",
  "is_active",
  "category",
  "recurrence_pattern",
  "recurrence_day",
  "recurrence_time",
  "custom_schedule_text",
  "sales_open_date",
  "sales_close_date",
  "next_event_title",
  "recap_video_url",
  "video_url",
  "story_media",
  "max_tent_inventory",
  "max_shared_beds",
] as const;
