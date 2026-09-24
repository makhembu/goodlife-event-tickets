import { Ticket, Event, EventDetails, PendingPayment, TicketTier } from "./supabase-db-types";

// Re-export interface types so all existing pages compile unchanged
export type { Ticket, Event, EventDetails, PendingPayment, TicketTier };

// Safe import for server-side pg pool to avoid breaking client bundle builds
let neonQuery: any = null;
let neonConnect: any = null;
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
    neonConnect = () => _pool.connect();
  } catch (e) {
    console.error("Failed to initialize Neon pool:", e);
  }
}

// ==================== EVENT CRUD FUNCTIONS ====================

// Fetch all events
export async function fetchAllEvents(): Promise<Event[]> {
  if (typeof window !== "undefined") {
    try {
      const res = await fetch("/api/events");
      if (res.ok) return await res.json();
    } catch (e) {
      console.warn("API fetchAllEvents failed.", e);
    }
    return [];
  }

  try {
    const { rows } = await neonQuery("SELECT * FROM events ORDER BY created_at DESC");
    return rows.map((r: any) => ({
      ...r,
      created_at: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString(),
      archived_at: r.archived_at ? new Date(r.archived_at).toISOString() : null,
      event_date: r.event_date ? new Date(r.event_date).toISOString() : null
    }));
  } catch (err) {
    console.error("Neon fetchAllEvents error:", err);
    return [];
  }
}

// Fetch active event
export async function fetchActiveEvent(): Promise<Event | null> {
  if (typeof window !== "undefined") {
    try {
      const res = await fetch("/api/events/active");
      if (res.ok) return await res.json();
    } catch (e) {
      console.warn("API fetchActiveEvent failed.", e);
    }
    return null;
  }

  try {
    const { rows } = await neonQuery("SELECT * FROM events WHERE is_active = TRUE LIMIT 1");
    if (rows.length === 0) return null;
    const r = rows[0];
    return {
      ...r,
      created_at: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString(),
      archived_at: r.archived_at ? new Date(r.archived_at).toISOString() : null,
      event_date: r.event_date ? new Date(r.event_date).toISOString() : null
    };
  } catch (err) {
    console.error("Neon fetchActiveEvent error:", err);
    return null;
  }
}

// Fetch event by ID
export async function getEventById(id: number): Promise<Event | null> {
  if (typeof window !== "undefined") {
    try {
      const res = await fetch(`/api/events/${id}`);
      if (res.ok) return await res.json();
    } catch (e) {
      console.warn("API getEventById failed.", e);
    }
    return null;
  }

  try {
    const { rows } = await neonQuery("SELECT * FROM events WHERE id = $1 LIMIT 1", [id]);
    if (rows.length === 0) return null;
    const r = rows[0];
    return {
      ...r,
      created_at: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString(),
      archived_at: r.archived_at ? new Date(r.archived_at).toISOString() : null,
      event_date: r.event_date ? new Date(r.event_date).toISOString() : null
    };
  } catch (err) {
    console.error("Neon getEventById error:", err);
    return null;
  }
}

// Create new event (copies tiers from current active event)
export async function createEvent(event: Omit<Event, 'id' | 'created_at'>): Promise<Event> {
  if (typeof window !== "undefined") {
    const res = await fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(event)
    });
    if (!res.ok) throw new Error("Failed to create event");
    return await res.json();
  }

  try {
    // Archive current active event
    await neonQuery("UPDATE events SET is_active = FALSE, archived_at = NOW() WHERE is_active = TRUE");

    // Create new event
    const { rows } = await neonQuery(
      `INSERT INTO events (title, subtitle, tag, venue, flyer_url, logo_url, regulations, ticker_text, till_number, event_date, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, TRUE)
       RETURNING *`,
      [
        event.title,
        event.subtitle || '',
        event.tag || '',
        event.venue || '',
        event.flyer_url || '/flyer.png',
        event.logo_url || '',
        event.regulations || '',
        event.ticker_text || '',
        event.till_number || '',
        event.event_date || null
      ]
    );
    const newEvent = rows[0];

    // Copy tiers from previous active event to new event
    const { rows: prevTiers } = await neonQuery(
      "SELECT * FROM ticket_tiers WHERE deleted_at IS NULL"
    );
    for (const tier of prevTiers) {
      await neonQuery(
        `INSERT INTO ticket_tiers (id, name, price, description, tag, show_only_on_event_day, hide_on_event_day, available_from, available_until, max_quantity, event_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         ON CONFLICT (id) DO UPDATE SET event_id = $11`,
        [tier.id, tier.name, tier.price, tier.description, tier.tag, tier.show_only_on_event_day, tier.hide_on_event_day, tier.available_from, tier.available_until, tier.max_quantity, newEvent.id]
      );
    }

    // Sync event_details table for backward compatibility
    await neonQuery(
      `INSERT INTO event_details (id, title, subtitle, tag, venue, till_number, flyer_url, regulations, ticker_text, logo_url)
       VALUES (1, $1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (id) DO UPDATE SET
         title = EXCLUDED.title, subtitle = EXCLUDED.subtitle, tag = EXCLUDED.tag,
         venue = EXCLUDED.venue, till_number = EXCLUDED.till_number, flyer_url = EXCLUDED.flyer_url,
         regulations = EXCLUDED.regulations, ticker_text = EXCLUDED.ticker_text, logo_url = EXCLUDED.logo_url`,
      [newEvent.title, newEvent.subtitle, newEvent.tag, newEvent.venue, newEvent.till_number, newEvent.flyer_url, newEvent.regulations, newEvent.ticker_text, newEvent.logo_url]
    );

    return {
      ...newEvent,
      created_at: newEvent.created_at ? new Date(newEvent.created_at).toISOString() : new Date().toISOString(),
      archived_at: null,
      event_date: newEvent.event_date ? new Date(newEvent.event_date).toISOString() : null
    };
  } catch (err) {
    console.error("Neon createEvent error:", err);
    throw err;
  }
}

