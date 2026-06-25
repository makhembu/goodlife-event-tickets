import { Ticket, EventDetails, PendingPayment, TicketTier } from "./supabase-db-types";

// Re-export interface types so all existing pages compile unchanged
export type { Ticket, EventDetails, PendingPayment, TicketTier };

// Safe import for server-side pg pool to avoid breaking client bundle builds
let neonQuery: any = null;
if (typeof window === "undefined") {
  try {
    // Directly require pg here so bundler keeps it server-only
    const { Pool } = require("pg");
    const _pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000
    });
    neonQuery = (text: string, params?: any[]) => _pool.query(text, params);
  } catch (e) {
    console.error("Failed to initialize Neon pool:", e);
  }
}

// In-memory / local storage fallbacks for browser client-side robustness if API is unreachable
let localTicketsMemory: Ticket[] = [];

if (typeof window === "undefined") {
  localTicketsMemory = [
    {
      id: "GL-OJG3843XYZ",
      mpesa_receipt: "OJG3843XYZ",
      phone_number: "254702119320",
      ticket_type: "ADV 500",
      amount_paid: 500,
      purchase_time: new Date(Date.now() - 3600000 * 4).toISOString(),
      is_scanned: false,
      scanned_at: null,
      scanned_by: null,
      buyer_name: "John Doe"
    }
  ];
}

function getLocalStore(): Ticket[] {
  if (typeof window !== "undefined") {
    try {
      const stored = localStorage.getItem("goodlife_tickets");
      if (stored) return JSON.parse(stored);
      const defaults = [
        {
          id: "GL-OJG3843XYZ",
          mpesa_receipt: "OJG3843XYZ",
          phone_number: "254702119320",
          ticket_type: "ADV 500",
          amount_paid: 500,
          purchase_time: new Date(Date.now() - 3600000 * 4).toISOString(),
          is_scanned: false,
          scanned_at: null,
          scanned_by: null,
          buyer_name: "John Doe"
        }
      ];
      localStorage.setItem("goodlife_tickets", JSON.stringify(defaults));
      return defaults;
    } catch {
      return localTicketsMemory;
    }
  }
  return localTicketsMemory;
}

function saveLocalStore(tickets: Ticket[]) {
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem("goodlife_tickets", JSON.stringify(tickets));
    } catch {}
  } else {
    localTicketsMemory = tickets;
  }
}

// Fetch all tickets
export async function fetchAllTickets(): Promise<Ticket[]> {
  if (typeof window !== "undefined") {
    try {
      const res = await fetch("/api/admin/tickets");
      if (res.ok) return await res.json();
    } catch (e) {
      console.warn("API tickets fetch failed. Falling back to local store.", e);
    }
    return getLocalStore();
  }

  // Server side - Neon SQL
  try {
    const { rows } = await neonQuery("SELECT * FROM tickets WHERE deleted_at IS NULL ORDER BY purchase_time DESC");
    return rows.map((r: any) => ({
      ...r,
      amount_paid: Number(r.amount_paid),
      purchase_time: r.purchase_time ? new Date(r.purchase_time).toISOString() : new Date().toISOString(),
      scanned_at: r.scanned_at ? new Date(r.scanned_at).toISOString() : null
    }));
  } catch (err) {
    console.error("Neon fetchAllTickets error:", err);
    return localTicketsMemory;
  }
}

