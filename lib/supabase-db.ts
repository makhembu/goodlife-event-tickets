import { Ticket, Event, EventDetails, PendingPayment, TicketTier, TicketAudience, NormalizedTicket, EventCustomer } from "./supabase-db-types";
import { getEventAvailability, type SchedulableEvent } from "./event-availability";

// Re-export interface types so all existing pages compile unchanged
export type { Ticket, Event, EventDetails, PendingPayment, TicketTier, TicketAudience, NormalizedTicket, EventCustomer };

// Safe import for server-side pg pool to avoid breaking client bundle builds
export let neonQuery: any = null;
export let neonConnect: any = null;
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

/**
 * The single definition of "this event is allowed to take money".
 *
 * This exists because the same question was being answered in four places
 * with four different answers, and the disagreement was user-visible: the
 * homepage advertised a mini event as "IS LIVE NOW ... PASSES & FREE RSVP
 * AVAILABLE" with a buy link, while the payment routes rejected that same
 * event. A visitor followed the advert and hit a dead end at checkout.
 *
 * The actual rule now lives in `lib/event-availability.ts`, together with the
 * sales-window check that used to be copy-pasted into each route. The three
 * payment routes now call `getEventAvailability` directly so they can render
 * the right wording per endpoint; this boolean wrapper remains for the one
 * caller that only needs a yes/no, the mini-events banner in `app/page.tsx`.
 *
 * IMPORTANT BEHAVIOUR CHANGE: `is_active` is no longer part of the answer.
 * It used to be, which meant a recurring mini-festival could not be sellable
 * without also contending for the single "homepage event" slot that
 * `fetchActiveEvent` reads with `LIMIT 1` - so making Park & Chill sellable
 * would have risked displacing the GOODLIFE 4 flagship. Sellability is now
 * status + sales window + recurrence; `is_active` means "homepage event" only.
 *
 * The parameter is `SchedulableEvent` rather than a hand-picked subset so that
 * a caller cannot silently omit `event_date` and thereby skip the one-off
 * "this event day has passed" gate. A narrower type here would fail OPEN, which
 * is the dangerous direction for a money-taking decision.
 */