// Update event
export async function updateEvent(id: number, updates: Partial<Event>): Promise<Event | null> {
  if (typeof window !== "undefined") {
    try {
      const res = await fetch(`/api/events/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates)
      });
      if (res.ok) return await res.json();
    } catch (e) {
      console.warn("API updateEvent failed.", e);
    }
    return null;
  }

  try {
    const fields = Object.keys(updates).filter(k => k !== 'id' && k !== 'created_at');
    if (fields.length === 0) return await getEventById(id);
    const setClause = fields.map((f, idx) => `"${f}" = $${idx + 2}`).join(", ");
    const values = fields.map(f => (updates as any)[f]);
    const { rows } = await neonQuery(
      `UPDATE events SET ${setClause} WHERE id = $1 RETURNING *`,
      [id, ...values]
    );
    if (rows.length === 0) return null;
    const r = rows[0];

    // If this is the active event, sync to event_details
    if (r.is_active) {
      await neonQuery(
        `INSERT INTO event_details (id, title, subtitle, tag, venue, till_number, flyer_url, regulations, ticker_text, logo_url)
         VALUES (1, $1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (id) DO UPDATE SET
           title = EXCLUDED.title, subtitle = EXCLUDED.subtitle, tag = EXCLUDED.tag,
           venue = EXCLUDED.venue, till_number = EXCLUDED.till_number, flyer_url = EXCLUDED.flyer_url,
           regulations = EXCLUDED.regulations, ticker_text = EXCLUDED.ticker_text, logo_url = EXCLUDED.logo_url`,
        [r.title, r.subtitle, r.tag, r.venue, r.till_number, r.flyer_url, r.regulations, r.ticker_text, r.logo_url]
      );
    }

    return {
      ...r,
      created_at: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString(),
      archived_at: r.archived_at ? new Date(r.archived_at).toISOString() : null,
      event_date: r.event_date ? new Date(r.event_date).toISOString() : null
    };
  } catch (err) {
    console.error("Neon updateEvent error:", err);
    return null;
  }
}

// Archive event
export async function archiveEvent(id: number): Promise<boolean> {
  if (typeof window !== "undefined") {
    try {
      const res = await fetch(`/api/events/${id}/archive`, { method: "POST" });
      return res.ok;
    } catch (e) {
      console.warn("API archiveEvent failed.", e);
      return false;
    }
  }

  try {
    await neonQuery(
      "UPDATE events SET is_active = FALSE, archived_at = NOW() WHERE id = $1",
      [id]
    );
    return true;
  } catch (err) {
    console.error("Neon archiveEvent error:", err);
    return false;
  }
}

// Set event as active (deactivate others, sync event_details)
export async function setActiveEvent(id: number): Promise<boolean> {
  if (typeof window !== "undefined") {
    try {
      const res = await fetch(`/api/events/${id}/archive`, { method: "POST", body: JSON.stringify({ activate: true }) });
      return res.ok;
    } catch (e) {
      console.warn("API setActiveEvent failed.", e);
      return false;
    }
  }

  try {
    // Deactivate all events
    await neonQuery("UPDATE events SET is_active = FALSE");
    // Activate the selected event
    await neonQuery("UPDATE events SET is_active = TRUE, archived_at = NULL WHERE id = $1", [id]);

    // Sync to event_details
    const event = await getEventById(id);
    if (event) {
      await neonQuery(
        `INSERT INTO event_details (id, title, subtitle, tag, venue, till_number, flyer_url, regulations, ticker_text, logo_url)
         VALUES (1, $1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (id) DO UPDATE SET
           title = EXCLUDED.title, subtitle = EXCLUDED.subtitle, tag = EXCLUDED.tag,
           venue = EXCLUDED.venue, till_number = EXCLUDED.till_number, flyer_url = EXCLUDED.flyer_url,
           regulations = EXCLUDED.regulations, ticker_text = EXCLUDED.ticker_text, logo_url = EXCLUDED.logo_url`,
        [event.title, event.subtitle, event.tag, event.venue, event.till_number, event.flyer_url, event.regulations, event.ticker_text, event.logo_url]
      );
    }
    return true;
  } catch (err) {
    console.error("Neon setActiveEvent error:", err);
    return false;
  }
}

// In-memory / local storage fallbacks for browser client-side robustness if API is unreachable
let localTicketsMemory: Ticket[] = [];

function getLocalStore(): Ticket[] {
  if (typeof window !== "undefined") {
    try {
      const stored = localStorage.getItem("goodlife_tickets");
      if (stored) return JSON.parse(stored);
      return [];
    } catch {
      return [];
    }
  }
  return [];
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

// Fetch all tickets (optionally filtered by eventId, -1 = all events)
export async function fetchAllTickets(eventId?: number): Promise<Ticket[]> {
  if (typeof window !== "undefined") {
    try {
      const url = eventId === -1 ? "/api/admin/tickets?eventId=-1" : eventId ? `/api/admin/tickets?eventId=${eventId}` : "/api/admin/tickets";
      const res = await fetch(url);
      if (res.ok) return await res.json();
    } catch (e) {
      console.warn("API tickets fetch failed. Falling back to local store.", e);
    }
    return getLocalStore();
  }

  // Server side - Neon SQL
  try {
    let query = "SELECT * FROM tickets WHERE deleted_at IS NULL";
    const params: any[] = [];

    if (eventId === -1) {
      // All events - no filter
    } else if (eventId) {
      query += " AND event_id = $1";
      params.push(eventId);
    } else {
      // Default: active event
      const active = await fetchActiveEvent();
      if (active) {
        query += " AND event_id = $1";
        params.push(active.id);
      }
    }

    query += " ORDER BY purchase_time DESC";
    const { rows } = await neonQuery(query, params);
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

// Fetch ALL tickets across all events (for admin CSV export)
export async function fetchAllTicketsAll(): Promise<Ticket[]> {
  if (typeof window !== "undefined") {
    try {
      const res = await fetch("/api/admin/tickets?eventId=-1");
      if (res.ok) return await res.json();
    } catch (e) {
      console.warn("API fetchAllTicketsAll failed.", e);
    }
    return [];
  }

  try {
    const { rows } = await neonQuery("SELECT * FROM tickets WHERE deleted_at IS NULL ORDER BY purchase_time DESC");
    return rows.map((r: any) => ({
      ...r,
      amount_paid: Number(r.amount_paid),
      purchase_time: r.purchase_time ? new Date(r.purchase_time).toISOString() : new Date().toISOString(),
      scanned_at: r.scanned_at ? new Date(r.scanned_at).toISOString() : null
    }));
  } catch (err) {
    console.error("Neon fetchAllTicketsAll error:", err);
    return [];
  }
}

// Dashboard metrics (optionally filtered by eventId)
export async function fetchDashboardMetrics(eventId?: number) {
  const tickets = await fetchAllTickets(eventId);
  
  const totalCashCollected = tickets.reduce((sum, t) => sum + Number(t.amount_paid), 0);
  const totalTicketsSold = tickets.length;
  const scanCount = tickets.filter(t => t.is_scanned).length;
  
  let configuredTiers: TicketTier[] = [];
  try {
    configuredTiers = await fetchTicketTiers(eventId && eventId > 0 ? eventId : undefined);
  } catch {}

  const campingTiers: Record<string, { sold: number; revenue: number; cap?: number; name?: string; tag?: string }> = {};

  // 1. Seed with event's configured tiers (deduplicating by normalized name)
  configuredTiers.forEach(tier => {
    const existingKey = Object.keys(campingTiers).find(k => 
      campingTiers[k].name?.trim().toLowerCase() === tier.name.trim().toLowerCase()
    );
    if (!existingKey) {
      campingTiers[tier.id] = {
        sold: 0,
        revenue: 0,
        cap: tier.max_quantity || undefined,
        name: tier.name,
        tag: tier.tag || "TICKETS"
      };
    }
  });

  // 2. Aggregate sales from tickets
  tickets.forEach(t => {
    const rawType = (t.ticket_type || "General").trim();
    const matchedKey = Object.keys(campingTiers).find(k => 
      k.toLowerCase() === rawType.toLowerCase() ||
      campingTiers[k].name?.toLowerCase() === rawType.toLowerCase() ||
      k.toLowerCase().startsWith(rawType.toLowerCase()) ||
      rawType.toLowerCase().startsWith(k.toLowerCase())
    );

    if (matchedKey) {
      campingTiers[matchedKey].sold += 1;
      campingTiers[matchedKey].revenue += Number(t.amount_paid);
    } else {
      if (!campingTiers[rawType]) {
        campingTiers[rawType] = {
          sold: 0,
          revenue: 0,
          name: rawType,
          tag: rawType.toUpperCase().startsWith("CREW") ? "CREW" : "TICKETS"
        };
      }
      campingTiers[rawType].sold += 1;
      campingTiers[rawType].revenue += Number(t.amount_paid);
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
    const { rows } = await neonQuery("SELECT * FROM tickets WHERE id = $1 AND deleted_at IS NULL LIMIT 1", [id]);
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
      "UPDATE tickets SET pdf_data = $1 WHERE id = $2 AND deleted_at IS NULL",
      [base64Pdf, id]
    );
  } catch (err) {
    console.error("Neon savePdfData error:", err);
  }
}

// Create new ticket
export async function createTicket(ticket: Omit<Ticket, "purchase_time" | "is_scanned" | "scanned_at" | "scanned_by">): Promise<Ticket> {
  // Auto-assign event_id if not provided
  let eventId = ticket.event_id;
  if (!eventId && typeof window === "undefined") {
    const active = await fetchActiveEvent();
    eventId = active?.id;
  }

  const newTicket: Ticket = {
    ...ticket,
    event_id: eventId,
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
    // Idempotency check: if a ticket with this id already exists, return it
    const { rows: existingById } = await neonQuery(
      "SELECT * FROM tickets WHERE id = $1 AND deleted_at IS NULL LIMIT 1",
      [newTicket.id]
    );
    if (existingById.length > 0) {
      console.log(`createTicket: ticket ${newTicket.id} already exists, returning existing`);
      const r = existingById[0];
      return {
        ...r,
        amount_paid: Number(r.amount_paid),
        purchase_time: r.purchase_time ? new Date(r.purchase_time).toISOString() : new Date().toISOString(),
        scanned_at: r.scanned_at ? new Date(r.scanned_at).toISOString() : null
      };
    }
    let resolvedEventId = newTicket.event_id;
    if (!resolvedEventId) {
      const active = await fetchActiveEvent();
      resolvedEventId = active?.id || 1;
    }
    await neonQuery(
      `INSERT INTO tickets (id, mpesa_receipt, phone_number, ticket_type, amount_paid, purchase_time, is_scanned, scanned_at, scanned_by, buyer_name, whatsapp_number, event_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
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
        newTicket.buyer_name,
        newTicket.whatsapp_number || "",
        resolvedEventId
      ]
    );
    return { ...newTicket, event_id: resolvedEventId };
  } catch (err) {
    console.error("Neon createTicket error:", err);
    throw err;
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
      "UPDATE tickets SET is_scanned = TRUE, scanned_at = $1, scanned_by = $2 WHERE id = $3 AND deleted_at IS NULL",
      [updatedTicket.scanned_at, updatedTicket.scanned_by, id]
    );

    // Send scan notification via WhatsApp
    try {
      const { sendScanNotification } = await import("@/lib/whatsapp");
      sendScanNotification(
        id,
        ticket.phone_number,
        ticket.buyer_name,
        ticket.ticket_type,
        scannerName
      ).catch(e => console.error("Error dispatching scan notification:", e));
    } catch (err) {
      console.error("Failed to import/dispatch scan notification:", err);
    }

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
  operator_notifications_enabled: false,
  footer_title: "GOODLIFE TICKETING",
  footer_legal: "STRICTLY 18+ NO OUTSIDE DRINKS",
  whatsapp_message: "",
  payment_contact: "",
  whatsapp_operator_template: "",
  whatsapp_scan_template: "",
  event_date: null,
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
      `INSERT INTO event_details (id, title, subtitle, tag, venue, till_number, flyer_url, regulations, ticker_text, logo_url, event_date, simulators_enabled, operator_notifications_enabled, footer_title, footer_legal, whatsapp_message, payment_contact, whatsapp_operator_template, whatsapp_scan_template)
       VALUES (1, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $18, $11, $12, $13, $14, $15, $16, $17)
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
         event_date = EXCLUDED.event_date,
         simulators_enabled = EXCLUDED.simulators_enabled,
         operator_notifications_enabled = EXCLUDED.operator_notifications_enabled,
         footer_title = EXCLUDED.footer_title,
         footer_legal = EXCLUDED.footer_legal,
         whatsapp_message = EXCLUDED.whatsapp_message,
         payment_contact = EXCLUDED.payment_contact,
         whatsapp_operator_template = EXCLUDED.whatsapp_operator_template,
         whatsapp_scan_template = EXCLUDED.whatsapp_scan_template`,
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
        updated.event_date || null,
        updated.simulators_enabled ?? true,
        updated.operator_notifications_enabled ?? false,
        updated.footer_title || "GOODLIFE TICKETING",
        updated.footer_legal || "STRICTLY 18+ NO OUTSIDE DRINKS",
        updated.whatsapp_message || "",
        updated.payment_contact || "",
        updated.whatsapp_operator_template || "",
        updated.whatsapp_scan_template || ""
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
      `UPDATE tickets SET ${setClause} WHERE id = $1 AND deleted_at IS NULL`,
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

// Permanently delete ticket
export async function permanentlyDeleteTicket(id: string): Promise<boolean> {
  if (typeof window !== "undefined") {
    try {
      const res = await fetch(`/api/admin/tickets/${id}?permanent=true`, {
        method: "DELETE"
      });
      return res.ok;
    } catch (e) {
      console.warn("API permanentlyDeleteTicket failed.", e);
      return false;
    }
  }

  // Server side - Neon SQL
  try {
    await neonQuery("DELETE FROM tickets WHERE id = $1", [id]);
    return true;
  } catch (err) {
    console.error("Neon permanentlyDeleteTicket error:", err);
    return false;
  }
}

// Permanently delete ticket tier
export async function permanentlyDeleteTicketTier(id: string): Promise<boolean> {
  if (typeof window !== "undefined") {
    try {
      const res = await fetch(`/api/ticket-tiers/${id}?permanent=true`, {
        method: "DELETE"
      });
      return res.ok;
    } catch (e) {
      console.warn("API permanentlyDeleteTicketTier failed.", e);
      return false;
    }
  }

  // Server side - Neon SQL
  try {
    await neonQuery("DELETE FROM ticket_tiers WHERE id = $1", [id]);
    return true;
  } catch (err) {
    console.error("Neon permanentlyDeleteTicketTier error:", err);
    return false;
  }
}

// Empty Trash
export async function emptyTrash(): Promise<boolean> {
  if (typeof window !== "undefined") {
    try {
      const res = await fetch(`/api/admin/trash/clear`, {
        method: "POST"
      });
      return res.ok;
    } catch (e) {
      console.warn("API emptyTrash failed.", e);
      return false;
    }
  }

  // Server side - Neon SQL
  try {
    await neonQuery("DELETE FROM tickets WHERE deleted_at IS NOT NULL");
    await neonQuery("DELETE FROM ticket_tiers WHERE deleted_at IS NOT NULL");
    return true;
  } catch (err) {
    console.error("Neon emptyTrash error:", err);
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
      max_quantity: r.max_quantity != null ? Number(r.max_quantity) : null,
      sold_count: r.sold_count != null ? Number(r.sold_count) : 0,
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
    let resolvedEventId = payment.event_id;
    if (!resolvedEventId) {
      const active = await fetchActiveEvent();
      resolvedEventId = active?.id || 1;
    }
    await neonQuery(
      `INSERT INTO pending_payments (checkout_request_id, phone_number, ticket_type, quantity, buyer_name, amount, whatsapp_number, mpesa_reference, status, event_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        payment.checkout_request_id,
        payment.phone_number,
        payment.ticket_type,
        payment.quantity,
        payment.buyer_name,
        payment.amount,
        payment.whatsapp_number || "",
        payment.mpesa_reference || "",
        payment.status || "",
        resolvedEventId
      ]
    );
    return { ...payment, event_id: resolvedEventId };
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
        await sendTicketViaWhatsApp(ticket.id, pending.phone_number, pending.buyer_name);
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

// Approve a till-pending payment — creates tickets without sending WhatsApp
export async function approveTillPayment(
  checkoutRequestId: string,
  mpesaReference: string
): Promise<{ success: boolean; message: string; tickets?: Ticket[] }> {
  if (typeof window !== "undefined") return { success: false, message: "Server-only operation" };

  try {
    const pending = await fetchPendingPayment(checkoutRequestId);
    if (!pending) return { success: false, message: "Pending payment not found" };

    const perTicketAmount = pending.amount / pending.quantity;
    const tickets: Ticket[] = [];

    for (let i = 1; i <= pending.quantity; i++) {
      const ticketId = pending.quantity === 1
        ? `GL-${mpesaReference}`
        : `GL-${mpesaReference}-${i}`;

      const ticket = await createTicket({
        id: ticketId,
        mpesa_receipt: mpesaReference,
        phone_number: pending.phone_number,
        ticket_type: pending.ticket_type,
        amount_paid: perTicketAmount,
        buyer_name: pending.buyer_name
      });

      tickets.push(ticket);
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
    console.error("approveTillPayment error:", err);
    return { success: false, message: err.message };
  }
}

// Reject a pending payment — just marks as rejected
export async function rejectPendingPayment(checkoutRequestId: string): Promise<boolean> {
  if (typeof window !== "undefined") return false;
  try {
    await neonQuery(
      `UPDATE pending_payments SET status = 'rejected' WHERE checkout_request_id = $1`,
      [checkoutRequestId]
    );
    return true;
  } catch (err) {
    console.error("Neon rejectPendingPayment error:", err);
    return false;
  }
}

export const DEFAULT_POSTER_TIERS: TicketTier[] = [
  { id: "die-hard-400", name: "DIE HARD", price: 400, description: "Limited early access pass", tag: "TICKETS", hidden: false },
  { id: "early-bird-550", name: "EARLY BIRD", price: 550, description: "Discounted advance entry pass", tag: "TICKETS", hidden: false },
  { id: "advance-750", name: "ADVANCE", price: 750, description: "Standard advance entry pass", tag: "TICKETS", hidden: false },
  { id: "regular-gate-1000", name: "REGULAR / GATE", price: 1000, description: "On-day gate admission pass", tag: "TICKETS", hidden: false },
  { id: "2px-tent-mattress-2500", name: "2PX TENT X MATTRESS", price: 2500, description: "2-person tent with mattress setup", tag: "CAMPING", hidden: false },
  { id: "2px-tent-sleepingbag-2400", name: "2PX TENT X SLEEPING BAG", price: 2400, description: "2-person tent with sleeping bag", tag: "CAMPING", hidden: false },
  { id: "4px-tent-sleepingbag-2400", name: "4PX TENT X SLEEPING BAG", price: 2400, description: "4-person tent with sleeping bag", tag: "CAMPING", hidden: false },
  { id: "6px-tent-sleepingbag-3000", name: "6PX TENT X SLEEPING BAG", price: 3000, description: "6-person group camp setup", tag: "CAMPING", hidden: false }
];

// Fetch all ticket tiers (optionally filtered by eventId)
export async function fetchTicketTiers(eventId?: number): Promise<TicketTier[]> {
  if (typeof window !== "undefined") {
    try {
      const url = eventId ? `/api/ticket-tiers?eventId=${eventId}` : "/api/ticket-tiers";
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) return data;
      }
    } catch (e) {
      console.warn("API fetchTicketTiers failed.", e);
    }
    return DEFAULT_POSTER_TIERS;
  }

  // Server side - Neon SQL
  try {
    let query = "SELECT * FROM ticket_tiers WHERE deleted_at IS NULL";
    const params: any[] = [];

    if (eventId) {
      query += " AND event_id = $1";
      params.push(eventId);
    } else {
      // Default: active event's tiers
      const active = await fetchActiveEvent();
      if (active) {
        query += " AND event_id = $1";
        params.push(active.id);
      }
    }

    query += " ORDER BY price ASC";
    const { rows } = await neonQuery(query, params);
    if (!rows || rows.length === 0) {
      // If no tiers for this event, seed defaults for active event
      const active = await fetchActiveEvent();
      if (active) {
        for (const tier of DEFAULT_POSTER_TIERS) {
          try {
            await neonQuery(
              `INSERT INTO ticket_tiers (id, name, price, description, tag, show_only_on_event_day, hide_on_event_day, event_id)
               VALUES ($1, $2, $3, $4, $5, false, false, $6)
               ON CONFLICT (id) DO UPDATE SET event_id = $6`,
              [tier.id, tier.name, tier.price, tier.description, tier.tag || "TICKETS", active.id]
            );
          } catch {}
        }
        // Re-fetch with event_id
        const { rows: seeded } = await neonQuery("SELECT * FROM ticket_tiers WHERE deleted_at IS NULL AND event_id = $1 ORDER BY price ASC", [active.id]);
        return seeded.map((r: any) => ({
          ...r,
          price: Number(r.price),
          show_only_on_event_day: Boolean(r.show_only_on_event_day),
          hide_on_event_day: Boolean(r.hide_on_event_day),
          hidden: Boolean(r.hidden)
        }));
      }
      return DEFAULT_POSTER_TIERS;
    }
    return rows.map((r: any) => ({
      ...r,
      price: Number(r.price),
      show_only_on_event_day: Boolean(r.show_only_on_event_day),
      hide_on_event_day: Boolean(r.hide_on_event_day),
      hidden: Boolean(r.hidden)
    }));
  } catch (err) {
    console.error("Neon fetchTicketTiers error:", err);
    return DEFAULT_POSTER_TIERS;
  }
}

// Create new ticket tier
export async function createTicketTier(tier: TicketTier): Promise<TicketTier> {
  if (typeof window !== "undefined") {
    const res = await fetch("/api/ticket-tiers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(tier)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Server error: ${res.status}`);
    }
    return await res.json();
  }

  // Server side - Neon SQL
  try {
    let eventId = tier.event_id;
    if (!eventId) {
      const active = await fetchActiveEvent();
      eventId = active?.id;
    }

    await neonQuery(
      `INSERT INTO ticket_tiers (id, name, price, description, tag, show_only_on_event_day, hide_on_event_day, available_from, available_until, max_quantity, event_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         price = EXCLUDED.price,
         description = EXCLUDED.description,
         tag = EXCLUDED.tag,
         show_only_on_event_day = EXCLUDED.show_only_on_event_day,
         hide_on_event_day = EXCLUDED.hide_on_event_day,
         available_from = EXCLUDED.available_from,
         available_until = EXCLUDED.available_until,
         max_quantity = EXCLUDED.max_quantity,
         event_id = EXCLUDED.event_id,
         deleted_at = NULL`,
      [
        tier.id,
        tier.name,
        tier.price,
        tier.description || "",
        tier.tag || "TICKETS",
        tier.show_only_on_event_day ?? false,
        tier.hide_on_event_day ?? false,
        tier.available_from || null,
        tier.available_until || null,
        tier.max_quantity ?? null,
        eventId || null
      ]
    );
    return { ...tier, event_id: eventId };
  } catch (err) {
    console.error("Neon createTicketTier error:", err);
    throw err;
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
      max_quantity: r.max_quantity != null ? Number(r.max_quantity) : null,
      sold_count: r.sold_count != null ? Number(r.sold_count) : 0,
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
  event_id?: number;
}): Promise<void> {
  if (typeof window !== "undefined") return; // Server-only
  try {
    let resolvedEventId = log.event_id;
    if (!resolvedEventId) {
      const active = await fetchActiveEvent();
      resolvedEventId = active?.id || 1;
    }
    await neonQuery(
      `INSERT INTO payment_logs (checkout_request_id, mpesa_receipt, phone_number, amount, status, result_desc, raw_payload, event_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        log.checkout_request_id || null,
        log.mpesa_receipt || null,
        log.phone_number || null,
        log.amount || null,
        log.status,
        log.result_desc || null,
        log.raw_payload ? JSON.stringify(log.raw_payload) : null,
        resolvedEventId
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

export async function deletePaymentLog(id: number): Promise<boolean> {
  if (typeof window !== "undefined") return false;
  try {
    await neonQuery("DELETE FROM payment_logs WHERE id = $1", [id]);
    return true;
  } catch (err) {
    console.error("Neon deletePaymentLog error:", err);
    return false;
  }
}

export async function deleteAllPaymentLogs(): Promise<boolean> {
  if (typeof window !== "undefined") return false;
  try {
    await neonQuery("DELETE FROM payment_logs", []);
    return true;
  } catch (err) {
    console.error("Neon deleteAllPaymentLogs error:", err);
    return false;
  }
}

export async function deletePendingPayment(checkoutRequestId: string): Promise<boolean> {
  if (typeof window !== "undefined") return false;
  try {
    await neonQuery("DELETE FROM pending_payments WHERE checkout_request_id = $1", [checkoutRequestId]);
    return true;
  } catch (err) {
    console.error("Neon deletePendingPayment error:", err);
    return false;
  }
}

export async function clearAllPendingPayments(): Promise<boolean> {
  if (typeof window !== "undefined") return false;
  try {
    await neonQuery("DELETE FROM pending_payments", []);
    return true;
  } catch (err) {
    console.error("Neon clearAllPendingPayments error:", err);
    return false;
  }
}
// ==================== POS & CULTURAL HUB TYPES ====================

export interface Vendor {
  id: number;
  name: string;
  contact_phone: string;
  contact_name: string;
  logo_url: string;
  created_at: string;
}

export interface VendorEventAssignment {
  id: number;
  vendor_id: number;
  event_id: number;
  commission_rate: number;
  flat_fee: number;
  status: 'active' | 'settled' | 'closed';
  total_sales: number;
  commission_owed: number;
  settled_amount: number;
}

export interface VendorOperator {
  id: number;
  vendor_id: number;
  name: string;
  pin: string;
  role: 'cashier' | 'manager';
  is_active: boolean;
}

export interface VendorItem {
  id: number;
  vendor_id: number;
  event_id: number;
  name: string;
  category: string;
  price: number;
  stock_qty: number | null;
  low_stock_threshold: number;
  image_url: string;
  modifiers: { name: string; price_add: number }[];
  is_available: boolean;
  sort_order: number;
}

export interface PosSale {
  id: string;
  vendor_id: number;
  event_id: number;
  operator_id: number | null;
  subtotal: number;
  total: number;
  payment_status: 'completed' | 'voided' | 'partial';
  voided_by: number | null;
  void_reason: string | null;
  notes: string;
  created_at: string;
}

export interface PosSaleItem {
  id: number;
  sale_id: string;
  item_id: number | null;
  item_name: string;
  quantity: number;
  unit_price: number;
  modifiers: { name: string; price_add: number }[];
  line_total: number;
}

export interface SplitPayment {
  id: number;
  sale_id: string;
  method: 'cash' | 'mpesa' | 'tab';
  amount: number;
  payer_name?: string;
  payer_phone?: string;
  mpesa_ref?: string;
  tab_id?: number | null;
}

export interface CustomerTab {
  id: number;
  customer_name: string;
  customer_phone: string;
  vendor_id: number;
  event_id: number;
  credit_limit: number;
  balance: number;
  status: 'open' | 'settled' | 'written_off';
  created_at: string;
  settled_at: string | null;
}

export interface TabTransaction {
  id: number;
  tab_id: number;
  sale_id: string | null;
  type: 'charge' | 'payment';
  amount: number;
  method: string;
  mpesa_ref: string;
  operator_id: number | null;
  created_at: string;
}

export interface EventWaitlist {
  id: number;
  event_id: number;
  phone_number: string;
  created_at: string;
  notified_at: string | null;
}

export interface EventGallery {
  id: number;
  event_id: number;
  image_url: string;
  thumbnail_url: string;
  caption: string;
  tag: string;
  created_at: string;
}

export interface RadioSet {
  id: number;
  event_id: number;
  title: string;
  dj_name: string;
  audio_url: string;
  cover_url: string;
  duration: string;
  genre: string;
  play_count: number;
  created_at: string;
}

// ==================== VENDOR ADMINISTRATION ====================

export async function fetchAllVendors(): Promise<Vendor[]> {
  if (typeof window !== "undefined") {
    try {
      const res = await fetch("/api/admin/vendors");
      if (res.ok) return await res.json();
    } catch {}
    return [];
  }
  try {
    const { rows } = await neonQuery("SELECT * FROM vendors WHERE deleted_at IS NULL ORDER BY name ASC");
    return rows;
  } catch (err) {
    console.error("Neon fetchAllVendors error:", err);
    return [];
  }
}

export async function getVendorById(id: number): Promise<Vendor | null> {
  if (typeof window !== "undefined") {
    try {
      const res = await fetch(`/api/admin/vendors/${id}`);
      if (res.ok) return await res.json();
    } catch {}
    return null;
  }
  try {
    const { rows } = await neonQuery("SELECT * FROM vendors WHERE id = $1 AND deleted_at IS NULL LIMIT 1", [id]);
    if (rows.length === 0) return null;
    return rows[0];
  } catch (err) {
    console.error("Neon getVendorById error:", err);
    return null;
  }
}

export async function createVendor(data: Omit<Vendor, "id" | "created_at">): Promise<Vendor> {
  if (typeof window !== "undefined") {
    const res = await fetch("/api/admin/vendors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error("Failed to create vendor");
    return await res.json();
  }
  const { rows } = await neonQuery(
    `INSERT INTO vendors (name, contact_phone, contact_name, logo_url)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [data.name, data.contact_phone || "", data.contact_name || "", data.logo_url || ""]
  );
  return rows[0];
}

export async function updateVendor(id: number, updates: Partial<Vendor>): Promise<Vendor | null> {
  if (typeof window !== "undefined") {
    const res = await fetch(`/api/admin/vendors/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates)
    });
    if (!res.ok) return null;
    return await res.json();
  }
  const fields = Object.keys(updates).filter(k => k !== "id" && k !== "created_at");
  if (fields.length === 0) return await getVendorById(id);
  const setClause = fields.map((f, idx) => `"${f}" = $${idx + 2}`).join(", ");
  const values = fields.map(f => (updates as any)[f]);
  const { rows } = await neonQuery(
    `UPDATE vendors SET ${setClause} WHERE id = $1 RETURNING *`,
    [id, ...values]
  );
  return rows.length > 0 ? rows[0] : null;
}

export async function deleteVendor(id: number): Promise<boolean> {
  if (typeof window !== "undefined") {
    const res = await fetch(`/api/admin/vendors/${id}`, { method: "DELETE" });
    return res.ok;
  }
  try {
    await neonQuery("UPDATE vendors SET deleted_at = NOW() WHERE id = $1", [id]);
    return true;
  } catch (err) {
    return false;
  }
}

export async function fetchVendorsForEvent(eventId: number) {
  if (typeof window !== "undefined") {
    try {
      const res = await fetch(`/api/admin/events/${eventId}/vendors`);
      if (res.ok) return await res.json();
    } catch {}
    return [];
  }
  try {
    const { rows } = await neonQuery(
      `SELECT v.*, vea.id as assignment_id, vea.commission_rate, vea.flat_fee, vea.status, vea.total_sales, vea.commission_owed, vea.settled_amount
       FROM vendors v
       JOIN vendor_event_assignments vea ON v.id = vea.vendor_id
       WHERE vea.event_id = $1 AND v.deleted_at IS NULL
       ORDER BY v.name ASC`,
      [eventId]
    );
    return rows;
  } catch (err) {
    return [];
  }
}

// ==================== ASSIGNMENTS & SETTLEMENT ====================

export async function assignVendorToEvent(vendorId: number, eventId: number, commissionRate: number = 0, flatFee: number = 0) {
  if (typeof window !== "undefined") {
    const res = await fetch(`/api/admin/vendors/${vendorId}/assign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventId, commissionRate, flatFee })
    });
    if (!res.ok) throw new Error("Failed to assign vendor");
    return await res.json();
  }
  const { rows } = await neonQuery(
    `INSERT INTO vendor_event_assignments (vendor_id, event_id, commission_rate, flat_fee)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (vendor_id, event_id) DO UPDATE SET
       commission_rate = EXCLUDED.commission_rate,
       flat_fee = EXCLUDED.flat_fee
     RETURNING *`,
    [vendorId, eventId, commissionRate, flatFee]
  );
  return rows[0];
}

export async function updateVendorEventAssignment(id: number, updates: Partial<VendorEventAssignment>) {
  if (typeof window !== "undefined") return null; // Used mainly admin side
  const fields = Object.keys(updates).filter(k => !["id", "vendor_id", "event_id", "created_at"].includes(k));
  if (fields.length === 0) return null;
  const setClause = fields.map((f, idx) => `"${f}" = $${idx + 2}`).join(", ");
  const values = fields.map(f => (updates as any)[f]);
  const { rows } = await neonQuery(
    `UPDATE vendor_event_assignments SET ${setClause} WHERE id = $1 RETURNING *`,
    [id, ...values]
  );
  return rows[0];
}

export async function getVendorSettlement(vendorId: number, eventId: number) {
  if (typeof window !== "undefined") return null;
  const { rows } = await neonQuery(
    "SELECT * FROM vendor_event_assignments WHERE vendor_id = $1 AND event_id = $2 LIMIT 1",
    [vendorId, eventId]
  );
  return rows.length > 0 ? rows[0] : null;
}

export async function fetchSettlementsForEvent(eventId: number) {
  if (typeof window !== "undefined") {
    try {
      const res = await fetch(`/api/admin/settlements?eventId=${eventId}`);
      if (res.ok) return await res.json();
    } catch {}
    return [];
  }
  const { rows } = await neonQuery(
    `SELECT vea.*, v.name as vendor_name
     FROM vendor_event_assignments vea
     JOIN vendors v ON vea.vendor_id = v.id
     WHERE vea.event_id = $1
     ORDER BY v.name ASC`,
    [eventId]
  );
  return rows;
}

export async function recordSettlement(assignmentId: number, amount: number) {
  if (typeof window !== "undefined") {
    const res = await fetch("/api/admin/settlements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assignmentId, amount })
    });
    return res.ok;
  }
  await neonQuery(
    `UPDATE vendor_event_assignments
     SET settled_amount = settled_amount + $2,
         status = CASE WHEN (commission_owed - (settled_amount + $2)) <= 0 THEN 'settled' ELSE 'active' END
     WHERE id = $1`,
    [assignmentId, amount]
  );
  return true;
}

