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
  // Legacy fields kept for migration compat
  show_only_on_event_day?: boolean;
  hide_on_event_day?: boolean;
}
