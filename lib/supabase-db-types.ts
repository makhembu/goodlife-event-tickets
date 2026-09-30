export interface Event {
  id: number;
  title: string;
  subtitle: string;
  tag: string;
  venue: string;
  flyer_url: string;
  logo_url: string;
  regulations: string;
  ticker_text: string;
  till_number: string;
  event_date: string | null;
  status?: 'scheduled' | 'live' | 'closed' | 'archived';
  sales_open_date?: string | null;
  sales_close_date?: string | null;
  next_event_title?: string;
  recap_video_url?: string;
  category?: 'flagship' | 'mini';
  recurrence_pattern?: 'none' | 'weekly' | 'biweekly' | 'monthly';
  recurrence_day?: string;
  recurrence_time?: string;
  custom_schedule_text?: string;
  max_tent_inventory?: number;
  max_shared_beds?: number;
  maps_url?: string;
  created_at: string;
  archived_at: string | null;
  is_active: boolean;
}

export interface Ticket {
  id: string;
  mpesa_receipt: string;
  phone_number: string;
  ticket_type: string;
  amount_paid: number;
  purchase_time: string;
  is_scanned: boolean;
  scanned_at: string | null;
  scanned_by: string | null;
  buyer_name: string;
  pdf_data?: string | null; // base64 cached PDF
  deleted_at?: string | null;
  whatsapp_number?: string | null;
  event_id?: number | null;
  guest_count?: number;
  admitted_count?: number;
  is_camping?: boolean;
  camping_type?: 'none' | 'private' | 'shared_bed';
}

/**
 * Which slice of passes a report is describing.
 * - customers: paid public sales only (the commercial default)
 * - staff: crew / vendor / complimentary passes only
 * - all: both
 */
export type TicketAudience = "customers" | "staff" | "all";

/**
 * A ticket enriched at read time by `fetchDashboardMetrics`.
 *
 * `tier_label` and `is_staff` are DERIVED, never stored. `tickets.ticket_type`
 * is written three different ways depending on origin (PayHero stores the tier
 * *name*, the manual ticket form stores the tier *id*, the crew form stores
 * `CREW/<role>`), so consumers must not read `ticket_type` directly.
 */
export interface NormalizedTicket extends Ticket {
  /** Canonical tier name resolved from either the id or name encoding. */
  tier_label: string;
  /** Crew / vendor / complimentary rather than a customer sale. */
  is_staff: boolean;
}

export interface EventDetails {
  id: number;
  title: string;
  subtitle: string;
  tag: string;
  venue: string;
  till_number: string;
  flyer_url: string;
  regulations: string;
  ticker_text?: string;
  logo_url?: string | null;
  event_date?: string | null; // proper DATE field: "2026-09-05"
  status?: 'scheduled' | 'live' | 'closed' | 'archived';
  category?: 'flagship' | 'mini';
  recurrence_pattern?: 'none' | 'weekly' | 'biweekly' | 'monthly';
  recurrence_day?: string;
  recurrence_time?: string;
  custom_schedule_text?: string;
  sales_open_date?: string | null;
  sales_close_date?: string | null;
  next_event_title?: string;
  recap_video_url?: string;
  max_tent_inventory?: number;
  max_shared_beds?: number;
  maps_url?: string;
  simulators_enabled?: boolean;
  operator_notifications_enabled?: boolean;
  footer_title?: string;
  footer_legal?: string;
  whatsapp_message?: string;
  payment_contact?: string;
  whatsapp_operator_template?: string;
  whatsapp_scan_template?: string;
}

export interface PendingPayment {
  checkout_request_id: string;
  phone_number: string;
  ticket_type: string;
  quantity: number;
  buyer_name: string;
  amount: number;
  created_at?: string;
  status?: string;
  ticket_id?: string;
  whatsapp_number?: string;
  mpesa_reference?: string;
  event_id?: number | null;
}

export interface TicketTier {
  id: string;
  name: string;
  price: number;
  description: string;
  tag: string;
  available_from?: string | null;
  available_until?: string | null;
  max_quantity?: number | null;
  sold_count?: number | null;
  hidden: boolean;
  deleted_at?: string | null;
  event_id?: number | null;
  tier_category?: 'entry' | 'camping';
  admits_quantity?: number;
  is_camping_bundle?: boolean;
  camping_type?: 'none' | 'private' | 'shared_bed';
  badge_text?: string | null;
  tour_media_urls?: string[];
  // Legacy fields kept for migration compat
  show_only_on_event_day?: boolean;
  hide_on_event_day?: boolean;
}

export interface EventWaitlistEntry {
  id: number;
  event_id: number;
  phone_number: string;
  notified: boolean;
  notified_at: string | null;
  created_at: string;
}