export async function exportVendorReport(vendorId: number, eventId: number): Promise<string> {
  if (typeof window !== "undefined") return ""; // typically a route handler returns CSV
  const { rows } = await neonQuery(
    `SELECT ps.id, ps.created_at, ps.total, ps.payment_status,
            (SELECT string_agg(item_name || ' x' || quantity, ', ') FROM pos_sale_items WHERE sale_id = ps.id) as items
     FROM pos_sales ps
     WHERE ps.vendor_id = $1 AND ps.event_id = $2
     ORDER BY ps.created_at DESC`,
    [vendorId, eventId]
  );
  if (rows.length === 0) return "ID,Date,Total,Status,Items\n";
  const header = "ID,Date,Total,Status,Items\n";
  const body = rows.map((r: any) => `${r.id},${r.created_at},${r.total},${r.payment_status},"${r.items}"`).join("\n");
  return header + body;
}

// ==================== OPERATORS & AUTHENTICATION ====================

export async function fetchOperatorsForVendor(vendorId: number): Promise<VendorOperator[]> {
  if (typeof window !== "undefined") {
    try {
      const res = await fetch(`/api/admin/vendors/${vendorId}/operators`);
      if (res.ok) return await res.json();
    } catch {}
    return [];
  }
  const { rows } = await neonQuery("SELECT * FROM vendor_operators WHERE vendor_id = $1 AND is_active = TRUE", [vendorId]);
  return rows;
}

