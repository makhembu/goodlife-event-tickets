import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { Pool } from "pg";

let pool: Pool | null = null;
function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      max: 3,
    });
  }
  return pool;
}

export async function GET(req: NextRequest) {
  const unauthorized = await requireAdmin(req);
  if (unauthorized) return unauthorized;

  try {
    const db = getPool();
    const result = await db.query(`
      SELECT e.id, e.title, e.venue, e.event_date, e.status, e.category,
             e.lineup, e.lineup_confirmed,
             o.radio_promote, o.radio_priority, o.starts_at, o.gates_open_at, o.ends_at,
             o.promo_blurb, o.venue_coords, o.spoken_ticket_url
      FROM events e
      LEFT JOIN radio_event_overrides o ON o.event_id = e.id
      WHERE e.archived_at IS NULL
      ORDER BY e.event_date ASC
    `);

    return NextResponse.json({ events: result.rows }, { status: 200 });
  } catch (err: any) {
    console.error("[api/admin/radio/overrides] GET error:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const unauthorized = await requireAdmin(req);
  if (unauthorized) return unauthorized;

  try {
    const body = await req.json();
    const {
      event_id,
      radio_promote = true,
      radio_priority = 0,
      starts_at,
      gates_open_at,
      ends_at,
      promo_blurb,
      venue_coords,
      spoken_ticket_url,
      lineup,
      lineup_confirmed,
    } = body;

    if (!event_id) {
      return NextResponse.json({ error: "Missing event_id" }, { status: 400 });
    }

    const db = getPool();

    // 1. Update events table for lineup and lineup_confirmed
    if (lineup !== undefined || lineup_confirmed !== undefined) {
      await db.query(`
        UPDATE events
        SET lineup = COALESCE($1, lineup),
            lineup_confirmed = COALESCE($2, lineup_confirmed)
        WHERE id = $3
      `, [lineup, lineup_confirmed, event_id]);
    }

    // 2. Upsert radio_event_overrides
    await db.query(`
      INSERT INTO radio_event_overrides (
        event_id, radio_promote, radio_priority, starts_at, gates_open_at,
        ends_at, promo_blurb, venue_coords, spoken_ticket_url, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
      ON CONFLICT (event_id) DO UPDATE SET
        radio_promote = EXCLUDED.radio_promote,
        radio_priority = EXCLUDED.radio_priority,
        starts_at = EXCLUDED.starts_at,
        gates_open_at = EXCLUDED.gates_open_at,
        ends_at = EXCLUDED.ends_at,
        promo_blurb = EXCLUDED.promo_blurb,
        venue_coords = EXCLUDED.venue_coords,
        spoken_ticket_url = EXCLUDED.spoken_ticket_url,
        updated_at = NOW();
    `, [
      event_id,
      radio_promote,
      radio_priority,
      starts_at || null,
      gates_open_at || null,
      ends_at || null,
      promo_blurb || null,
      venue_coords ? JSON.stringify(venue_coords) : null,
      spoken_ticket_url || null,
    ]);

    return NextResponse.json({ success: true, event_id });
  } catch (err: any) {
    console.error("[api/admin/radio/overrides] POST error:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