// Dashboard metrics
export async function fetchDashboardMetrics() {
  const tickets = await fetchAllTickets();
  
  const totalCashCollected = tickets.reduce((sum, t) => sum + Number(t.amount_paid), 0);
  const totalTicketsSold = tickets.length;
  const scanCount = tickets.filter(t => t.is_scanned).length;
  
  const campingTiers = {
    "ADV 500": { sold: 0, revenue: 0 },
    "GATE 700": { sold: 0, revenue: 0 },
    "2PX CAMPING": { sold: 0, revenue: 0, cap: 100 },
    "4PX CAMPING": { sold: 0, revenue: 0, cap: 50 },
    "6PX 3000": { sold: 0, revenue: 0, cap: 30 }
  };
  
  tickets.forEach(t => {
    const type = t.ticket_type as keyof typeof campingTiers;
    if (campingTiers[type]) {
      campingTiers[type].sold += 1;
      campingTiers[type].revenue += Number(t.amount_paid);
    }
  });

  const oneDayAgo = Date.now() - 24 * 3600 * 1000;
  const recentSalesAmount = tickets
    .filter(t => new Date(t.purchase_time).getTime() > oneDayAgo)
    .reduce((sum, t) => sum + Number(t.amount_paid), 0);

  return {
    totalCashCollected,
    totalTicketsSold,
    scanCount,
    campingTiers,
    recentSalesAmount,
    tickets
  };
}

// Get single ticket
export async function getTicketById(id: string): Promise<Ticket | null> {
  if (typeof window !== "undefined") {
    try {
      const res = await fetch(`/api/admin/tickets/${id}`);
      if (res.ok) return await res.json();
    } catch (e) {
      console.warn("API getTicketById failed. Falling back to local store.", e);
    }
    const local = getLocalStore();
    return local.find(t => t.id === id) || null;
  }

  // Server side - Neon SQL
  try {
    const { rows } = await neonQuery("SELECT * FROM tickets WHERE id = $1 LIMIT 1", [id]);
    if (rows.length === 0) return null;
    const r = rows[0];
    return {
      ...r,
      amount_paid: Number(r.amount_paid),
      purchase_time: r.purchase_time ? new Date(r.purchase_time).toISOString() : new Date().toISOString(),
      scanned_at: r.scanned_at ? new Date(r.scanned_at).toISOString() : null
    };
  } catch (err) {
    console.error("Neon getTicketById error:", err);
    return null;
  }
}

// Save generated PDF bytes (base64) back to the ticket row so we never regen
export async function savePdfData(id: string, base64Pdf: string): Promise<void> {
  if (typeof window !== "undefined") return; // server-only
  try {
    await neonQuery(
      "UPDATE tickets SET pdf_data = $1 WHERE id = $2",
      [base64Pdf, id]
    );
  } catch (err) {
    console.error("Neon savePdfData error:", err);
  }
}