export async function createOperator(data: Omit<VendorOperator, "id" | "is_active">): Promise<VendorOperator> {
  if (typeof window !== "undefined") {
    const res = await fetch(`/api/admin/vendors/${data.vendor_id}/operators`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error("Failed to create operator");
    return await res.json();
  }
  const { rows } = await neonQuery(
    `INSERT INTO vendor_operators (vendor_id, name, pin, role) VALUES ($1, $2, $3, $4) RETURNING *`,
    [data.vendor_id, data.name, data.pin, data.role || "cashier"]
  );
  return rows[0];
}

export async function updateOperator(id: number, updates: Partial<VendorOperator>): Promise<VendorOperator | null> {
  if (typeof window !== "undefined") return null;
  const fields = Object.keys(updates).filter(k => !["id", "vendor_id", "created_at"].includes(k));
  if (fields.length === 0) return null;
  const setClause = fields.map((f, idx) => `"${f}" = $${idx + 2}`).join(", ");
  const values = fields.map(f => (updates as any)[f]);
  const { rows } = await neonQuery(
    `UPDATE vendor_operators SET ${setClause} WHERE id = $1 RETURNING *`,
    [id, ...values]
  );
  return rows.length > 0 ? rows[0] : null;
}

export async function deactivateOperator(id: number): Promise<boolean> {
  if (typeof window !== "undefined") return false;
  await neonQuery("UPDATE vendor_operators SET is_active = FALSE WHERE id = $1", [id]);
  return true;
}

export async function authenticateOperator(pin: string): Promise<{ operator: VendorOperator; vendor: Vendor } | null> {
  if (typeof window !== "undefined") return null; // API only
  const { rows } = await neonQuery(
    `SELECT o.*, v.name as vendor_name, v.logo_url
     FROM vendor_operators o
     JOIN vendors v ON o.vendor_id = v.id
     WHERE o.pin = $1 AND o.is_active = TRUE AND v.deleted_at IS NULL LIMIT 1`,
    [pin]
  );
  if (rows.length === 0) return null;
  const op = rows[0];
  return {
    operator: { id: op.id, vendor_id: op.vendor_id, name: op.name, pin: op.pin, role: op.role, is_active: op.is_active },
    vendor: { id: op.vendor_id, name: op.vendor_name, logo_url: op.logo_url } as unknown as Vendor
  };
}

// ==================== ITEMS & STOCK TRACKING ====================

export async function fetchVendorItems(vendorId: number, eventId: number): Promise<VendorItem[]> {
  if (typeof window !== "undefined") {
    try {
      const res = await fetch(`/api/vendor/items?vendorId=${vendorId}&eventId=${eventId}`);
      if (res.ok) return await res.json();
    } catch {}
    return [];
  }
  const { rows } = await neonQuery(
    "SELECT * FROM vendor_items WHERE vendor_id = $1 AND event_id = $2 AND deleted_at IS NULL ORDER BY sort_order ASC, name ASC",
    [vendorId, eventId]
  );
  return rows;
}

export async function createVendorItem(data: Omit<VendorItem, "id">): Promise<VendorItem> {
  if (typeof window !== "undefined") {
    const res = await fetch("/api/vendor/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error("Failed to create vendor item");
    return await res.json();
  }
  const { rows } = await neonQuery(
    `INSERT INTO vendor_items (vendor_id, event_id, name, category, price, stock_qty, low_stock_threshold, image_url, modifiers, is_available, sort_order)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
    [data.vendor_id, data.event_id, data.name, data.category || "General", data.price, data.stock_qty, data.low_stock_threshold || 5, data.image_url || "", JSON.stringify(data.modifiers || []), data.is_available ?? true, data.sort_order || 0]
  );
  return rows[0];
}

export async function updateVendorItem(id: number, updates: Partial<VendorItem>): Promise<VendorItem | null> {
  if (typeof window !== "undefined") {
    const res = await fetch(`/api/vendor/items/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates)
    });
    if (!res.ok) return null;
    return await res.json();
  }
  const fields = Object.keys(updates).filter(k => !["id", "vendor_id", "event_id", "created_at"].includes(k));
  if (fields.length === 0) return null;
  const setClause = fields.map((f, idx) => `"${f}" = $${idx + 2}`).join(", ");
  const values = fields.map(f => {
    const val = (updates as any)[f];
    if (f === 'modifiers') return JSON.stringify(val);
    return val;
  });
  const { rows } = await neonQuery(
    `UPDATE vendor_items SET ${setClause} WHERE id = $1 RETURNING *`,
    [id, ...values]
  );
  return rows.length > 0 ? rows[0] : null;
}

