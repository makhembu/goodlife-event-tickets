/**
 * READ-ONLY audit of ticket-to-event attribution. Writes nothing.
 *
 * Question it answers: is a real event wrongly carrying another event's sales?
 * Signal: every ticket for an event whose purchase_time is far in the future,
 * and every ticket for an event whose date has already passed.
 *
 * Usage: node scripts/audit-event-tickets.js
 */
const { Client } = require("pg");

// Read from env so the credential is never committed.
const DATABASE_URL = (process.env.DATABASE_URL || "").trim().replace(/^["']|["']$/g, "");
if (!DATABASE_URL) {
  console.error("DATABASE_URL is not set. Nothing to do.");
  process.exit(1);
}

const pool = new Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

(async () => {
  await pool.connect();

  const events = await pool.query(
    `SELECT id, title, event_date, is_active, status FROM events ORDER BY id`
  );

  console.log("=== EVENTS ===");
  for (const e of events.rows) {
    console.log(
      `  id=${String(e.id).padEnd(3)} ${String(e.event_date || "(no date)").padEnd(12)} ` +
      `active=${String(e.is_active).padEnd(5)} status=${String(e.status || "-").padEnd(10)} ${e.title}`
    );
  }

  const counts = await pool.query(
    `SELECT event_id,
            count(*)                                              AS tickets,
            count(*) FILTER (WHERE amount_paid > 0)               AS paid,
            min(purchase_time)                                   AS first_sale,
            max(purchase_time)                                   AS last_sale,
            sum(amount_paid)                                      AS revenue
       FROM tickets
      WHERE deleted_at IS NULL
      GROUP BY event_id
      ORDER BY event_id`
  );

  console.log("\n=== TICKETS PER EVENT ===");
  for (const r of counts.rows) {
    const ev = events.rows.find(e => String(e.id) === String(r.event_id));
    const label = ev ? ev.title : "!! NO SUCH EVENT";
    const date = ev?.event_date || "(no date)";
    console.log(
      `  event ${String(r.event_id).padEnd(4)} ${String(date).padEnd(12)} ` +
      `tickets=${String(r.tickets).padStart(4)} paid=${String(r.paid).padStart(4)} ` +
      `rev=${String(r.revenue || 0).padStart(8)}  ${label}`
    );
    console.log(`           sales between ${r.first_sale} and ${r.last_sale}`);
  }

  // Sales on an event dated in the future.
  const future = await pool.query(
    `SELECT t.event_id, e.title, e.event_date, count(*) AS tickets, sum(t.amount_paid) AS revenue,
            min(t.purchase_time) AS first_sale
       FROM tickets t
       JOIN events e ON e.id = t.event_id
      WHERE t.deleted_at IS NULL
        AND e.event_date IS NOT NULL
        AND e.event_date::date > (now() AT TIME ZONE 'Africa/Nairobi')::date
      GROUP BY t.event_id, e.title, e.event_date
      ORDER BY t.event_id`
  );

  console.log("\n=== SALES ON AN EVENT DATED IN THE FUTURE ===");
  if (future.rows.length === 0) {
    console.log("  none");
  }
  for (const r of future.rows) {
    console.log(
      `  event ${r.event_id} "${r.title}" dated ${String(r.event_date).slice(0, 10)} ` +
      `has ${r.tickets} tickets (Ksh ${r.revenue || 0}), earliest sale ${r.first_sale}`
    );
  }

  // Sales on an event whose date has already passed but sold after it.
  const late = await pool.query(
    `SELECT t.event_id, e.title, e.event_date, count(*) AS tickets, sum(t.amount_paid) AS revenue
       FROM tickets t
       JOIN events e ON e.id = t.event_id
      WHERE t.deleted_at IS NULL
        AND e.event_date IS NOT NULL
        AND t.purchase_time::date > e.event_date::date
        AND e.event_date::date < (now() AT TIME ZONE 'Africa/Nairobi')::date
      GROUP BY t.event_id, e.title, e.event_date
      ORDER BY t.event_id`
  );

  console.log("\n=== SALES DATED AFTER THE EVENT ENDED ===");
  if (late.rows.length === 0) {
    console.log("  none");
  }
  for (const r of late.rows) {
    console.log(
      `  event ${r.event_id} "${r.title}" ended ${String(r.event_date).slice(0, 10)} ` +
      `but has ${r.tickets} tickets sold after it (Ksh ${r.revenue || 0})`
    );
  }

  // The decisive check: gate scans prove when an event actually happened. If
  // scans cluster on a date nowhere near event_date, the event record is
  // describing a different occasion than the one the ledger belongs to.
  const mismatch = await pool.query(
    `SELECT t.event_id,
            e.title,
            e.event_date,
            count(*)                                            AS scans,
            min(t.scanned_at::date)                             AS first_scan,
            max(t.scanned_at::date)                             AS last_scan
       FROM tickets t
       JOIN events e ON e.id = t.event_id
      WHERE t.deleted_at IS NULL
        AND t.is_scanned
        AND t.scanned_at IS NOT NULL
      GROUP BY t.event_id, e.title, e.event_date
      ORDER BY t.event_id`
  );

  console.log("\n=== SCAN DATES vs EVENT DATE ===");
  if (mismatch.rows.length === 0) {
    console.log("  no scanned tickets");
  }
  for (const r of mismatch.rows) {
    // Compare against the busiest scan day, not the first, so one early
    // door-opening scan does not make a real event look wrong.
    const busiest = await pool.query(
      `SELECT scanned_at::date AS d, count(*) AS n
         FROM tickets
        WHERE deleted_at IS NULL AND event_id = $1 AND is_scanned AND scanned_at IS NOT NULL
        GROUP BY d ORDER BY n DESC, d ASC LIMIT 1`,
      [r.event_id]
    );
    const peak = busiest.rows[0]?.d;
    if (!r.event_date || !peak) {
      console.log(`  event ${r.event_id} "${r.title}" - cannot compare (missing event_date or no scans)`);
      continue;
    }
    const eventDay = new Date(r.event_date);
    const peakDay = new Date(peak);
    const deltaDays = Math.round((peakDay - eventDay) / 86400000);
    const verdict = Math.abs(deltaDays) <= 3
      ? "OK - scans match the event date"
      : `MISMATCH - peak scanning ${String(peak).slice(0, 10)}, event_date ${String(r.event_date).slice(0, 10)} (${deltaDays} days)`;
    console.log(`  event ${r.event_id} "${r.title}"  ${r.scans} scans ${r.first_scan}..${r.last_scan}`);
    console.log(`           ${verdict}`);
  }

  await pool.end();
})().catch(async (e) => {
  console.error(e.message);
  try { await pool.end(); } catch {}
  process.exit(1);
});