// Create new ticket
export async function createTicket(ticket: Omit<Ticket, "purchase_time" | "is_scanned" | "scanned_at" | "scanned_by">): Promise<Ticket> {
  const newTicket: Ticket = {
    ...ticket,
    buyer_name: ticket.buyer_name || "Guest",
    purchase_time: new Date().toISOString(),
    is_scanned: false,
    scanned_at: null,
    scanned_by: null
  };

  if (typeof window !== "undefined") {
    const res = await fetch("/api/admin/tickets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newTicket)
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody.error || `Server returned ${res.status}`);
    }
    return await res.json();
  }

  // Server side - Neon SQL
  try {
    // Idempotency check: if a ticket with this mpesa_receipt already exists, return it
    if (newTicket.mpesa_receipt) {
      const { rows: existing } = await neonQuery(
        "SELECT * FROM tickets WHERE mpesa_receipt = $1 LIMIT 1",
        [newTicket.mpesa_receipt]
      );
      if (existing.length > 0) {
        console.log(`createTicket: ticket already exists for receipt ${newTicket.mpesa_receipt}, returning existing`);
        const r = existing[0];
        return {
          ...r,
          amount_paid: Number(r.amount_paid),
          purchase_time: r.purchase_time ? new Date(r.purchase_time).toISOString() : new Date().toISOString(),
          scanned_at: r.scanned_at ? new Date(r.scanned_at).toISOString() : null
        };
      }
    }
    await neonQuery(
      `INSERT INTO tickets (id, mpesa_receipt, phone_number, ticket_type, amount_paid, purchase_time, is_scanned, scanned_at, scanned_by, buyer_name)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        newTicket.id,
        newTicket.mpesa_receipt,
        newTicket.phone_number,
        newTicket.ticket_type,
        newTicket.amount_paid,
        newTicket.purchase_time,
        newTicket.is_scanned,
        newTicket.scanned_at,
        newTicket.scanned_by,
        newTicket.buyer_name
      ]
    );
    return newTicket;
  } catch (err) {
    console.error("Neon createTicket error:", err);
    return newTicket;
  }
}

// Process scanned ticket
export async function processTicketScan(id: string, scannerName: string = "Admin Guard"): Promise<{ success: boolean; message: string; scannedAt?: string; alreadyScanned?: boolean; ticket?: Ticket }> {
  const ticket = await getTicketById(id);
  
  if (!ticket) {
    return {
      success: false,
      message: `Invalid Ticket! ID: ${id} could not be resolved in the GOODLIFE database.`
    };
  }

  if (ticket.is_scanned) {
    return {
      success: false,
      alreadyScanned: true,
      scannedAt: ticket.scanned_at || ticket.purchase_time,
      ticket,
      message: `TICKET ALREADY SCANNED! First validated on ${new Date(ticket.scanned_at || "").toLocaleTimeString()} by ${ticket.scanned_by || "Unknown"}. ENTRY REJECTED.`
    };
  }

  const updatedTicket: Ticket = {
    ...ticket,
    is_scanned: true,
    scanned_at: new Date().toISOString(),
    scanned_by: scannerName
  };

  if (typeof window !== "undefined") {
    try {
      const res = await fetch(`/api/admin/scan/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scanned_by: scannerName })
      });
      if (res.ok) return await res.json();
    } catch (e) {
      console.warn("API scan failed. Saving to local store.", e);
    }
    const local = getLocalStore();
    const updatedList = local.map(t => t.id === id ? updatedTicket : t);
    saveLocalStore(updatedList);
    return {
      success: true,
      ticket: updatedTicket,
      message: `SUCCESS! Ticket ${id} [${ticket.ticket_type}] has been validated locally. Welcome to GOODLIFE!`
    };
  }

  // Server side - Neon SQL
  try {
    await neonQuery(
      "UPDATE tickets SET is_scanned = TRUE, scanned_at = $1, scanned_by = $2 WHERE id = $3",
      [updatedTicket.scanned_at, updatedTicket.scanned_by, id]
    );
    return {
      success: true,
      ticket: updatedTicket,
      message: `SUCCESS! Ticket ${id} [${ticket.ticket_type}] has been validated successfully. Welcome to GOODLIFE!`
    };
  } catch (err) {
    console.error("Neon processTicketScan error:", err);
    return {
      success: true,
      ticket: updatedTicket,
      message: `SUCCESS! Ticket ${id} [${ticket.ticket_type}] has been scanned, but database sync pending.`
    };
  }
}

// Event details
let localEventDetails: EventDetails = {
  id: 1,
  title: "GOODLIFE",
  subtitle: "237-THIKA | JULY 11",
  tag: "SMWHR INC · MARARA CAMP",
  venue: "MARARA CAMP, THIKA",
  till_number: "5761205",
  flyer_url: "/flyer.png",
  regulations: "Camp gate opens strictly at noon. Carry your dynamic physical PDF ticket or phone download for scanning validation. Absolute zero external beverage allowance at Marara. Access is limited strictly to 18+ and above, original ID documentation verified.",
  ticker_text: "NO ENTRY WITHOUT VALIDATION ✦ STRICTLY 18+ ✦",
  logo_url: "",
  simulators_enabled: true,
  footer_title: "GOODLIFE TICKETING",
  footer_legal: "STRICTLY 18+ NO OUTSIDE DRINKS"
};

function getLocalEventDetails(): EventDetails {
  if (typeof window !== "undefined") {
    try {
      const stored = localStorage.getItem("goodlife_event_details");
      if (stored) return JSON.parse(stored);
      localStorage.setItem("goodlife_event_details", JSON.stringify(localEventDetails));
    } catch {}
  }
  return localEventDetails;
}