export async function deleteVendorItem(id: number): Promise<boolean> {
  if (typeof window !== "undefined") {
    const res = await fetch(`/api/vendor/items/${id}`, { method: "DELETE" });
    return res.ok;
  }
  await neonQuery("UPDATE vendor_items SET deleted_at = NOW() WHERE id = $1", [id]);
  return true;
}

export async function adjustStock(itemId: number, quantityChange: number): Promise<boolean> {
  if (typeof window !== "undefined") return false;
  const { rows } = await neonQuery(
    "UPDATE vendor_items SET stock_qty = stock_qty + $2 WHERE id = $1 AND stock_qty IS NOT NULL RETURNING *",
    [itemId, quantityChange]
  );
  return rows.length > 0;
}

// ==================== TRANSACTIONAL POS ENGINE ====================

export async function createPosSale(
  sale: Omit<PosSale, "created_at" | "payment_status" | "voided_by" | "void_reason">,
  items: Omit<PosSaleItem, "id" | "sale_id" | "line_total">[],
  payments: Omit<SplitPayment, "id" | "sale_id">[]
): Promise<boolean> {
  if (typeof window !== "undefined") {
    const res = await fetch("/api/vendor/sell", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sale, items, payments })
    });
    return res.ok;
  }

  // ATOMIC TRANSACTION LOGIC
  const client = await neonConnect();
  try {
    await client.query("BEGIN");

    // 1. Insert Sale
    await client.query(
      `INSERT INTO pos_sales (id, vendor_id, event_id, operator_id, subtotal, total, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [sale.id, sale.vendor_id, sale.event_id, sale.operator_id, sale.subtotal, sale.total, sale.notes || ""]
    );

    // 2. Insert Items & Decrement Stock
    for (const item of items) {
      const lineTotal = item.unit_price * item.quantity + (item.modifiers || []).reduce((sum, mod) => sum + mod.price_add, 0) * item.quantity;
      await client.query(
        `INSERT INTO pos_sale_items (sale_id, item_id, item_name, quantity, unit_price, modifiers, line_total)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [sale.id, item.item_id, item.item_name, item.quantity, item.unit_price, JSON.stringify(item.modifiers || []), lineTotal]
      );
      if (item.item_id) {
        await client.query(
          `UPDATE vendor_items SET stock_qty = stock_qty - $2 WHERE id = $1 AND stock_qty IS NOT NULL`,
          [item.item_id, item.quantity]
        );
      }
    }

    // 3. Insert Split Payments & Update Tabs
    let totalPaidViaTab = 0;
    for (const p of payments) {
      await client.query(
        `INSERT INTO pos_split_payments (sale_id, method, amount, payer_name, payer_phone, mpesa_ref, tab_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [sale.id, p.method, p.amount, p.payer_name || "", p.payer_phone || "", p.mpesa_ref || "", p.tab_id || null]
      );
      if (p.method === 'tab' && p.tab_id) {
        await client.query(
          `UPDATE customer_tabs SET balance = balance + $2 WHERE id = $1`,
          [p.tab_id, p.amount]
        );
        await client.query(
          `INSERT INTO tab_transactions (tab_id, sale_id, type, amount, method, mpesa_ref, operator_id)
           VALUES ($1, $2, 'charge', $3, 'tab', '', $4)`,
          [p.tab_id, sale.id, p.amount, sale.operator_id]
        );
        totalPaidViaTab += p.amount;
      }
    }

    // 4. Update Vendor Assignment Totals
    const { rows: assignmentRows } = await client.query(
      "SELECT commission_rate FROM vendor_event_assignments WHERE vendor_id = $1 AND event_id = $2",
      [sale.vendor_id, sale.event_id]
    );
    const commRate = assignmentRows.length > 0 ? parseFloat(assignmentRows[0].commission_rate) : 0;
    const commOwed = (sale.total * commRate) / 100;
    
    await client.query(
      `UPDATE vendor_event_assignments
       SET total_sales = total_sales + $3, commission_owed = commission_owed + $4
       WHERE vendor_id = $1 AND event_id = $2`,
      [sale.vendor_id, sale.event_id, sale.total, commOwed]
    );

    await client.query("COMMIT");
    return true;
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("ATOMIC POS TRANSACTION FAILED:", e);
    return false;
  } finally {
    client.release();
  }
}

export async function fetchSalesForVendor(vendorId: number, eventId: number, options?: any): Promise<PosSale[]> {
  if (typeof window !== "undefined") {
    try {
      const res = await fetch(`/api/vendor/sales?vendorId=${vendorId}&eventId=${eventId}`);
      if (res.ok) return await res.json();
    } catch {}
    return [];
  }
  const { rows } = await neonQuery(
    "SELECT * FROM pos_sales WHERE vendor_id = $1 AND event_id = $2 ORDER BY created_at DESC LIMIT 500",
    [vendorId, eventId]
  );
  return rows;
}

export async function fetchSaleById(saleId: string): Promise<any> {
  if (typeof window !== "undefined") return null;
  const { rows: saleRows } = await neonQuery("SELECT * FROM pos_sales WHERE id = $1 LIMIT 1", [saleId]);
  if (saleRows.length === 0) return null;
  const sale = saleRows[0];
  const { rows: itemRows } = await neonQuery("SELECT * FROM pos_sale_items WHERE sale_id = $1", [saleId]);
  const { rows: paymentRows } = await neonQuery("SELECT * FROM pos_split_payments WHERE sale_id = $1", [saleId]);
  return { ...sale, items: itemRows, payments: paymentRows };
}

export async function voidSale(saleId: string, voidedBy: number, reason: string): Promise<boolean> {
  if (typeof window !== "undefined") {
    const res = await fetch(`/api/vendor/sales/${saleId}/void`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ voidedBy, reason })
    });
    return res.ok;
  }
  
  const client = await neonConnect();
  try {
    await client.query("BEGIN");
    const { rows: saleRows } = await client.query("SELECT * FROM pos_sales WHERE id = $1 FOR UPDATE", [saleId]);
    if (saleRows.length === 0 || saleRows[0].payment_status === 'voided') {
      await client.query("ROLLBACK");
      return false;
    }
    const sale = saleRows[0];

    // Mark as voided
    await client.query(
      "UPDATE pos_sales SET payment_status = 'voided', voided_by = $2, void_reason = $3 WHERE id = $1",
      [saleId, voidedBy, reason]
    );

    // Restock
    const { rows: items } = await client.query("SELECT * FROM pos_sale_items WHERE sale_id = $1", [saleId]);
    for (const item of items) {
      if (item.item_id) {
        await client.query(
          "UPDATE vendor_items SET stock_qty = stock_qty + $2 WHERE id = $1 AND stock_qty IS NOT NULL",
          [item.item_id, item.quantity]
        );
      }
    }

    // Reverse Tab Balances
    const { rows: payments } = await client.query("SELECT * FROM pos_split_payments WHERE sale_id = $1 AND method = 'tab'", [saleId]);
    for (const p of payments) {
      if (p.tab_id) {
        await client.query("UPDATE customer_tabs SET balance = balance - $2 WHERE id = $1", [p.tab_id, p.amount]);
        // Insert void transaction in tab ledger
        await client.query(
          `INSERT INTO tab_transactions (tab_id, sale_id, type, amount, method, mpesa_ref, operator_id)
           VALUES ($1, $2, 'payment', $3, 'void', '', $4)`,
          [p.tab_id, saleId, p.amount, voidedBy]
        );
      }
    }

    // Reverse Commission
    const { rows: assignmentRows } = await client.query(
      "SELECT commission_rate FROM vendor_event_assignments WHERE vendor_id = $1 AND event_id = $2",
      [sale.vendor_id, sale.event_id]
    );
    const commRate = assignmentRows.length > 0 ? parseFloat(assignmentRows[0].commission_rate) : 0;
    const commReversed = (sale.total * commRate) / 100;
    await client.query(
      `UPDATE vendor_event_assignments
       SET total_sales = total_sales - $3, commission_owed = commission_owed - $4
       WHERE vendor_id = $1 AND event_id = $2`,
      [sale.vendor_id, sale.event_id, sale.total, commReversed]
    );

    await client.query("COMMIT");
    return true;
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("ATOMIC VOID FAILED:", e);
    return false;
  } finally {
    client.release();
  }
}

export async function fetchVendorDashboardMetrics(vendorId: number, eventId: number) {
  if (typeof window !== "undefined") {
    try {
      const res = await fetch(`/api/vendor/metrics?vendorId=${vendorId}&eventId=${eventId}`);
      if (res.ok) return await res.json();
    } catch {}
    return null;
  }
  const { rows } = await neonQuery(
    "SELECT SUM(total) as gross_sales, COUNT(*) as order_count FROM pos_sales WHERE vendor_id = $1 AND event_id = $2 AND payment_status != 'voided'",
    [vendorId, eventId]
  );
  return rows[0];
}

export async function fetchAllVendorMetrics(eventId: number) {
  if (typeof window !== "undefined") return null;
  const { rows } = await neonQuery(
    `SELECT vendor_id, SUM(total) as gross_sales, COUNT(*) as order_count
     FROM pos_sales
     WHERE event_id = $1 AND payment_status != 'voided'
     GROUP BY vendor_id`,
    [eventId]
  );
  return rows;
}

// ==================== CUSTOMER TABS ====================

export async function createTab(data: Omit<CustomerTab, "id" | "balance" | "status" | "created_at" | "settled_at">): Promise<CustomerTab> {
  if (typeof window !== "undefined") {
    const res = await fetch("/api/vendor/tabs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error("Failed to create tab");
    return await res.json();
  }
  const { rows } = await neonQuery(
    `INSERT INTO customer_tabs (customer_name, customer_phone, vendor_id, event_id, credit_limit)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [data.customer_name, data.customer_phone || "", data.vendor_id, data.event_id, data.credit_limit || 5000]
  );
  return rows[0];
}