export function isEventSellable(e: SchedulableEvent, now?: Date): boolean {
  return getEventAvailability(e, now).sellable;
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
    // `is_active` means "this is the homepage event" and nothing else - see
    // lib/event-availability.ts. It is still a single-row slot, so the ORDER BY
    // is a deliberate tiebreak rather than cosmetics: without it, two active
    // rows meant Postgres could return either one and the homepage would
    // non-deterministically show a mini-festival instead of the flagship.
    // Mini events sort last on purpose, then newest wins.
    const { rows } = await neonQuery(
      "SELECT * FROM events WHERE is_active = TRUE ORDER BY (COALESCE(category, '') = 'mini') ASC, created_at DESC, id DESC LIMIT 1"
    );
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
    // Decide whether this event may take the single `is_active` ("homepage
    // event") slot. See lib/event-availability.ts for why that slot and
    // sellability are separate concerns.
    //
    // Two rules, both of which used to be violated:
    //
    // 1. A MINI event never takes the slot. `is_active` used to be derived
    //    from `status === 'live'`, so creating "SUNDAY PARK & CHILL #13" as
    //    live ran the demote query below and ARCHIVED the GOODLIFE 4 flagship,
    //    leaving the homepage advertising a 2pm mini festival instead of the
    //    main event. The whole point of a recurring mini festival is that it is
    //    sellable without displacing anything, and it was not.
    //
    // 2. A flagship takes the slot only if it is actually free. Planning the
    //    next flagship (GOODLIFE 5) while GOODLIFE 4 is still selling must not
    //    knock GOODLIFE 4 offline - otherwise every "get the next one ready"
    //    action silently takes the site down. There is a deliberate activate
    //    action for switching over (POST /api/events/[id]/archive with
    //    activate), which is where that decision belongs.
    const wantsHomepage = event.is_active === true && event.category !== 'mini';

    let claimsHomepage = false;
    if (wantsHomepage) {
      const { rows: taken } = await neonQuery(
        "SELECT id FROM events WHERE is_active = TRUE AND COALESCE(category, '') <> 'mini' LIMIT 1"
      );
      claimsHomepage = !taken || taken.length === 0;
    }

    // Demote the incumbent WITHOUT archiving it. `archived_at` means "moved to
    // trash", and nothing about creating a new event is a decision to trash the
    // old one - that silently destroyed the previous flagship's presence in the
    // dashboard and, with it, any admin's mental model of where tickets went.
    if (claimsHomepage) {
      await neonQuery("UPDATE events SET is_active = FALSE WHERE is_active = TRUE");
    }

    // Unrelated to the homepage slot: whether this is a "schedule-only"
    // announcement. Kept separate from `claimsHomepage` on purpose - tying the
    // two together would mean a live flagship created while the slot was taken
    // (correctly) declined the slot, and then had its status silently rewritten
    // to 'scheduled'. Losing the homepage slot must not cost you "live".
    const isScheduleOnly = event.status === 'scheduled' || event.is_active === false;

    // Create new event
    const { rows } = await neonQuery(
      `INSERT INTO events (
        title, subtitle, tag, venue, flyer_url, logo_url, regulations, 
        ticker_text, till_number, event_date, is_active, status, category,
        sales_open_date, sales_close_date, next_event_title, recap_video_url,
        max_tent_inventory, max_shared_beds, recurrence_pattern, recurrence_day,
        recurrence_time, custom_schedule_text, maps_url
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24)
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
        event.event_date || null,
        claimsHomepage,
        event.status || (isScheduleOnly ? 'scheduled' : 'live'),
        event.category || 'flagship',
        event.sales_open_date || null,
        event.sales_close_date || null,
        event.next_event_title || '',
        event.recap_video_url || '',
        // `??` not `||`. A mini festival legitimately has ZERO tent inventory,
        // and the Create Event modal sets exactly that — but `0 || 30` is 30,
        // so every mini was being stored with the flagship's 30 tents and 12
        // beds. The preset was silently discarded.
        event.max_tent_inventory ?? 30,
        event.max_shared_beds ?? 12,
        event.recurrence_pattern || 'none',
        event.recurrence_day || 'sunday',
        event.recurrence_time || '14:00',
        event.custom_schedule_text || '',
        event.maps_url || ''
      ]
    );
    const newEvent = rows[0];

    // Carry the pricing ladder across to a new edition.
    //
    // Cloning IS right for a flagship rollover — prices carry year to year, and
    // retyping eight tiers annually is how mistakes happen. Two things about
    // the old query were wrong, though:
    //
    //   1. ORDER BY (COALESCE(category,'') = 'mini') ASC puts non-mini first
    //      UNCONDITIONALLY — 0 for flagship, 1 for mini. The new event's own
    //      category was never consulted, so a brand-new mini festival always
    //      cloned the flagship and never cloned another mini. That is where
    //      "SUNDAY PARK & CHILL" quietly acquired five camping tents came from.
    //   2. The donor was allowed to be closed or archived, so an event that
    //      concluded 18 months ago was a perfectly valid source.
    //
    // Both fixed below: match on category, and require a usable donor.
    const { rows: prevTiers } = await neonQuery(
      `SELECT * FROM ticket_tiers
        WHERE deleted_at IS NULL
          AND event_id = (
            SELECT id FROM events
             WHERE id <> $1
               AND archived_at IS NULL
               AND LOWER(COALESCE(status, '')) NOT IN ('closed', 'archived')
               AND (COALESCE(category, 'flagship') = COALESCE($2, 'flagship'))
             ORDER BY created_at DESC, id DESC
             LIMIT 1
          )`,
      [newEvent.id, event.category || 'flagship']
    );

    // NO fallback ladder. An event with no tiers is a valid starting state that
    // the admin completes, not one the database invents on their behalf.
    const sourceTiers = prevTiers && prevTiers.length > 0 ? prevTiers : [];
    // Report what was copied so the UI can tell the admin, instead of 8 tiers
    // appearing from nowhere.
    const copiedFromEventId = sourceTiers.length > 0 ? sourceTiers[0].event_id : null;

    for (const tier of sourceTiers) {
      await neonQuery(
        `INSERT INTO ticket_tiers (
          id, name, price, description, tag, show_only_on_event_day, hide_on_event_day,
          available_from, available_until, max_quantity, event_id, tier_category,
          admits_quantity, is_camping_bundle, camping_type, badge_text, tour_media_urls
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, NULL, NULL, NULL, $8, $9, $10, $11, $12, NULL, $13)
         ON CONFLICT (id, event_id) DO UPDATE SET
           name = EXCLUDED.name,
           price = EXCLUDED.price,
           description = EXCLUDED.description`,
        [
          tier.id,
          tier.name,
          tier.price,
          tier.description,
          // Tag carries the TICKETS/CAMPING grouping, which is a property of
          // the pass itself, so it travels with it.
          tier.tag || 'TICKETS',
          tier.show_only_on_event_day ?? false,
          tier.hide_on_event_day ?? false,
          newEvent.id,
          tier.tier_category || (tier.tag === 'CAMPING' ? 'camping' : 'entry'),
          tier.admits_quantity || 1,
          tier.is_camping_bundle ?? (tier.tag === 'CAMPING'),
          tier.camping_type || (tier.id?.includes('shared') ? 'shared_bed' : tier.tag === 'CAMPING' ? 'private' : 'none'),
          // available_from, available_until, max_quantity and badge_text are
          // deliberately NOT copied. They are absolute values belonging to an
          // event that has already happened: a cloned `available_until` of
          // 2025-10-31 makes the tier permanently invisible rather than merely
          // late, and a cloned max_quantity resets scarcity to zero because
          // sold_count is recomputed from tickets for the new event. An admin
          // sets these for the new edition in seconds.
          JSON.stringify(tier.tour_media_urls || [])
        ]
      );
    }

    // Sync event_details table for backward compatibility if live
    if (!isScheduleOnly) {
      await neonQuery(
        `INSERT INTO event_details (id, title, subtitle, tag, venue, till_number, flyer_url, regulations, ticker_text, logo_url)
         VALUES (1, $1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (id) DO UPDATE SET
           title = EXCLUDED.title, subtitle = EXCLUDED.subtitle, tag = EXCLUDED.tag,
           venue = EXCLUDED.venue, till_number = EXCLUDED.till_number, flyer_url = EXCLUDED.flyer_url,
           regulations = EXCLUDED.regulations, ticker_text = EXCLUDED.ticker_text, logo_url = EXCLUDED.logo_url`,
        [newEvent.title, newEvent.subtitle, newEvent.tag, newEvent.venue, newEvent.till_number, newEvent.flyer_url, newEvent.regulations, newEvent.ticker_text, newEvent.logo_url]
      );
    }

    return {
      ...newEvent,
      created_at: newEvent.created_at ? new Date(newEvent.created_at).toISOString() : new Date().toISOString(),
      archived_at: null,
      event_date: newEvent.event_date ? new Date(newEvent.event_date).toISOString() : null,
      // Non-persisted, so the Create Event modal can say what happened instead
      // of eight tiers appearing from nowhere. Sale windows and capacities are
      // intentionally NOT inherited — see the loop above.
      copied_tier_count: sourceTiers.length,
      copied_tiers_from_event_id: copiedFromEventId
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
    // ALLOWLIST, not "exclude id and created_at".
    //
    // The previous filter let every other key in the request body become a
    // column name in `SET "key" = $n`. That is an admin-only route, so it is
    // not directly exploitable, but it means the route's blast radius is
    // "whatever column name happens to type": a typo writes junk, and a payload
    // that reaches this route by any other path can set `archived_at`,
    // `is_active`, `recurrence_*` or anything else without anyone intending it.
    // An allowlist keeps the write surface equal to the form's fields.
    // `simulators_enabled` is deliberately absent: it lives on the
    // `event_details` singleton, not on `events`.
    const MUTABLE_EVENT_FIELDS = new Set<string>([
      'title', 'subtitle', 'tag', 'venue', 'flyer_url', 'logo_url', 'regulations',
      'ticker_text', 'till_number', 'event_date', 'status', 'is_active',
      'sales_open_date', 'sales_close_date', 'next_event_title', 'recap_video_url',
      'category', 'recurrence_pattern', 'recurrence_day', 'recurrence_time',
      'custom_schedule_text', 'max_tent_inventory', 'max_shared_beds', 'maps_url',
      'archived_at'
    ]);

    const fields = Object.keys(updates).filter((k) => MUTABLE_EVENT_FIELDS.has(k));
    if (fields.length === 0) return await getEventById(id);

    const rejected = Object.keys(updates).filter((k) => !fields.includes(k));
    if (rejected.length > 0) {
      console.warn(`updateEvent(${id}) ignored non-editable field(s): ${rejected.join(", ")}`);
    }

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
        `INSERT INTO event_details (id, title, subtitle, tag, venue, till_number, flyer_url, regulations, ticker_text, logo_url, maps_url)
         VALUES (1, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (id) DO UPDATE SET
           title = EXCLUDED.title, subtitle = EXCLUDED.subtitle, tag = EXCLUDED.tag,
           venue = EXCLUDED.venue, till_number = EXCLUDED.till_number, flyer_url = EXCLUDED.flyer_url,
           regulations = EXCLUDED.regulations, ticker_text = EXCLUDED.ticker_text, logo_url = EXCLUDED.logo_url,
           maps_url = EXCLUDED.maps_url`,
        [r.title, r.subtitle, r.tag, r.venue, r.till_number, r.flyer_url, r.regulations, r.ticker_text, r.logo_url, r.maps_url || '']
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

// Archive event: hide it from the public site entirely.
//
// The name is load-bearing. This is NOT "conclude the event" - use `closeEvent`
// for that. `archived_at` makes `/` return 404 for the event and hides it from
// the editions switcher, which is right for "we are done with this edition and
// do not want it in the running" and wrong for "the festival happened".
export async function archiveEvent(id: number): Promise<boolean> {
  if (typeof window !== "undefined") {
    try {
      const res = await fetch(`/api/events/${id}/archive`, {
        method: "POST",
        body: JSON.stringify({ mode: "archive" })
      });
      return res.ok;
    } catch (e) {
      console.warn("API archiveEvent failed.", e);
      return false;
    }
  }

  try {
    await neonQuery(
      "UPDATE events SET is_active = FALSE, status = 'closed', archived_at = NOW() WHERE id = $1",
      [id]
    );
    return true;
  } catch (err) {
    console.error("Neon archiveEvent error:", err);
    return false;
  }
}

/**
 * Conclude an event: `status = 'closed'`, still routable, shows the recap page.
 *
 * This did not exist as a separate operation. The dashboard's "END / CLOSE"
 * button called `archiveEvent`, which also stamped `archived_at` - so concluding
 * an edition also HID it. The confirm dialog promised visitors "the Event
 * Concluded page" and the row ended up 404ing on the homepage and vanishing from
 * the editions switcher. Closing and archiving are different decisions and now
 * have different functions.
 */
export async function closeEvent(id: number): Promise<boolean> {
  if (typeof window !== "undefined") {
    try {
      const res = await fetch(`/api/events/${id}/archive`, {
        method: "POST",
        body: JSON.stringify({ mode: "close" })
      });
      return res.ok;
    } catch (e) {
      console.warn("API closeEvent failed.", e);
      return false;
    }
  }

  try {
    // `is_active = FALSE` only. `status` becomes 'closed' so `getEventAvailability`
    // refuses payment and `publicState` picks the recap page. `archived_at` is
    // deliberately untouched: an already-archived event stays hidden until
    // someone explicitly re-opens it.
    await neonQuery("UPDATE events SET is_active = FALSE, status = 'closed' WHERE id = $1", [id]);
    return true;
  } catch (err) {
    console.error("Neon closeEvent error:", err);
    return false;
  }
}

// Set event as active (deactivate others, sync event_details)
export async function setActiveEvent(id: number): Promise<boolean> {
  if (typeof window !== "undefined") {
    try {
      const res = await fetch(`/api/events/${id}/archive`, {
        method: "POST",
        body: JSON.stringify({ mode: "activate" })
      });
      return res.ok;
    } catch (e) {
      console.warn("API setActiveEvent failed.", e);
      return false;
    }
  }

  try {
    // Deactivate all events
    await neonQuery("UPDATE events SET is_active = FALSE");
    // Activate the selected event.
    //
    // This wrote `status = 'active'`, which `getEventAvailability` does not
    // accept (`status !== "live" && status !== "scheduled"`), so every re-opened
    // event rendered a working checkout page and then refused every payment as
    // "not live". 'live' is the value that means live. `canonicalStatus` now
    // reads the old spelling too, so rows written before this fix recover.
    //
    // `archived_at = NULL` is kept: re-opening is how an archived edition comes
    // back. A future `sales_open_date` is NOT cleared - `getEventAvailability`
    // still enforces it, so an event that was scheduled for a future drop
    // correctly lands on the coming-soon page rather than selling early.
    await neonQuery("UPDATE events SET is_active = TRUE, status = 'live', archived_at = NULL WHERE id = $1", [id]);

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

/**
 * The `localStorage` ticket mirror is GONE, deliberately.
 *
 * This used to be a "robustness fallback": if a request to the API failed for
 * any reason, the module quietly served a copy of the ledger out of
 * `localStorage["goodlife_tickets"]`, and — worse — for writes it *wrote to
 * localStorage and returned success*.
 *
 * That was not robustness, it was a lie, and it had three separate failure
 * modes that all bit in production:
 *
 *   1. It resurrected deleted customers. `scripts/seed-tickets.js` had inserted
 *      three fake passes ("John Doe", "Alice Smith", "Bob Johnson") with no
 *      `event_id`. Once those rows were removed from Neon, the key still held
 *      them, so the admin ledger showed a ticket that no longer existed, with
 *      no event attached, flickering in and out of view every time the 30s
 *      auto-refresh alternated between a good response and a bad one. The
 *      "UNASSIGNED" event label was the giveaway: real tickets always have one.
 *
 *   2. **Gate scans reported admissions that never happened.** `processTicketScan`
 *      fell through to mutating localStorage and returning `success: true` with
 *      an "Admitted 1 guest" message when the network call failed. An operator
 *      at a gate was told a ticket was used, and the gate list was unchanged.
 *      This is a security failure, not a display one.
 *
 *   3. **Deletes and updates reported success without persisting.**
 *      `deleteTicket` returned `true` and `updateTicket` returned the mutated
 *      object while the database kept the old row, so the UI and the ledger
 *      disagreed.
 *
 * Any one of those fires on a routine 401 after a session expiry, or a blip of
 * mobile data — which is exactly when the admin console is being used at a
 * gate. Neon is the single source of truth; a request that did not reach it did
 * not happen, and the code now says so instead of inventing an outcome.
 */

/**
 * One-time cleanup of the legacy mirror, so any browser that still carries a
 * ghost ledger drops it. A ticket the operator can see is a ticket they might
 * act on, so this runs on the admin dashboard rather than waiting for a
 * rewrite. The write path is gone, so the key can only ever grow stale.
 */
export function purgeLegacyTicketMirror(): number {
  if (typeof window === "undefined") return 0;
  let removed = 0;
  try {
    const raw = localStorage.getItem("goodlife_tickets");
    if (raw) {
      removed = (JSON.parse(raw) as unknown[]).length || 0;
      localStorage.removeItem("goodlife_tickets");
    }
  } catch {
    try { localStorage.removeItem("goodlife_tickets"); } catch {}
  }
  return removed;
}

// Fetch all tickets (optionally filtered by eventId, -1 = all events)
export async function fetchAllTickets(eventId?: number): Promise<Ticket[]> {
  if (typeof window !== "undefined") {
    // Throw rather than return a substitute. `fetchDashboardMetrics` catches this
    // and sets `metricsError`, which the dashboard renders as a visible banner —
    // so a failed refresh tells the operator, instead of quietly swapping the
    // real ledger for a stale copy (or, worse, an empty one that reads as
    // "no tickets sold").
    const url = eventId === -1 ? "/api/admin/tickets?eventId=-1" : eventId ? `/api/admin/tickets?eventId=${eventId}` : "/api/admin/tickets";
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(
        `Could not load tickets from the server (HTTP ${res.status}). Nothing has been changed — the figures on screen may be out of date.`
      );
    }
    return await res.json();
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
    // The server branch also ended in a cache: on a database error it returned
    // the in-process mirror, which on a serverless function is per-lambda and
    // so usually empty — reading as "zero tickets sold" rather than "the query
    // failed". Throw, so callers surface a real error.
    console.error("Neon fetchAllTickets error:", err);
    throw new Error(
      `Could not load tickets from the database. Nothing has been changed — the figures on screen may be out of date.`
    );
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
/**
 * Staff / crew / vendor / complimentary passes are namespaced `CREW/<role>` by
 * the dashboard crew form (SECURITY, BAR, STAGE, MEDIA, VENDOR). A zero
 * `amount_paid` is treated as staff too, which catches comps and giveaways that
 * were never given a CREW prefix, and any tier explicitly tagged CREW.
 *
 * WHY THIS DOES NOT LOOK AT THE TIER'S PRICE
 * -------------------------------------------
 * It used to. The rule was "zero paid is a comp, UNLESS the tier it points at
 * is currently free", and that `tier.price` is the tier's price *right now*,
 * not what the customer was charged. Repricing a tier therefore silently
 * reclassified every ticket already sold against it: the SUNDAY PARK & CHILL
 * weekday RSVP went from KES 0 to KES 250, and each KES 0 ticket issued while it
 * was free fell through to the comp branch, moved from the customer ledger to
 * the staff ledger, and vanished from the default view, the sold total, the tier
 * breakdown and the CSV export. Nothing was wrong with the tickets; only the
 * price of a tier they happened to reference had changed.
 *
 * Interpreting a historical sale from present-day configuration is the defect,
 * so the dependency is gone rather than the number being corrected. `tier` is
 * still consulted, but only for its `CREW` tag, which is a label an operator
 * sets deliberately and which means the same thing across the tier's life.
 *
 * Every pass in the ladder is now paid, so a zero-paid ticket really is a comp.
 * If a genuinely free public tier is ever reintroduced it must be marked
 * explicitly - a `FREE PUBLIC` tag handled here, or a stored flag on the ticket
 * written at issue time. Do not reintroduce a price comparison here.
 */
function classifyStaffTicket(rawType: string, amountPaid: number, tier: TicketTier | null): boolean {
  const raw = (rawType || "").trim();
  if (/^CREW(\/|$)/i.test(raw)) return true;
  if (tier && String(tier.tag || "").toUpperCase() === "CREW") return true;
  if (Number(amountPaid) !== 0) return false;
  return true;
}

/** event_id -> title, memoized for the life of the server/client bundle. */
let eventLabelCache: Record<string, string> | null = null;

/**
 * event_id -> ISO event_date, same memoization. Kept separate from the label
 * cache because the dashboard needs the date to sanity-check sales: an event
 * that has not happened yet should not already have a ledger.
 */
let eventDateCache: Record<string, string | null> | null = null;

export async function fetchDashboardMetrics(eventId?: number, audience: TicketAudience = "customers") {
  const allTickets = await fetchAllTickets(eventId);

  let configuredTiers: TicketTier[] = [];
  try {
    configuredTiers = await fetchTicketTiers(eventId && eventId > 0 ? eventId : undefined);
  } catch {}

  // --- Read-time tier resolution -------------------------------------------
  // ticket_type is written three different ways (PayHero -> tier NAME, manual
  // form -> tier ID, crew form -> "CREW/<role>"). Build both lookup directions
  // once so the ledger can show one canonical label for all of them.
  const tierById = new Map<string, TicketTier>();
  const tierByName = new Map<string, TicketTier>();
  configuredTiers.forEach(t => {
    tierById.set(String(t.id).trim().toLowerCase(), t);
    tierByName.set(t.name.trim().toLowerCase(), t);
  });
  const resolveTier = (rawType: string): TicketTier | null => {
    const key = (rawType || "").trim().toLowerCase();
    if (!key) return null;
    return tierById.get(key) ?? tierByName.get(key) ?? null;
  };

  const normalized: NormalizedTicket[] = allTickets.map(t => {
    const rawType = (t.ticket_type || "").trim();
    const tier = resolveTier(rawType);
    return {
      ...t,
      tier_label: tier ? tier.name : (rawType || "General"),
      is_staff: classifyStaffTicket(rawType, Number(t.amount_paid), tier)
    };
  });

  // --- Audience split ------------------------------------------------------
  const tickets = audience === "all"
    ? normalized
    : normalized.filter(t => (audience === "staff") === t.is_staff);

  const totalCashCollected = tickets.reduce((sum, t) => sum + Number(t.amount_paid), 0);
  const totalTicketsSold = tickets.length;
  const scanCount = tickets.filter(t => t.is_scanned).length;
  const staffPasses = normalized.filter(t => t.is_staff).length;

  // --- Tier breakdown over the audience-filtered set only ------------------
  const campingTiers: Record<string, {
    sold: number;
    revenue: number;
    cap?: number;
    name?: string;
    tag?: string;
    /** Lowest / highest amount actually paid in this bucket. */
    minPaid?: number;
    maxPaid?: number;
  }> = {};

  /**
   * Tiers ladder: once a tier sells past a threshold its price steps up, so
   * the amount paid is NOT constant even though the tier name is. Tracking the
   * real range is what lets the UI say "KES 500-700" instead of trusting a name
   * like "ADV 500" that stopped being true partway through the sale.
   */
  const addSale = (key: string, amount: number) => {
    const bucket = campingTiers[key];
    bucket.sold += 1;
    bucket.revenue += amount;
    bucket.minPaid = bucket.minPaid === undefined ? amount : Math.min(bucket.minPaid, amount);
    bucket.maxPaid = bucket.maxPaid === undefined ? amount : Math.max(bucket.maxPaid, amount);
  };

  // 1. Seed with event's configured tiers (deduplicating by normalized name)
  configuredTiers.forEach(tier => {
    const isCrewTier = String(tier.tag || "").toUpperCase() === "CREW";
    // Seeding every configured tier would add zero-sale rows for tiers outside
    // the current audience (e.g. crew tiers when viewing customers). Skip them
    // so the card cannot contradict the audience filter.
    if (audience === "customers" && isCrewTier) return;
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
    const tier = resolveTier(rawType);
    // Prefer the resolved tier's id as the bucket so name/id encodings converge.
    const preferredKey = tier?.id ? String(tier.id) : rawType;
    const matchedKey = Object.keys(campingTiers).find(k =>
      k.toLowerCase() === rawType.toLowerCase() ||
      campingTiers[k].name?.toLowerCase() === rawType.toLowerCase() ||
      k.toLowerCase().startsWith(rawType.toLowerCase()) ||
      rawType.toLowerCase().startsWith(k.toLowerCase())
    );

    if (matchedKey) {
      addSale(matchedKey, Number(t.amount_paid));
    } else {
      if (!campingTiers[preferredKey]) {
        campingTiers[preferredKey] = {
          sold: 0,
          revenue: 0,
          name: tier ? tier.name : rawType,
          tag: tier?.tag || (t.is_staff ? "CREW" : "TICKETS")
        };
      }
      addSale(preferredKey, Number(t.amount_paid));
    }
  });

  const oneDayAgo = Date.now() - 24 * 3600 * 1000;
  const recentSalesAmount = tickets
    .filter(t => new Date(t.purchase_time).getTime() > oneDayAgo)
    .reduce((sum, t) => sum + Number(t.amount_paid), 0);

  // --- Event labels so the ledger can show which event each row belongs to --
  // This module is imported by the CLIENT dashboard, so every call here is an
  // HTTP round-trip to our own API. It used to call `fetchAllEvents()` twice —
  // once behind the cache guard, then again unconditionally for `allEvents` —
  // so every single dashboard refresh (including the 30s auto-refresh and every
  // event switch) paid for a duplicate `/api/events` request it had already
  // made. One call, reused for both purposes, and never cached as a list, so
  // creating an event is still immediately visible in the switcher.
  let eventLabels: Record<string, string> = {};
  let eventDates: Record<string, string | null> = {};
  let allEvents: Event[] = [];
  try {
    const events = await fetchAllEvents();
    allEvents = events;
    if (events.length > 0) {
      // Never cache an empty result: a single transient failure would otherwise
      // blank the EVENT column for the rest of the session.
      const next: Record<string, string> = {};
      const dates: Record<string, string | null> = {};
      events.forEach(e => {
        next[String(e.id)] = e.title;
        dates[String(e.id)] = e.event_date || null;
      });
      eventLabelCache = next;
      eventDateCache = dates;
    }
  } catch (e: any) {
    // `allEvents` drives the event switcher and the status badge, so this is
    // worth surfacing rather than silently rendering an empty switcher.
    console.error("fetchAllEvents failed; event labels and switcher will be empty:", e);
  }
  eventLabels = eventLabelCache || {};
  eventDates = eventDateCache || {};

  return {
    totalCashCollected,
    totalTicketsSold,
    scanCount,
    campingTiers,
    recentSalesAmount,
    tickets,
    staffPasses,
    eventLabels,
    eventDates,
    allEvents
  };
}

// Get single ticket
export async function getTicketById(id: string): Promise<Ticket | null> {
  if (typeof window !== "undefined") {
    // No local-mirror fallback (see the note on `purgeLegacyTicketMirror`).
    // "Not found" and "could not ask" must not look the same: a scanner that
    // cannot reach the gate API has to be told to retry, not told the pass is
    // invalid.
    const res = await fetch(`/api/admin/tickets/${encodeURIComponent(id)}`);
    if (!res.ok) {
      if (res.status === 404) return null;
      throw new Error(
        `Could not reach the gate server (HTTP ${res.status}). This scan was NOT recorded — please retry.`
      );
    }
    return await res.json();
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
    scanned_by: null,
    guest_count: ticket.guest_count || 1,
    admitted_count: ticket.admitted_count || 0,
    is_camping: ticket.is_camping || false,
    camping_type: ticket.camping_type || "none"
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
        guest_count: r.guest_count != null ? Number(r.guest_count) : 1,
        admitted_count: r.admitted_count != null ? Number(r.admitted_count) : 0,
        is_camping: Boolean(r.is_camping),
        camping_type: r.camping_type || "none",
        purchase_time: r.purchase_time ? new Date(r.purchase_time).toISOString() : new Date().toISOString(),
        scanned_at: r.scanned_at ? new Date(r.scanned_at).toISOString() : null
      };
    }
    let resolvedEventId = newTicket.event_id;
    if (!resolvedEventId) {
      const active = await fetchActiveEvent();
      resolvedEventId = active?.id || 1;
    }

    // Auto-resolve camping and group details from tier if missing
    let guestCount = newTicket.guest_count || 1;
    let isCamping = newTicket.is_camping || false;
    let campingType = newTicket.camping_type || "none";

    try {
      const { rows: matchedTiers } = await neonQuery(
        "SELECT admits_quantity, is_camping_bundle, camping_type FROM ticket_tiers WHERE event_id = $1 AND (id = $2 OR LOWER(TRIM(name)) = LOWER(TRIM($2))) LIMIT 1",
        [resolvedEventId, newTicket.ticket_type]
      );
      if (matchedTiers.length > 0) {
        const mt = matchedTiers[0];
        if (!newTicket.guest_count && mt.admits_quantity) guestCount = Number(mt.admits_quantity);
        if (newTicket.is_camping === undefined && mt.is_camping_bundle != null) isCamping = Boolean(mt.is_camping_bundle);
        if ((!newTicket.camping_type || newTicket.camping_type === "none") && mt.camping_type) campingType = mt.camping_type;
      }
    } catch {}

    await neonQuery(
      `INSERT INTO tickets (
        id, mpesa_receipt, phone_number, ticket_type, amount_paid, 
        purchase_time, is_scanned, scanned_at, scanned_by, buyer_name, 
        whatsapp_number, event_id, guest_count, admitted_count, is_camping, camping_type
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
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
        resolvedEventId,
        guestCount,
        0,
        isCamping,
        campingType
      ]
    );
    return {
      ...newTicket,
      event_id: resolvedEventId,
      guest_count: guestCount,
      admitted_count: 0,
      is_camping: isCamping,
      camping_type: campingType
    };
  } catch (err) {
    console.error("Neon createTicket error:", err);
    throw err;
  }
}

// Process scanned ticket with multi-event checking, incremental entry, and camping instructions
export async function processTicketScan(
  id: string, 
  scannerName: string = "Admin Guard",
  gateEventId?: number,
  admitCount: number = 1
): Promise<{ 
  success: boolean; 
  message: string; 
  scannedAt?: string; 
  alreadyScanned?: boolean; 
  ticket?: Ticket;
  camping_instruction?: string;
  admitted_count?: number;
  guest_count?: number;
}> {
  const ticket = await getTicketById(id);
  
  if (!ticket) {
    return {
      success: false,
      message: `Invalid Ticket! ID: ${id} could not be resolved in the GOODLIFE database.`
    };
  }

  // Cross-Event Gate Scan Defense (Scenario S1)
  if (gateEventId && ticket.event_id && Number(ticket.event_id) !== Number(gateEventId)) {
    return {
      success: false,
      alreadyScanned: false,
      ticket,
      message: `INVALID EVENT! Ticket is for Event #${ticket.event_id}, not the current Gate Event #${gateEventId}. ENTRY REJECTED.`
    };
  }

  const totalGuests = Number(ticket.guest_count) || 1;
  const currentAdmitted = Number(ticket.admitted_count) || 0;

  if (ticket.is_scanned || currentAdmitted >= totalGuests) {
    return {
      success: false,
      alreadyScanned: true,
      scannedAt: ticket.scanned_at || ticket.purchase_time,
      ticket,
      message: `TICKET ALREADY FULLY SCANNED! All ${totalGuests} guest(s) were admitted on ${new Date(ticket.scanned_at || "").toLocaleTimeString()} by ${ticket.scanned_by || "Unknown"}. ENTRY REJECTED.`
    };
  }

  const countToAdmit = Math.max(1, Math.min(Number(admitCount) || 1, totalGuests - currentAdmitted));
  const newAdmitted = currentAdmitted + countToAdmit;
  const isFullyAdmitted = newAdmitted >= totalGuests;
  const scannedAt = new Date().toISOString();

  // Camping instruction resolution
  let campingInstruction = "";
  if (ticket.camping_type === 'shared_bed' || ticket.ticket_type?.toLowerCase().includes("shared") || ticket.ticket_type?.toLowerCase().includes("bed")) {
    campingInstruction = "🛌 SHARED DORM TENT — ISSUE DORMITORY WRISTBAND & BED NUMBER";
  } else if (ticket.is_camping || ticket.camping_type === 'private' || ticket.ticket_type?.toLowerCase().includes("tent")) {
    campingInstruction = "⛺ PRIVATE TENT — ISSUE TENT KEY & CAMPING WRISTBAND";
  }

  const updatedTicket: Ticket = {
    ...ticket,
    is_scanned: isFullyAdmitted,
    scanned_at: scannedAt,
    scanned_by: scannerName,
    admitted_count: newAdmitted,
    guest_count: totalGuests
  };

  if (typeof window !== "undefined") {
    // This path used to fall through to mutating localStorage and returning
    // `success: true` with an "Admitted N guest(s)" message whenever the request
    // failed. So a gate operator could be told a pass was used while the gate
    // list was completely unchanged — the same pass would then admit the next
    // person, and the first admission was never recorded.
    //
    // A scan that did not reach the server has not happened. Say so, loudly,
    // and tell the operator to retry.
    let res: Response;
    try {
      res = await fetch(`/api/admin/scan/${encodeURIComponent(id)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scanned_by: scannerName, event_id: gateEventId, admit_count: countToAdmit })
      });
    } catch (e: any) {
      return {
        success: false,
        ticket,
        message: `NETWORK FAILURE — SCAN NOT RECORDED. The gate server could not be reached, so nobody has been admitted yet. Check your connection and scan again. Do NOT admit on this result.`
      };
    }
    if (!res.ok) {
      let detail = "";
      try {
        detail = (await res.json())?.message || (await res.text())?.slice(0, 200) || "";
      } catch {}
      return {
        success: false,
        ticket,
        message: `SCAN REJECTED BY SERVER (HTTP ${res.status})${detail ? ` — ${detail}` : ""}. Nothing was recorded; nobody has been admitted.`
      };
    }
    return await res.json();
  }

  // Server side - Neon SQL
  try {
    await neonQuery(
      `UPDATE tickets 
       SET is_scanned = $1, 
           scanned_at = $2, 
           scanned_by = $3, 
           admitted_count = $4 
       WHERE id = $5 AND deleted_at IS NULL`,
      [isFullyAdmitted, scannedAt, scannerName, newAdmitted, id]
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

    const countStatus = totalGuests > 1 
      ? `ADMITTED ${countToAdmit} GUESTS (${newAdmitted}/${totalGuests})`
      : `VALID TICKET`;

    const fullMsg = campingInstruction
      ? `SUCCESS! ${countStatus} [${ticket.ticket_type}]. ${campingInstruction}`
      : `SUCCESS! ${countStatus} [${ticket.ticket_type}]. Welcome to GOODLIFE!`;

    return {
      success: true,
      ticket: updatedTicket,
      message: fullMsg,
      camping_instruction: campingInstruction,
      admitted_count: newAdmitted,
      guest_count: totalGuests
    };
  } catch (err) {
    console.error("Neon processTicketScan error:", err);
    return {
      success: true,
      ticket: updatedTicket,
      message: `SUCCESS! Ticket ${id} scanned, but database sync pending.`
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
  maps_url: "https://www.google.com/maps/search/?api=1&query=MARARA+CAMP,+THIKA",
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
      `INSERT INTO event_details (id, title, subtitle, tag, venue, till_number, flyer_url, regulations, ticker_text, logo_url, event_date, simulators_enabled, operator_notifications_enabled, footer_title, footer_legal, whatsapp_message, payment_contact, whatsapp_operator_template, whatsapp_scan_template, maps_url)
       VALUES (1, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $18, $11, $12, $13, $14, $15, $16, $17, $19)
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
         whatsapp_scan_template = EXCLUDED.whatsapp_scan_template,
         maps_url = EXCLUDED.maps_url`,
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
        updated.whatsapp_scan_template || "",
        updated.maps_url || ""
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
    // Previously this returned `updatedTicket` — an optimistic object the UI
    // then rendered as saved — whenever the request failed. The database kept
    // the old values, so the ledger and the screen disagreed with no error
    // anywhere. Fail honestly instead; callers already handle null.
    const res = await fetch(`/api/admin/tickets/${encodeURIComponent(id)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates)
    });
    if (!res.ok) {
      const err = new Error(
        `Could not save changes to ticket ${id} (HTTP ${res.status}). Nothing was changed.`
      ) as Error & { status?: number };
      err.status = res.status;
      throw err;
    }
    return await res.json();
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
    // Previously returned `true` on failure, so the dashboard removed the row
    // from the screen and reported success while the ticket stayed live in the
    // database — a "deleted" attendee who then walks in. Return the server's
    // real answer.
    const res = await fetch(`/api/admin/tickets/${encodeURIComponent(id)}`, {
      method: "DELETE"
    });
    return res.ok;
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

// Soft-delete ticket tier.
// Event-scoped: `ticket_tiers`' key is `(id, event_id)`, so `WHERE id = $1`
// alone trashed the same tier id in every event.
export async function deleteTicketTier(id: string, eventId?: number | null): Promise<boolean> {
  if (typeof window !== "undefined") {
    try {
      const qs = new URLSearchParams();
      if (eventId && eventId > 0) qs.set("eventId", String(eventId));
      const res = await fetch(`/api/ticket-tiers/${encodeURIComponent(id)}?${qs}`, {
        method: "DELETE"
      });
      if (res.ok) return true;
    } catch (e) {
      console.warn("API deleteTicketTier failed.", e);
    }
    return false;
  }

  if (!eventId || eventId <= 0) {
    console.error("deleteTicketTier refused: no event scope for tier", id);
    return false;
  }

  // Server side - Neon SQL
  try {
    const { rows } = await neonQuery(
      "UPDATE ticket_tiers SET deleted_at = NOW() WHERE id = $1 AND event_id = $2 RETURNING id",
      [id, eventId]
    );
    return rows.length > 0;
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

// Permanently delete ticket tier. Event-scoped, for the same reason as the
// soft delete above.
export async function permanentlyDeleteTicketTier(
  id: string,
  eventId?: number | null
): Promise<boolean> {
  if (typeof window !== "undefined") {
    try {
      const qs = new URLSearchParams({ permanent: "true" });
      if (eventId && eventId > 0) qs.set("eventId", String(eventId));
      const res = await fetch(`/api/ticket-tiers/${encodeURIComponent(id)}?${qs}`, {
        method: "DELETE"
      });
      return res.ok;
    } catch (e) {
      console.warn("API permanentlyDeleteTicketTier failed.", e);
      return false;
    }
  }

  if (!eventId || eventId <= 0) {
    console.error("permanentlyDeleteTicketTier refused: no event scope for tier", id);
    return false;
  }

  // Server side - Neon SQL
  try {
    const { rows } = await neonQuery(
      "DELETE FROM ticket_tiers WHERE id = $1 AND event_id = $2 RETURNING id",
      [id, eventId]
    );
    return rows.length > 0;
  } catch (err) {
    console.error("Neon permanentlyDeleteTicketTier error:", err);
    return false;
  }
}

// Empty Trash
export async function emptyTrash(password?: string): Promise<boolean> {
  if (typeof window !== "undefined") {
    try {
      const res = await fetch(`/api/admin/trash/clear`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: password ?? "" })
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

/**
 * Fetch pending payments for admin reconciliation, optionally scoped to an
 * event. Was unfiltered and unbounded: no WHERE and no LIMIT, so the payments
 * tab listed every event's rows with nothing identifying which event any of
 * them belonged to.
 */
export async function fetchAllPendingPayments(
  eventId?: number | null,
  limit = 500
): Promise<PendingPayment[]> {
  if (typeof window !== "undefined") return [];

  try {
    const capped = Math.min(Math.max(Number(limit) || 500, 1), 2000);
    const { rows } =
      eventId && eventId > 0
        ? await neonQuery(
            "SELECT * FROM pending_payments WHERE event_id = $1 ORDER BY created_at DESC LIMIT $2",
            [eventId, capped]
          )
        : await neonQuery(
            "SELECT * FROM pending_payments ORDER BY created_at DESC LIMIT $1",
            [capped]
          );
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

/**
 * There is deliberately NO default price ladder.
 *
 * This constant used to hold 8 invented tiers (3 entry + 5 camping tents, KES
 * 500 -> 6000) and was used three ways: as `createEvent`'s fallback, as a
 * client-side fallback when the tiers API failed, and — worst — inserted
 * directly into `ticket_tiers` by `fetchTicketTiers` whenever an event came
 * back with zero rows.
 *
 * That last one made this a *read* function that wrote to the database, on a
 * route (`GET /api/ticket-tiers`) that `middleware.ts` exempts from the auth
 * check. So an unauthenticated GET seeded a full price list into any event.
 *
 * Verified live on 2026-09-30: event #2 (GOODLIFE 4) had 8 rows, 8/8 matching
 * this constant's fingerprint, 5 of them camping tents. Nobody chose those
 * prices and the event was sellable.
 *
 * It also made "an event with zero tiers" an unreachable state, which silently
 * disabled the `app/page.tsx` guard that routes a tierless event to the
 * coming-soon page instead of selling at an invented price.
 *
 * An event with no tiers is a valid, visible, fixable state. Zero tiers must
 * mean zero tiers.
 */

// Helper to format tier rows and apply automated laddering
function formatTierRows(rows: any[]): TicketTier[] {
  const now = new Date();
  let earlyBirdSoldOutOrExpired = false;

  const mapped = rows.map((r: any) => {
    const price = Number(r.price);
    const maxQty = r.max_quantity != null ? Number(r.max_quantity) : null;
    const sold = r.sold_count != null ? Number(r.sold_count) : 0;
    
    const isSoldOut = maxQty != null && sold >= maxQty;
    const isPastUntil = r.available_until ? now > new Date(r.available_until) : false;

    if ((r.name?.toLowerCase().includes("early bird") || r.id?.toLowerCase().includes("early-bird")) && (isSoldOut || isPastUntil)) {
      earlyBirdSoldOutOrExpired = true;
    }

    const cleanBadge = r.badge_text ? r.badge_text.replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '').trim() : null;

    return {
      ...r,
      price,
      max_quantity: maxQty,
      sold_count: sold,
      admits_quantity: r.admits_quantity != null ? Number(r.admits_quantity) : 1,
      is_camping_bundle: Boolean(r.is_camping_bundle),
      camping_type: r.camping_type || "none",
      badge_text: cleanBadge || null,
      tour_media_urls: Array.isArray(r.tour_media_urls) ? r.tour_media_urls : [],
      show_only_on_event_day: Boolean(r.show_only_on_event_day),
      hide_on_event_day: Boolean(r.hide_on_event_day),
      hidden: Boolean(r.hidden)
    };
  });

  // Automated Tier Laddering
  if (earlyBirdSoldOutOrExpired) {
    mapped.forEach(t => {
      if (t.name?.toLowerCase().includes("advance") || t.id?.toLowerCase().includes("advance")) {
        if (!t.badge_text) {
          t.badge_text = "ADVANCE PASSES LIVE";
        }
      }
    });
  }

  return mapped;
}

/**
 * Fetch all ticket tiers (optionally filtered by eventId).
 *
 * This is a PURE READ. It used to INSERT `DEFAULT_POSTER_TIERS` when the event
 * had no tiers, which made it a write on an unauthenticated GET route. Every
 * error path also returned that same fabricated ladder, so a network blip
 * showed a customer eight camping tents the event does not sell. Both are
 * gone. An empty array is now a truthful answer and callers must handle it —
 * `app/page.tsx` routes a zero-tier event to the coming-soon page for exactly
 * that reason.
 *
 * `eventId` is intentionally optional and client-controlled: `CheckoutClientPage`
 * calls this from the browser to power the editions switcher. That is why
 * `GET /api/ticket-tiers` stays public — it is now safe to, because it only reads.
 */
export async function fetchTicketTiers(eventId?: number): Promise<TicketTier[]> {
  if (typeof window !== "undefined") {
    try {
      const url = eventId ? `/api/ticket-tiers?eventId=${eventId}` : "/api/ticket-tiers";
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) return data;
      }
    } catch (e) {
      console.warn("API fetchTicketTiers failed.", e);
    }
    // A failed read must not become an invented price list. Showing "no passes
    // available" is recoverable; charging KES 6,000 for a tent that does not
    // exist is not.
    return [];
  }

  // Server side - Neon SQL
  try {
    let resolvedEventId = eventId;
    if (!resolvedEventId) {
      const active = await fetchActiveEvent();
      resolvedEventId = active?.id || 1;
    }

    const query = `
      SELECT 
        tt.*,
        COALESCE((
          SELECT COUNT(*)::int 
          FROM tickets t 
          WHERE t.event_id = tt.event_id 
            AND (t.ticket_type = tt.id OR LOWER(TRIM(t.ticket_type)) = LOWER(TRIM(tt.name)))
            AND t.deleted_at IS NULL
        ), 0) AS sold_count
      FROM ticket_tiers tt
      WHERE tt.deleted_at IS NULL
        AND tt.event_id = $1
      ORDER BY tt.price ASC
    `;

    const { rows } = await neonQuery(query, [resolvedEventId]);
    return formatTierRows(rows);
  } catch (err) {
    console.error("Neon fetchTicketTiers error:", err);
    // A database error must not surface as an invented price list either.
    return [];
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
    // A tier must belong to an event the caller named. This used to fall back
    // to `fetchActiveEvent()` and finally to a hardcoded `1`, which meant that
    // creating a tier while the dashboard's selector read "All Events" silently
    // attached it to an arbitrary event. Fail loudly instead.
    const eventId = tier.event_id;
    if (!eventId || eventId <= 0) {
      throw new Error(
        "A ticket tier must be assigned to a specific event. Select an event before adding a tier."
      );
    }

    await neonQuery(
      `INSERT INTO ticket_tiers (
        id, name, price, description, tag, show_only_on_event_day, hide_on_event_day, 
        available_from, available_until, max_quantity, event_id, tier_category, 
        admits_quantity, is_camping_bundle, camping_type, badge_text, tour_media_urls
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
       ON CONFLICT (id, event_id) DO UPDATE SET
         name = EXCLUDED.name,
         price = EXCLUDED.price,
         description = EXCLUDED.description,
         tag = EXCLUDED.tag,
         show_only_on_event_day = EXCLUDED.show_only_on_event_day,
         hide_on_event_day = EXCLUDED.hide_on_event_day,
         available_from = EXCLUDED.available_from,
         available_until = EXCLUDED.available_until,
         max_quantity = EXCLUDED.max_quantity,
         tier_category = EXCLUDED.tier_category,
         admits_quantity = EXCLUDED.admits_quantity,
         is_camping_bundle = EXCLUDED.is_camping_bundle,
         camping_type = EXCLUDED.camping_type,
         badge_text = EXCLUDED.badge_text,
         tour_media_urls = EXCLUDED.tour_media_urls,
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
        eventId,
        tier.tier_category || (tier.tag === "CAMPING" ? "camping" : "entry"),
        tier.admits_quantity || 1,
        tier.is_camping_bundle ?? (tier.tag === "CAMPING"),
        tier.camping_type || (tier.id.includes("shared") ? "shared_bed" : tier.tag === "CAMPING" ? "private" : "none"),
        tier.badge_text || null,
        JSON.stringify(tier.tour_media_urls || [])
      ]
    );
    return { ...tier, event_id: eventId };
  } catch (err) {
    console.error("Neon createTicketTier error:", err);
    throw err;
  }
}

/**
 * Columns a client is allowed to set on a tier.
 *
 * `updateTicketTier` used to interpolate every key of the request body straight
 * into the SET clause, which made it an arbitrary-column write: `deleted_at`,
 * `id`, `event_id` and `sold_count` were all settable. The dashboard's edit
 * form PUTs the whole fetched tier back, and `sold_count` is a computed
 * subquery alias from `fetchTicketTiers` — not a stored column — so it was
 * being written back as if it were one.
 */
const WRITABLE_TIER_COLUMNS = new Set([
  "name",
  "price",
  "description",
  "tag",
  "available_from",
  "available_until",
  "max_quantity",
  "hidden",
  "show_only_on_event_day",
  "hide_on_event_day",
  "tier_category",
  "admits_quantity",
  "is_camping_bundle",
  "camping_type",
  "badge_text",
  "tour_media_urls",
  // Needed by the trash "Restore" action (`PUT { deleted_at: null }`). Without
  // it the allowlist silently dropped the only key that restore sends, so the
  // button reported success and the tier stayed in the bin forever. Safe to
  // allow because the only route that reaches this function is admin-gated
  // (`app/api/ticket-tiers/[id]` calls `requireAdmin()`), and soft-delete is an
  // operator action by definition.
  "deleted_at",
]);

/**
 * Update a ticket tier.
 *
 * `eventId` is now REQUIRED, because `ticket_tiers`' primary key is
 * `(id, event_id)` and the old `WHERE id = $1` updated every event that shared
 * that tier id while `RETURNING *` reported only one. That is how "Hide
 * selected" on one event's tiers silently hid the same tiers on every other
 * event — and it is part of why the seeded price lists became impossible to
 * reason about and untangle.
 *
 * Pass `eventId` explicitly. `updates.event_id` is accepted as a fallback for
 * the edit form, which carries the whole tier, but it is not an editable
 * column and is stripped from the SET clause either way.
 */
export async function updateTicketTier(
  id: string,
  updates: Partial<TicketTier>,
  eventId?: number | null
): Promise<TicketTier | null> {
  const scopedEventId = eventId ?? updates.event_id ?? null;
  if (!scopedEventId || scopedEventId <= 0) {
    console.error("updateTicketTier refused: no event scope for tier", id);
    return null;
  }

  if (typeof window !== "undefined") {
    try {
      const qs = new URLSearchParams({ eventId: String(scopedEventId) });
      const res = await fetch(`/api/ticket-tiers/${encodeURIComponent(id)}?${qs}`, {
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
    const fields = Object.keys(updates).filter((f) => WRITABLE_TIER_COLUMNS.has(f));
    if (fields.length === 0) return null;
    const setClause = fields.map((f, idx) => `"${f}" = $${idx + 3}`).join(", ");
    const values = fields.map((f) => (updates as any)[f]);
    const { rows } = await neonQuery(
      `UPDATE ticket_tiers SET ${setClause} WHERE id = $1 AND event_id = $2 RETURNING *`,
      [id, scopedEventId, ...values]
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

/**
 * Fetch payment logs, optionally scoped to one event.
 *
 * Was `SELECT * FROM payment_logs ORDER BY created_at DESC` — no WHERE and no
 * LIMIT, so the admin payments tab showed every event's money with no event
 * label and no bound on how much it pulled. `eventId` is now honoured.
 */
export async function fetchPaymentLogs(eventId?: number | null, limit = 500): Promise<any[]> {
  if (typeof window !== "undefined") {
    try {
      const qs = eventId && eventId > 0 ? `?eventId=${eventId}` : "";
      const res = await fetch(`/api/admin/payment-logs${qs}`);
      if (res.ok) return await res.json();
    } catch (e) {
      console.warn("API fetchPaymentLogs failed.", e);
    }
    return [];
  }

  // Server side - Neon SQL
  try {
    const capped = Math.min(Math.max(Number(limit) || 500, 1), 2000);
    if (eventId && eventId > 0) {
      const { rows } = await neonQuery(
        "SELECT * FROM payment_logs WHERE event_id = $1 ORDER BY created_at DESC LIMIT $2",
        [eventId, capped]
      );
      return rows;
    }
    const { rows } = await neonQuery(
      "SELECT * FROM payment_logs ORDER BY created_at DESC LIMIT $1",
      [capped]
    );
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

/**
 * Clear payment logs.
 *
 * An event id is now REQUIRED. This used to be `DELETE FROM payment_logs` —
 * every event's audit rows — reachable from a dashboard button whose only
 * guard was a native `confirm()` that an operator on a phone can muscle
 * through while believing they are working inside one event.
 *
 * Returning false (rather than throwing) keeps the caller's existing shape;
 * the route turns that into a 400 with an explanation.
 */
export async function deleteAllPaymentLogs(eventId?: number | null): Promise<boolean> {
  if (typeof window !== "undefined") return false;
  if (!eventId || eventId <= 0) {
    console.error("deleteAllPaymentLogs refused: refusing to delete every event's audit rows");
    return false;
  }
  try {
    await neonQuery("DELETE FROM payment_logs WHERE event_id = $1", [eventId]);
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

/**
 * Clear pending payments. Like `deleteAllPaymentLogs`, an event id is required —
 * this was `DELETE FROM pending_payments`, i.e. every event's unresolved
 * payments, behind a single native confirm().
 */
export async function clearAllPendingPayments(eventId?: number | null): Promise<boolean> {
  if (typeof window !== "undefined") return false;
  if (!eventId || eventId <= 0) {
    console.error("clearAllPendingPayments refused: refusing to delete every event's pending payments");
    return false;
  }
  try {
    await neonQuery("DELETE FROM pending_payments WHERE event_id = $1", [eventId]);
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
  settlement_reason?: string;
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
  ordered_by?: string;
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

export async function fetchSettlementsForEvent(eventId?: number | null) {
  if (typeof window !== "undefined") {
    try {
      const url = eventId ? `/api/admin/settlements?eventId=${eventId}` : "/api/admin/settlements";
      const res = await fetch(url);
      if (res.ok) return await res.json();
    } catch {}
    return [];
  }

  if (eventId) {
    const { rows } = await neonQuery(
      `SELECT 
        v.id as vendor_id,
        v.name as vendor_name,
        v.contact_name,
        v.contact_phone,
        v.logo_url,
        COALESCE(vea.id, 0) as id,
        COALESCE(vea.event_id, $1) as event_id,
        COALESCE(e.title, 'Event #' || $1) as event_title,
        COALESCE(vea.commission_rate, 10.0) as commission_rate,
        COALESCE(vea.flat_fee, 0) as flat_fee,
        COALESCE(vea.settled_amount, 0) as settled_amount,
        COALESCE(vea.status, 'active') as status,
        COALESCE(sales_summary.total_sales, vea.total_sales, 0) as total_sales,
        COALESCE(sales_summary.order_count, 0) as order_count,
        COALESCE(sales_summary.cash_collected, 0) as cash_collected,
        COALESCE(sales_summary.mpesa_collected, 0) as mpesa_collected,
        COALESCE(sales_summary.tab_collected, 0) as tab_collected,
        (COALESCE(sales_summary.mpesa_collected, 0) + COALESCE(sales_summary.tab_collected, 0)) as digital_collected,
        ROUND((COALESCE(sales_summary.total_sales, vea.total_sales, 0) * COALESCE(vea.commission_rate, 10.0) / 100.0), 2) as commission_owed,
        ROUND(COALESCE(sales_summary.total_sales, vea.total_sales, 0) - (COALESCE(sales_summary.total_sales, vea.total_sales, 0) * COALESCE(vea.commission_rate, 10.0) / 100.0), 2) as vendor_net_share
      FROM vendors v
      LEFT JOIN vendor_event_assignments vea ON vea.vendor_id = v.id AND vea.event_id = $1
      LEFT JOIN events e ON e.id = $1
      LEFT JOIN (
        SELECT 
          ps.vendor_id,
          COALESCE(SUM(ps.total), 0) as total_sales,
          COUNT(DISTINCT ps.id) as order_count,
          COALESCE(SUM(pay.cash_amt), 0) as cash_collected,
          COALESCE(SUM(pay.mpesa_amt), 0) as mpesa_collected,
          COALESCE(SUM(pay.tab_amt), 0) as tab_collected
        FROM pos_sales ps
        LEFT JOIN (
          SELECT 
            sale_id,
            SUM(CASE WHEN method = 'cash' THEN amount ELSE 0 END) as cash_amt,
            SUM(CASE WHEN method = 'mpesa' THEN amount ELSE 0 END) as mpesa_amt,
            SUM(CASE WHEN method = 'tab' THEN amount ELSE 0 END) as tab_amt
          FROM pos_split_payments
          GROUP BY sale_id
        ) pay ON pay.sale_id = ps.id
        WHERE ps.event_id = $1 AND ps.payment_status != 'voided'
        GROUP BY ps.vendor_id
      ) sales_summary ON sales_summary.vendor_id = v.id
      WHERE v.deleted_at IS NULL
        AND (vea.id IS NOT NULL OR sales_summary.total_sales IS NOT NULL)
      ORDER BY v.name ASC`,
      [eventId]
    );
    return rows;
  }

  // All events mode
  const { rows } = await neonQuery(
    `SELECT 
      v.id as vendor_id,
      v.name as vendor_name,
      v.contact_name,
      v.contact_phone,
      v.logo_url,
      COALESCE(vea.id, 0) as id,
      COALESCE(vea.event_id, ps.event_id, 0) as event_id,
      COALESCE(e.title, 'Event #' || COALESCE(vea.event_id, ps.event_id, 0)) as event_title,
      COALESCE(vea.commission_rate, 10.0) as commission_rate,
      COALESCE(vea.flat_fee, 0) as flat_fee,
      COALESCE(vea.settled_amount, 0) as settled_amount,
      COALESCE(vea.status, 'active') as status,
      COALESCE(ps.total_sales, vea.total_sales, 0) as total_sales,
      COALESCE(ps.order_count, 0) as order_count,
      COALESCE(ps.cash_collected, 0) as cash_collected,
      COALESCE(ps.mpesa_collected, 0) as mpesa_collected,
      COALESCE(ps.tab_collected, 0) as tab_collected,
      (COALESCE(ps.mpesa_collected, 0) + COALESCE(ps.tab_collected, 0)) as digital_collected,
      ROUND((COALESCE(ps.total_sales, vea.total_sales, 0) * COALESCE(vea.commission_rate, 10.0) / 100.0), 2) as commission_owed,
      ROUND(COALESCE(ps.total_sales, vea.total_sales, 0) - (COALESCE(ps.total_sales, vea.total_sales, 0) * COALESCE(vea.commission_rate, 10.0) / 100.0), 2) as vendor_net_share
    FROM vendors v
    LEFT JOIN (
      SELECT 
        ps.vendor_id,
        ps.event_id,
        COALESCE(SUM(ps.total), 0) as total_sales,
        COUNT(DISTINCT ps.id) as order_count,
        COALESCE(SUM(pay.cash_amt), 0) as cash_collected,
        COALESCE(SUM(pay.mpesa_amt), 0) as mpesa_collected,
        COALESCE(SUM(pay.tab_amt), 0) as tab_collected
      FROM pos_sales ps
      LEFT JOIN (
        SELECT 
          sale_id,
          SUM(CASE WHEN method = 'cash' THEN amount ELSE 0 END) as cash_amt,
          SUM(CASE WHEN method = 'mpesa' THEN amount ELSE 0 END) as mpesa_amt,
          SUM(CASE WHEN method = 'tab' THEN amount ELSE 0 END) as tab_amt
        FROM pos_split_payments
        GROUP BY sale_id
      ) pay ON pay.sale_id = ps.id
      WHERE ps.payment_status != 'voided'
      GROUP BY ps.vendor_id, ps.event_id
    ) ps ON ps.vendor_id = v.id
    LEFT JOIN vendor_event_assignments vea ON vea.vendor_id = v.id AND (vea.event_id = ps.event_id OR ps.event_id IS NULL)
    LEFT JOIN events e ON e.id = COALESCE(vea.event_id, ps.event_id)
    WHERE v.deleted_at IS NULL
      AND (vea.id IS NOT NULL OR ps.total_sales IS NOT NULL)
    ORDER BY v.name ASC`
  );
  return rows;
}

export async function recordSettlement(assignmentId: number, amount: number, mode: 'add' | 'set' = 'add') {
  if (typeof window !== "undefined") {
    const res = await fetch("/api/admin/settlements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assignmentId, amount, mode })
    });
    return res.ok;
  }
  if (mode === 'set') {
    await neonQuery(
      `UPDATE vendor_event_assignments
       SET settled_amount = $2,
           status = CASE WHEN $2 > 0 THEN 'settled' ELSE 'active' END
       WHERE id = $1`,
      [assignmentId, amount]
    );
  } else {
    await neonQuery(
      `UPDATE vendor_event_assignments
       SET settled_amount = settled_amount + $2,
           status = CASE WHEN (settled_amount + $2) > 0 THEN 'settled' ELSE 'active' END
       WHERE id = $1`,
      [assignmentId, amount]
    );
  }
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
        const { rows: stockRows } = await client.query(
          `SELECT name, stock_qty FROM vendor_items WHERE id = $1 FOR UPDATE`,
          [item.item_id]
        );
        if (stockRows.length > 0 && stockRows[0].stock_qty !== null && stockRows[0].stock_qty !== undefined) {
          const currentStock = Number(stockRows[0].stock_qty);
          if (currentStock < item.quantity) {
            throw new Error(`Insufficient stock for "${stockRows[0].name}". Available: ${currentStock}, requested: ${item.quantity}`);
          }
          await client.query(
            `UPDATE vendor_items SET stock_qty = GREATEST(0, stock_qty - $2) WHERE id = $1`,
            [item.item_id, item.quantity]
          );
        }
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
        const { rows: tabRows } = await client.query(
          'SELECT balance, credit_limit FROM customer_tabs WHERE id = $1 FOR UPDATE',
          [p.tab_id]
        );
        if (tabRows.length === 0) {
          throw new Error(`Customer tab #${p.tab_id} not found`);
        }
        const currentBalance = Number(tabRows[0].balance);
        const creditLimit = Number(tabRows[0].credit_limit);
        if (currentBalance + p.amount > creditLimit) {
          throw new Error(`Tab credit limit exceeded (Available: KES ${(creditLimit - currentBalance)})`);
        }

        await client.query(
          `UPDATE customer_tabs SET balance = balance + $2 WHERE id = $1`,
          [p.tab_id, p.amount]
        );
        await client.query(
          `INSERT INTO tab_transactions (tab_id, sale_id, type, amount, method, mpesa_ref, operator_id, ordered_by)
           VALUES ($1, $2, 'charge', $3, 'tab', '', $4, $5)`,
          [p.tab_id, sale.id, p.amount, sale.operator_id, p.payer_name || ""]
        );
        totalPaidViaTab += p.amount;
      }
    }

    // 4. Update or Insert Vendor Assignment Totals
    const { rows: assignmentRows } = await client.query(
      "SELECT commission_rate FROM vendor_event_assignments WHERE vendor_id = $1 AND event_id = $2",
      [sale.vendor_id, sale.event_id]
    );
    const rawCommRate = assignmentRows.length > 0 ? Number(assignmentRows[0].commission_rate) : 10.0;
    const commRate = isNaN(rawCommRate) ? 10.0 : rawCommRate;
    const commOwed = (sale.total * commRate) / 100;
    
    await client.query(
      `INSERT INTO vendor_event_assignments (vendor_id, event_id, commission_rate, total_sales, commission_owed, status)
       VALUES ($1, $2, $3, $4, $5, 'active')
       ON CONFLICT (vendor_id, event_id)
       DO UPDATE SET
         total_sales = COALESCE(vendor_event_assignments.total_sales, 0) + EXCLUDED.total_sales,
         commission_owed = COALESCE(vendor_event_assignments.commission_owed, 0) + EXCLUDED.commission_owed`,
      [sale.vendor_id, sale.event_id, commRate, sale.total, commOwed]
    );

    await client.query("COMMIT");
    return true;
  } catch (e) {
    try { await client.query("ROLLBACK"); } catch {}
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

export async function fetchEventCustomers(eventId: number, search?: string): Promise<EventCustomer[]> {
  if (typeof window !== "undefined") {
    try {
      const q = search ? `&q=${encodeURIComponent(search)}` : "";
      const res = await fetch(`/api/vendor/customers?eventId=${eventId}${q}`);
      if (res.ok) {
        const data = await res.json();
        return data.customers || [];
      }
    } catch {}
    return [];
  }

  let query = `
    SELECT 
      MIN(id) as id,
      buyer_name,
      phone_number,
      COALESCE(MAX(whatsapp_number), '') as whatsapp_number,
      string_agg(DISTINCT ticket_type, ', ') as ticket_type,
      COUNT(*)::int as ticket_count,
      BOOL_OR(is_scanned) as is_scanned
    FROM tickets
    WHERE deleted_at IS NULL AND event_id = $1
  `;
  const params: any[] = [eventId];

  if (search && search.trim()) {
    query += ` AND (buyer_name ILIKE $2 OR phone_number ILIKE $2 OR whatsapp_number ILIKE $2 OR id ILIKE $2)`;
    params.push(`%${search.trim()}%`);
  }

  query += ` GROUP BY buyer_name, phone_number ORDER BY buyer_name ASC LIMIT 100`;

  const { rows } = await neonQuery(query, params);
  return (rows || []).map((r: any) => ({
    id: r.id,
    buyer_name: r.buyer_name || "Unknown Attendee",
    phone_number: r.phone_number || "",
    whatsapp_number: r.whatsapp_number || "",
    ticket_type: r.ticket_type || "Standard",
    ticket_count: Number(r.ticket_count) || 1,
    is_scanned: !!r.is_scanned
  }));
}

export async function payTab(tabId: number, amount: number, method: string, mpesaRef: string = "", operatorId?: number | null): Promise<boolean> {
  if (typeof window !== "undefined") {
    const res = await fetch(`/api/vendor/tabs/${tabId}/pay`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount, method, mpesaRef, operatorId })
    });
    return res.ok;
  }

  const numAmount = Number(amount);
  if (isNaN(numAmount) || numAmount <= 0) {
    return false;
  }

  const client = await neonConnect();
  try {
    await client.query("BEGIN");
    const { rows: tabRows } = await client.query('SELECT balance FROM customer_tabs WHERE id = $1 FOR UPDATE', [tabId]);
    if (tabRows.length === 0) {
      try { await client.query("ROLLBACK"); } catch {}
      return false;
    }

    const currentBalance = Number(tabRows[0].balance);
    const actualDeduction = Math.min(numAmount, currentBalance);

    // Idempotency check: if mpesa_ref is provided, check if it was already recorded for this tab
    if (mpesaRef && mpesaRef.trim()) {
      const { rows: existingRef } = await client.query(
        "SELECT id FROM tab_transactions WHERE tab_id = $1 AND mpesa_ref = $2 LIMIT 1",
        [tabId, mpesaRef.trim()]
      );
      if (existingRef.length > 0) {
        await client.query("COMMIT");
        return true;
      }
    }

    const newBalance = currentBalance - actualDeduction;
    if (newBalance <= 0) {
      await client.query(
        "UPDATE customer_tabs SET balance = 0, status = 'settled', settled_at = NOW() WHERE id = $1",
        [tabId]
      );
    } else {
      await client.query(
        "UPDATE customer_tabs SET balance = balance - $2 WHERE id = $1",
        [tabId, actualDeduction]
      );
    }

    await client.query(
      `INSERT INTO tab_transactions (tab_id, type, amount, method, mpesa_ref, operator_id)
       VALUES ($1, 'payment', $2, $3, $4, $5)`,
      [tabId, actualDeduction, method, mpesaRef, operatorId || null]
    );
    await client.query("COMMIT");
    return true;
  } catch (e: any) {
    // Unique-index safety net: if the same (tab_id, mpesa_ref) was already
    // recorded by a concurrent writer (webhook), treat as already-credited
    // instead of failing (code 23505 = unique_violation).
    if (e?.code === "23505" && mpesaRef && mpesaRef.trim()) {
      try { await client.query("ROLLBACK"); } catch {}
      console.warn(`Duplicate tab payment suppressed for ref ${mpesaRef} (tab ${tabId})`);
      return true;
    }
    try { await client.query("ROLLBACK"); } catch {}
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

export async function closeTab(tabId: number, settlementReason: string = ""): Promise<boolean> {
  if (typeof window !== "undefined") {
    const res = await fetch(`/api/vendor/tabs/${tabId}/close`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ settlementReason })
    });
    return res.ok;
  }
  await neonQuery("UPDATE customer_tabs SET status = 'settled', settled_at = NOW(), settlement_reason = $2 WHERE id = $1", [tabId, settlementReason]);
  return true;
}

export async function updateTabCreditLimit(tabId: number, newLimit: number): Promise<{ success: boolean; message?: string }> {
  const numLimit = Number(newLimit);
  if (isNaN(numLimit) || numLimit < 0) {
    return { success: false, message: "Invalid credit limit amount" };
  }

  if (typeof window !== "undefined") {
    try {
      const res = await fetch(`/api/vendor/tabs/${tabId}/limit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newLimit: numLimit })
      });
      const data = await res.json();
      return data;
    } catch (e: any) {
      return { success: false, message: e?.message || "Failed to update credit limit" };
    }
  }

  const client = await neonConnect();
  try {
    await client.query("BEGIN");
    const { rows: tabRows } = await client.query('SELECT balance FROM customer_tabs WHERE id = $1 FOR UPDATE', [tabId]);
    if (tabRows.length === 0) {
      try { await client.query("ROLLBACK"); } catch {}
      return { success: false, message: "Tab not found" };
    }

    const currentBalance = Number(tabRows[0].balance);
    if (numLimit < currentBalance) {
      try { await client.query("ROLLBACK"); } catch {}
      return { success: false, message: "New limit cannot be lower than current balance owed" };
    }

    await client.query("UPDATE customer_tabs SET credit_limit = $2 WHERE id = $1", [tabId, numLimit]);
    await client.query("COMMIT");
    return { success: true };
  } catch (e: any) {
    try { await client.query("ROLLBACK"); } catch {}
    console.error("UPDATE TAB CREDIT LIMIT FAILED:", e);
    return { success: false, message: e?.message || "Internal server error" };
  } finally {
    client.release();
  }
}

// ==================== CULTURAL HUB & LIFECYCLE ====================

export async function updateEventLifecycle(eventId: number, status: 'scheduled' | 'live' | 'closed'): Promise<boolean> {
  if (typeof window !== "undefined") return false;
  await neonQuery("UPDATE events SET status = $2 WHERE id = $1", [eventId, status]);
  return true;
}

export async function joinEventWaitlist(eventId: number, phoneNumber: string): Promise<boolean> {
  let formattedPhone = phoneNumber.replace(/[^0-9]/g, "");
  if (formattedPhone.startsWith("0")) formattedPhone = "254" + formattedPhone.slice(1);
  if (formattedPhone.length === 9) formattedPhone = "254" + formattedPhone;

  if (typeof window !== "undefined") {
    const res = await fetch("/api/hub/waitlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventId, phoneNumber: formattedPhone })
    });
    return res.ok;
  }
  try {
    await neonQuery(
      `INSERT INTO event_waitlist (event_id, phone_number) 
       VALUES ($1, $2) 
       ON CONFLICT (event_id, phone_number) DO UPDATE SET created_at = NOW()`,
      [eventId, formattedPhone]
    );
    return true;
  } catch (err) {
    console.error("joinEventWaitlist error:", err);
    return false;
  }
}

export async function fetchEventWaitlist(eventId: number): Promise<any[]> {
  if (typeof window !== "undefined") {
    try {
      const res = await fetch(`/api/admin/waitlist?eventId=${eventId}`);
      if (res.ok) return await res.json();
    } catch {}
    return [];
  }
  try {
    const { rows } = await neonQuery(
      "SELECT * FROM event_waitlist WHERE event_id = $1 ORDER BY created_at DESC",
      [eventId]
    );
    return rows;
  } catch (err) {
    console.error("fetchEventWaitlist error:", err);
    return [];
  }
}

export async function markWaitlistNotified(eventId: number, phoneNumbers: string[]): Promise<boolean> {
  if (typeof window !== "undefined") return false;
  try {
    await neonQuery(
      "UPDATE event_waitlist SET notified = TRUE, notified_at = NOW() WHERE event_id = $1 AND phone_number = ANY($2::text[])",
      [eventId, phoneNumbers]
    );
    return true;
  } catch (err) {
    console.error("markWaitlistNotified error:", err);
    return false;
  }
}

export async function fetchEventGallery(eventId?: number): Promise<EventGallery[]> {
  if (typeof window !== "undefined") {
    try {
      const res = await fetch(`/api/hub/gallery${eventId ? '?eventId='+eventId : ''}`);
      if (res.ok) return await res.json();
    } catch {}
    return [];
  }
  let query = "SELECT * FROM event_gallery ORDER BY created_at DESC";
  let params: any[] = [];
  if (eventId) {
    query = "SELECT * FROM event_gallery WHERE event_id = $1 ORDER BY created_at DESC";
    params = [eventId];
  }
  const { rows } = await neonQuery(query, params);
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

