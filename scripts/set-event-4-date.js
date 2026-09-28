/**
 * Record the correct date on GOODLIFE 4 (event 2).
 *
 * WHY: the row was carrying event_date = 2026-09-27 while the operator states
 * the event is 2026-11-07. Nov 7 2026 is in the future, so the 49 tickets and
 * 39 gate scans already filed against this event (sold 2026-07-06..07-12,
 * scanned 2026-07-11, tiers "ADV 500" / "GATE 700") belong to a DIFFERENT,
 * earlier occasion - those tier names match neither current event. This script
 * fixes the date only. It does NOT move tickets, and does NOT touch
 * status, is_active, recurrence_day, or the sales window.
 *
 * Dry-run by default. Pass --apply to write.
 *
 * Usage:
 *   node scripts/set-event-4-date.js
 *   node scripts/set-event-4-date.js --apply
 */
const { Client } = require("pg");

const EVENT_ID = 2;
const NEW_DATE = "2026-11-07";
const APPLY = process.argv.includes("--apply");

// Read from env so the credential is never committed.
const DATABASE_URL = (process.env.DATABASE_URL || "").trim().replace(/^["']|["']$/g, "");
if (!DATABASE_URL) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

const pool = new Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

(async () => {
  await pool.connect();

  const before = await pool.query(
    `SELECT id, title, subtitle, event_date, status, is_active,
            recurrence_day, sales_open_date, sales_close_date
       FROM events WHERE id = $1`,
    [EVENT_ID]
  );
  const ev = before.rows[0];
  if (!ev) {
    console.error(`No event with id ${EVENT_ID}. Aborting.`);
    await pool.end();
    process.exit(1);
  }

  console.log("=== BEFORE ===");
  for (const [k, v] of Object.entries(ev)) console.log(`  ${k} = ${JSON.stringify(v)}`);

  if (String(ev.event_date || "").slice(0, 10) === NEW_DATE) {
    console.log(`\nalready ${NEW_DATE}, nothing to do.`);
    await pool.end();
    return;
  }

  // Guard: refuse if tickets would end up in the future relative to a *past*
  // date, or any other surprise. Cheap sanity check before a production write.
  const tix = await pool.query(
    `SELECT count(*)::int AS n,
            count(*) FILTER (WHERE amount_paid > 0)::int AS paid,
            COALESCE(sum(amount_paid),0)::int AS revenue,
            min(purchase_time) AS first_sale,
            max(purchase_time) AS last_sale
       FROM tickets WHERE deleted_at IS NULL AND event_id = $1`,
    [EVENT_ID]
  );
  const t = tix.rows[0];
  console.log("\n=== tickets still attached to this event (untouched by this script) ===");
  console.log(`  ${t.n} tickets (${t.paid} paid, Ksh ${t.revenue}) sold ${t.first_sale} .. ${t.last_sale}`);

  const newSubtitle = String(ev.subtitle || "").replace(/SEPT\s*7/i, "NOV 7");
  console.log(`\n=== PLANNED CHANGE ===`);
  console.log(`  event_date : ${String(ev.event_date).slice(0, 10)} -> ${NEW_DATE}`);
  if (newSubtitle !== ev.subtitle) {
    console.log(`  subtitle   : ${JSON.stringify(ev.subtitle)} -> ${JSON.stringify(newSubtitle)}`);
  }
  console.log(`\n  NOT changed: status, is_active, recurrence_day, sales_open_date, sales_close_date`);

  if (!APPLY) {
    console.log("\nDry run. Re-run with --apply to write.");
    await pool.end();
    return;
  }

  await pool.query(
    `UPDATE events SET event_date = $1::timestamptz, subtitle = $2 WHERE id = $3`,
    [`${NEW_DATE}T12:00:00+03:00`, newSubtitle, EVENT_ID]
  );

  const after = await pool.query(
    `SELECT id, title, subtitle, event_date, status, is_active, recurrence_day FROM events WHERE id = $1`,
    [EVENT_ID]
  );
  console.log("\n=== AFTER ===");
  for (const [k, v] of Object.entries(after.rows[0])) console.log(`  ${k} = ${JSON.stringify(v)}`);

  await pool.end();
})().catch(async (e) => {
  console.error("ERR " + e.message);
  try { await pool.end(); } catch {}
  process.exit(1);
});