export async function fetchTabsForVendor(vendorId: number, eventId: number): Promise<CustomerTab[]> {
  if (typeof window !== "undefined") {
    try {
      const res = await fetch(`/api/vendor/tabs?vendorId=${vendorId}&eventId=${eventId}`);
      if (res.ok) return await res.json();
    } catch {}
    return [];
  }
  const { rows } = await neonQuery(
    "SELECT * FROM customer_tabs WHERE vendor_id = $1 AND event_id = $2 ORDER BY created_at DESC",
    [vendorId, eventId]
  );
  return rows;
}

export async function payTab(tabId: number, amount: number, method: string, mpesaRef: string = "", operatorId: number): Promise<boolean> {
  if (typeof window !== "undefined") {
    const res = await fetch(`/api/vendor/tabs/${tabId}/pay`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount, method, mpesaRef, operatorId })
    });
    return res.ok;
  }

  const client = await neonConnect();
  try {
    await client.query("BEGIN");
    await client.query(
      "UPDATE customer_tabs SET balance = balance - $2 WHERE id = $1",
      [tabId, amount]
    );
    await client.query(
      `INSERT INTO tab_transactions (tab_id, type, amount, method, mpesa_ref, operator_id)
       VALUES ($1, 'payment', $2, $3, $4, $5)`,
      [tabId, amount, method, mpesaRef, operatorId]
    );
    await client.query("COMMIT");
    return true;
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("ATOMIC TAB PAY FAILED:", e);
    return false;
  } finally {
    client.release();
  }
}