function saveLocalEventDetails(details: EventDetails) {
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem("goodlife_event_details", JSON.stringify(details));
    } catch {}
  } else {
    localEventDetails = details;
  }
}

export async function fetchEventDetails(): Promise<EventDetails> {
  if (typeof window !== "undefined") {
    try {
      const res = await fetch("/api/event-details");
      if (res.ok) return await res.json();
    } catch (e) {
      console.warn("API fetchEventDetails failed. Falling back to local store.", e);
    }
    return getLocalEventDetails();
  }

  // Server side - Neon SQL
  try {
    const { rows } = await neonQuery("SELECT * FROM event_details WHERE id = 1 LIMIT 1");
    if (rows.length === 0) return localEventDetails;
    return rows[0] as EventDetails;
  } catch (err) {
    console.error("Neon fetchEventDetails error:", err);
    return localEventDetails;
  }
}

export async function updateEventDetails(details: Partial<EventDetails>): Promise<EventDetails> {
  const current = await fetchEventDetails();
  const updated = { ...current, ...details };

  if (typeof window !== "undefined") {
    try {
      const res = await fetch("/api/event-details", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updated)
      });
      if (res.ok) return await res.json();
    } catch (e) {
      console.warn("API updateEventDetails failed. Saving to local store.", e);
    }
    saveLocalEventDetails(updated);
    return updated;
  }

  // Server side - Neon SQL
  try {
    await neonQuery(
      `INSERT INTO event_details (id, title, subtitle, tag, venue, till_number, flyer_url, regulations, ticker_text, logo_url, simulators_enabled, footer_title, footer_legal)
       VALUES (1, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       ON CONFLICT (id) DO UPDATE SET
         title = EXCLUDED.title,
         subtitle = EXCLUDED.subtitle,
         tag = EXCLUDED.tag,
         venue = EXCLUDED.venue,
         till_number = EXCLUDED.till_number,
         flyer_url = EXCLUDED.flyer_url,
         regulations = EXCLUDED.regulations,
         ticker_text = EXCLUDED.ticker_text,
         logo_url = EXCLUDED.logo_url,
         simulators_enabled = EXCLUDED.simulators_enabled,
         footer_title = EXCLUDED.footer_title,
         footer_legal = EXCLUDED.footer_legal`,
      [
        updated.title,
        updated.subtitle,
        updated.tag,
        updated.venue,
        updated.till_number,
        updated.flyer_url,
        updated.regulations,
        updated.ticker_text || "NO ENTRY WITHOUT VALIDATION ✦ STRICTLY 18+ ✦",
        updated.logo_url || "",
        updated.simulators_enabled ?? true,
        updated.footer_title || "GOODLIFE TICKETING",
        updated.footer_legal || "STRICTLY 18+ NO OUTSIDE DRINKS"
      ]
    );
    return updated;
  } catch (err) {
    console.error("Neon updateEventDetails error:", err);
    return updated;
  }
}

