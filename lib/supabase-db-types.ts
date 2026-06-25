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
  logo_url?: string | null; // optional custom logo image URL
  simulators_enabled?: boolean;
  footer_title?: string;
  footer_legal?: string;
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
}

export interface TicketTier {
  id: string;
  name: string;
  price: number;
  description: string;
  tag: string;
  show_only_on_event_day: boolean;
  hide_on_event_day: boolean;
  hidden: boolean;
  deleted_at?: string | null;
}