export async function fetchTabWithTransactions(tabId: number): Promise<any> {
  if (typeof window !== "undefined") return null;
  const { rows: tabs } = await neonQuery("SELECT * FROM customer_tabs WHERE id = $1 LIMIT 1", [tabId]);
  if (tabs.length === 0) return null;
  const tab = tabs[0];
  const { rows: txns } = await neonQuery("SELECT * FROM tab_transactions WHERE tab_id = $1 ORDER BY created_at ASC", [tabId]);
  return { ...tab, transactions: txns };
}

export async function closeTab(tabId: number): Promise<boolean> {
  if (typeof window !== "undefined") {
    const res = await fetch(`/api/vendor/tabs/${tabId}/close`, { method: "POST" });
    return res.ok;
  }
  await neonQuery("UPDATE customer_tabs SET status = 'settled', settled_at = NOW() WHERE id = $1", [tabId]);
  return true;
}

// ==================== CULTURAL HUB & LIFECYCLE ====================

export async function updateEventLifecycle(eventId: number, status: 'scheduled' | 'live' | 'closed'): Promise<boolean> {
  if (typeof window !== "undefined") return false;
  await neonQuery("UPDATE events SET status = $2 WHERE id = $1", [eventId, status]);
  return true;
}

export async function joinEventWaitlist(eventId: number, phoneNumber: string): Promise<boolean> {
  if (typeof window !== "undefined") {
    const res = await fetch("/api/events/waitlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventId, phoneNumber })
    });
    return res.ok;
  }
  try {
    await neonQuery("INSERT INTO event_waitlist (event_id, phone_number) VALUES ($1, $2) ON CONFLICT DO NOTHING", [eventId, phoneNumber]);
    return true;
  } catch (err) {
    return false;
  }
}

export async function fetchEventGallery(eventId: number): Promise<EventGallery[]> {
  if (typeof window !== "undefined") {
    try {
      const res = await fetch(`/api/gallery?eventId=${eventId}`);
      if (res.ok) return await res.json();
    } catch {}
    return [];
  }
  const { rows } = await neonQuery("SELECT * FROM event_gallery WHERE event_id = $1 ORDER BY created_at DESC", [eventId]);
  return rows;
}

export async function fetchRadioSets(eventId?: number): Promise<RadioSet[]> {
  if (typeof window !== "undefined") {
    try {
      const res = await fetch(`/api/radio${eventId ? '?eventId='+eventId : ''}`);
      if (res.ok) return await res.json();
    } catch {}
    return [];
  }
  const query = eventId ? "SELECT * FROM radio_sets WHERE event_id = $1 ORDER BY created_at DESC" : "SELECT * FROM radio_sets ORDER BY created_at DESC";
  const params = eventId ? [eventId] : [];
  const { rows } = await neonQuery(query, params);
  return rows;
}