// Update ticket
export async function updateTicket(id: string, updates: Partial<Ticket>): Promise<Ticket | null> {
  const ticket = await getTicketById(id);
  if (!ticket) return null;
  const updatedTicket = { ...ticket, ...updates };

  if (typeof window !== "undefined") {
    try {
      const res = await fetch(`/api/admin/tickets/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates)
      });
      if (res.ok) return await res.json();
    } catch (e) {
      console.warn("API updateTicket failed. Saving to local store.", e);
    }
    const local = getLocalStore();
    const updatedList = local.map(t => t.id === id ? updatedTicket : t);
    saveLocalStore(updatedList);
    return updatedTicket;
  }

  // Server side - Neon SQL
  try {
    const fields = Object.keys(updates);
    if (fields.length === 0) return ticket;
    const setClause = fields.map((f, idx) => `"${f}" = $${idx + 2}`).join(", ");
    const values = fields.map(f => (updates as any)[f]);
    await neonQuery(
      `UPDATE tickets SET ${setClause} WHERE id = $1`,
      [id, ...values]
    );
    return updatedTicket;
  } catch (err) {
    console.error("Neon updateTicket error:", err);
    return updatedTicket;
  }
}

// Soft-delete ticket
export async function deleteTicket(id: string): Promise<boolean> {
  if (typeof window !== "undefined") {
    try {
      const res = await fetch(`/api/admin/tickets/${id}`, {
        method: "DELETE"
      });
      if (res.ok) return true;
    } catch (e) {
      console.warn("API deleteTicket failed. Updating local store.", e);
    }
    const local = getLocalStore();
    const updatedList = local.filter(t => t.id !== id);
    saveLocalStore(updatedList);
    return true;
  }

  // Server side - Neon SQL
  try {
    await neonQuery("UPDATE tickets SET deleted_at = NOW() WHERE id = $1", [id]);
    return true;
  } catch (err) {
    console.error("Neon deleteTicket error:", err);
    return false;
  }
}

// Soft-delete ticket tier
export async function deleteTicketTier(id: string): Promise<boolean> {
  if (typeof window !== "undefined") {
    try {
      const res = await fetch(`/api/ticket-tiers/${id}`, {
        method: "DELETE"
      });
      if (res.ok) return true;
    } catch (e) {
      console.warn("API deleteTicketTier failed.", e);
    }
    return false;
  }

  // Server side - Neon SQL
  try {
    await neonQuery("UPDATE ticket_tiers SET deleted_at = NOW() WHERE id = $1", [id]);
    return true;
  } catch (err) {
    console.error("Neon deleteTicketTier error:", err);
    return false;
  }
}

export async function fetchDeletedTickets(): Promise<Ticket[]> {
  if (typeof window !== "undefined") return [];
  try {
    const { rows } = await neonQuery("SELECT * FROM tickets WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC");
    return rows.map((r: any) => ({
      ...r,
      amount_paid: Number(r.amount_paid),
      purchase_time: r.purchase_time ? new Date(r.purchase_time).toISOString() : new Date().toISOString(),
      scanned_at: r.scanned_at ? new Date(r.scanned_at).toISOString() : null
    }));
  } catch (err) {
    console.error("Neon fetchDeletedTickets error:", err);
    return [];
  }
}

export async function fetchDeletedTicketTiers(): Promise<TicketTier[]> {
  if (typeof window !== "undefined") return [];
  try {
    const { rows } = await neonQuery("SELECT * FROM ticket_tiers WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC");
    return rows.map((r: any) => ({
      ...r,
      price: Number(r.price),
      show_only_on_event_day: Boolean(r.show_only_on_event_day),
      hide_on_event_day: Boolean(r.hide_on_event_day),
      hidden: Boolean(r.hidden)
    }));
  } catch (err) {
    console.error("Neon fetchDeletedTicketTiers error:", err);
    return [];
  }
}

export async function restoreTicket(id: string): Promise<boolean> {
  if (typeof window !== "undefined") return false;
  try {
    await neonQuery("UPDATE tickets SET deleted_at = NULL WHERE id = $1", [id]);
    return true;
  } catch (err) {
    console.error("Neon restoreTicket error:", err);
    return false;
  }
}

export async function restoreTicketTier(id: string): Promise<boolean> {
  if (typeof window !== "undefined") return false;
  try {
    await neonQuery("UPDATE ticket_tiers SET deleted_at = NULL WHERE id = $1", [id]);
    return true;
  } catch (err) {
    console.error("Neon restoreTicketTier error:", err);
    return false;
  }
}

// Create pending payment
export async function createPendingPayment(payment: PendingPayment): Promise<PendingPayment> {
  if (typeof window !== "undefined") {
    try {
      const res = await fetch("/api/mpesa/stkpush", { // mapping context
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payment)
      });
      if (res.ok) return payment;
    } catch (e) {
      console.warn("API createPendingPayment failed.", e);
    }
    return payment;
  }

  // Server side - Neon SQL
  try {
    await neonQuery(
      `INSERT INTO pending_payments (checkout_request_id, phone_number, ticket_type, quantity, buyer_name, amount)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        payment.checkout_request_id,
        payment.phone_number,
        payment.ticket_type,
        payment.quantity,
        payment.buyer_name,
        payment.amount
      ]
    );
    return payment;
  } catch (err) {
    console.error("Neon createPendingPayment error:", err);
    return payment;
  }
}

// Fetch all pending payments (for admin reconciliation)
export async function fetchAllPendingPayments(): Promise<PendingPayment[]> {
  if (typeof window !== "undefined") return [];

  try {
    const { rows } = await neonQuery("SELECT * FROM pending_payments ORDER BY created_at DESC");
    return rows.map((r: any) => ({
      ...r,
      amount: Number(r.amount),
      quantity: Number(r.quantity),
      created_at: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString()
    }));
  } catch (err) {
    console.error("Neon fetchAllPendingPayments error:", err);
    return [];
  }
}

// Resolve an orphaned pending payment (admin action)
export async function resolvePendingPayment(
  checkoutRequestId: string,
  mpesaReceipt: string,
  amountPaid: number
): Promise<{ success: boolean; message: string; tickets?: Ticket[] }> {
  if (typeof window !== "undefined") return { success: false, message: "Server-only operation" };

  try {
    const pending = await fetchPendingPayment(checkoutRequestId);
    if (!pending) return { success: false, message: "Pending payment not found" };

    const perTicketAmount = amountPaid / pending.quantity;
    const tickets: Ticket[] = [];

    for (let i = 1; i <= pending.quantity; i++) {
      const ticketId = pending.quantity === 1
        ? `GL-${mpesaReceipt}`
        : `GL-${mpesaReceipt}-${i}`;

      const ticket = await createTicket({
        id: ticketId,
        mpesa_receipt: mpesaReceipt,
        phone_number: pending.phone_number,
        ticket_type: pending.ticket_type,
        amount_paid: perTicketAmount,
        buyer_name: pending.buyer_name
      });

      tickets.push(ticket);

      try {
        const { sendTicketViaWhatsApp } = await import("@/lib/whatsapp");
        await sendTicketViaWhatsApp(ticket.id, pending.phone_number);
      } catch (wsErr) {
        console.error(`WhatsApp delivery failed for ticket ${ticket.id}:`, wsErr);
      }
    }

    // Update pending payment status
    await neonQuery(
      `UPDATE pending_payments SET status = 'completed', ticket_id = $1 WHERE checkout_request_id = $2`,
      [tickets[0].id, checkoutRequestId]
    );

    return {
      success: true,
      message: `${tickets.length} ticket(s) created for ${pending.buyer_name}`,
      tickets
    };
  } catch (err: any) {
    console.error("resolvePendingPayment error:", err);
    return { success: false, message: err.message };
  }
}

// Fetch pending payment
export async function fetchPendingPayment(checkoutRequestId: string): Promise<PendingPayment | null> {
  if (typeof window !== "undefined") {
    return null;
  }

  // Server side - Neon SQL
  try {
    const { rows } = await neonQuery(
      "SELECT * FROM pending_payments WHERE checkout_request_id = $1 LIMIT 1",
      [checkoutRequestId]
    );
    if (rows.length === 0) return null;
    return rows[0] as PendingPayment;
  } catch (err) {
    console.error("Neon fetchPendingPayment error:", err);
    return null;
  }
}

// Fetch all ticket tiers
export async function fetchTicketTiers(): Promise<TicketTier[]> {
  if (typeof window !== "undefined") {
    try {
      const res = await fetch("/api/ticket-tiers");
      if (res.ok) return await res.json();
    } catch (e) {
      console.warn("API fetchTicketTiers failed.", e);
    }
    return [];
  }

  // Server side - Neon SQL
  try {
    const { rows } = await neonQuery("SELECT * FROM ticket_tiers WHERE deleted_at IS NULL ORDER BY price ASC");
    return rows.map((r: any) => ({
      ...r,
      price: Number(r.price),
      show_only_on_event_day: Boolean(r.show_only_on_event_day),
      hide_on_event_day: Boolean(r.hide_on_event_day),
      hidden: Boolean(r.hidden)
    }));
  } catch (err) {
    console.error("Neon fetchTicketTiers error:", err);
    return [];
  }
}

// Create new ticket tier
export async function createTicketTier(tier: TicketTier): Promise<TicketTier> {
  if (typeof window !== "undefined") {
    try {
      const res = await fetch("/api/ticket-tiers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(tier)
      });
      if (res.ok) return await res.json();
    } catch (e) {
      console.warn("API createTicketTier failed.", e);
    }
    return tier;
  }

  // Server side - Neon SQL
  try {
    await neonQuery(
      `INSERT INTO ticket_tiers (id, name, price, description, tag, show_only_on_event_day, hide_on_event_day)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [tier.id, tier.name, tier.price, tier.description, tier.tag, tier.show_only_on_event_day, tier.hide_on_event_day]
    );
    return tier;
  } catch (err) {
    console.error("Neon createTicketTier error:", err);
    return tier;
  }
}

// Update ticket tier
export async function updateTicketTier(id: string, updates: Partial<TicketTier>): Promise<TicketTier | null> {
  if (typeof window !== "undefined") {
    try {
      const res = await fetch(`/api/ticket-tiers/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates)
      });
      if (res.ok) return await res.json();
    } catch (e) {
      console.warn("API updateTicketTier failed.", e);
    }
    return null;
  }

  // Server side - Neon SQL
  try {
    const fields = Object.keys(updates);
    if (fields.length === 0) return null;
    const setClause = fields.map((f, idx) => `"${f}" = $${idx + 2}`).join(", ");
    const values = fields.map(f => (updates as any)[f]);
    const { rows } = await neonQuery(
      `UPDATE ticket_tiers SET ${setClause} WHERE id = $1 RETURNING *`,
      [id, ...values]
    );
    if (rows.length === 0) return null;
    const r = rows[0];
    return {
      ...r,
      price: Number(r.price),
      show_only_on_event_day: Boolean(r.show_only_on_event_day),
      hide_on_event_day: Boolean(r.hide_on_event_day),
      hidden: Boolean(r.hidden)
    };
  } catch (err) {
    console.error("Neon updateTicketTier error:", err);
    return null;
  }
}

// Payment logging helper functions
export async function insertPaymentLog(log: {
  checkout_request_id?: string;
  mpesa_receipt?: string;
  phone_number?: string;
  amount?: number;
  status: string;
  result_desc?: string;
  raw_payload?: any;
}): Promise<void> {
  if (typeof window !== "undefined") return; // Server-only
  try {
    await neonQuery(
      `INSERT INTO payment_logs (checkout_request_id, mpesa_receipt, phone_number, amount, status, result_desc, raw_payload)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        log.checkout_request_id || null,
        log.mpesa_receipt || null,
        log.phone_number || null,
        log.amount || null,
        log.status,
        log.result_desc || null,
        log.raw_payload ? JSON.stringify(log.raw_payload) : null
      ]
    );
  } catch (err) {
    console.error("Neon insertPaymentLog error:", err);
  }
}

export async function fetchPaymentLogs(): Promise<any[]> {
  if (typeof window !== "undefined") {
    try {
      const res = await fetch("/api/admin/payment-logs");
      if (res.ok) return await res.json();
    } catch (e) {
      console.warn("API fetchPaymentLogs failed.", e);
    }
    return [];
  }

  // Server side - Neon SQL
  try {
    const { rows } = await neonQuery("SELECT * FROM payment_logs ORDER BY created_at DESC");
    return rows;
  } catch (err) {
    console.error("Neon fetchPaymentLogs error:", err);
    return [];
  }
}
