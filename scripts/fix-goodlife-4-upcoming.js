/**
 * Make GOODLIFE 4 a clean, currently-selling future event.
 *
 * TWO PROBLEMS, ONE OPERATION.
 *
 * 1. GOODLIFE 4 (event 2, 2026-11-07) is carrying 49 tickets worth Ksh 18,600
 *    that are not its own. They are GOODLIFE XP's.
 *
 *    Evidence, all of it independent:
 *      - the event 2 row was created 2026-08-31, and 0 of its 49 tickets were
 *        sold after that instant. They predate the row they point at.
 *      - their tiers are "ADV 500" (x28) and "GATE 700" (x4). Event 2 is
 *        configured as Early Bird Pass/450, ADVANCE PASS/800, gate VIP
 *        Fast-Track/1000. No overlap at all.
 *      - pending_payments on EVENT 1 already holds "ADV 500" x17 and
 *        "GATE 700" x1, and 10 of the 49 have a pending row pointing at
 *        event 1.
 *      - their 39 gate scans all fall on 2026-07-11, a real past occasion.
 *      - event 1 (GOODLIFE XP) is status='closed', i.e. a finished event,
 *        which is what a July gate belongs to.
 *
 *    So: repoint the 49 tickets to event 1, where their own payment records
 *    already live. This is the original "GOODLIFE 4 is showing GOODLIFE XP's
 *    tickets" report, and this is the fix.
 *
 * 2. Sales are closed. sales_close_date was 2026-09-28 (yesterday), a window
 *    built for the old 2026-09-27 date. It is enforced server-side in
 *    payhero/initialize, payments/till-submit and tickets/rsvp-free, all of
 *    which reject any payment after that instant. Extend it to the event date
 *    so the November event can actually take money.
 *
 * REFUSES TO RUN unless the guards pass, and is reversible:
 *   node scripts/fix-goodlife-4-upcoming.js            (dry run)
 *   node scripts/fix-goodlife-4-upcoming.js --apply
 *   node scripts/fix-goodlife-4-upcoming.js --rollback
 */
const { Client } = require("pg");

const FUTURE_EVENT_ID = 2;   // GOODLIFE 4, 2026-11-07
const PAST_EVENT_ID = 1;     // GOODLIFE XP, closed
const APPLY = process.argv.includes("--apply");
const ROLLBACK = process.argv.includes("--rollback");

// Read from env so the credential is never committed.
const DATABASE_URL = (process.env.DATABASE_URL || "").trim().replace(/^["']|["']$/g, "");
if (!DATABASE_URL) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

const pool = new Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

/** pg returns timestamptz as a Date; String(date).slice(0,10) yields "Sat Nov 07". */
const isoDate = (v) => (v instanceof Date ? v.toISOString() : String(v ?? "")).slice(0, 10);

const summarise = async (c, id) => (await c.query(
  `SELECT count(*)::int AS tickets,
          count(*) FILTER (WHERE amount_paid > 0)::int AS paid,
          COALESCE(sum(amount_paid), 0)::int AS revenue,
          COALESCE(sum(guest_count), 0)::int AS guests,
          count(*) FILTER (WHERE is_scanned)::int AS scanned
     FROM tickets WHERE deleted_at IS NULL AND event_id = $1`, [id]
)).rows[0];

(async () => {
  await pool.connect();

  const src = (await pool.query(
    `SELECT id, title, event_date, status, is_active, created_at,
            sales_open_date, sales_close_date
       FROM events WHERE id = $1`, [FUTURE_EVENT_ID])).rows[0];
  const dst = (await pool.query(
    `SELECT id, title, event_date, status, is_active FROM events WHERE id = $1`, [PAST_EVENT_ID])).rows[0];

  if (!src || !dst) {
    console.error("Expected events 1 and 2 to exist. Refusing.");
    await pool.end();
    process.exit(1);
  }

  console.log(`=== TARGETS ===`);
  console.log(`  ${src.id} "${src.title}"  date=${isoDate(src.event_date)} status=${src.status} active=${src.is_active}`);
  console.log(`  ${dst.id} "${dst.title}"  date=${dst.event_date} status=${dst.status} active=${dst.is_active}`);

  if (ROLLBACK) {
    const back = await pool.query(
      `SELECT count(*)::int n FROM tickets
        WHERE deleted_at IS NULL AND event_id = $1 AND purchase_time < $2`,
      [PAST_EVENT_ID, src.created_at]);
    console.log(`\n=== ROLLBACK: would return ${back.rows[0].n} tickets to event ${FUTURE_EVENT_ID} ===`);
    if (!APPLY) { console.log("Dry run."); await pool.end(); return; }

    await pool.query("BEGIN");
    await pool.query(
      `UPDATE tickets SET event_id = $1
        WHERE deleted_at IS NULL AND event_id = $2 AND purchase_time < $3`,
      [FUTURE_EVENT_ID, PAST_EVENT_ID, src.created_at]);
    await pool.query("COMMIT");
    const a = await summarise(pool, PAST_EVENT_ID), b = await summarise(pool, FUTURE_EVENT_ID);
    console.log(`  event ${PAST_EVENT_ID}: tickets=${a.tickets} rev=${a.revenue}`);
    console.log(`  event ${FUTURE_EVENT_ID}: tickets=${b.tickets} rev=${b.revenue}`);
    await pool.end();
    return;
  }

  // ---- guards -------------------------------------------------------------
  const late = (await pool.query(
    `SELECT count(*)::int n FROM tickets t
      WHERE t.deleted_at IS NULL AND t.event_id = $1 AND t.purchase_time > $2`,
    [FUTURE_EVENT_ID, src.created_at])).rows[0].n;
  const isFutureEvent = !!src.event_date && new Date(src.event_date).getTime() > Date.now();
  const dstClosed = dst.status === "closed";

  const before2 = await summarise(pool, FUTURE_EVENT_ID);
  const before1 = await summarise(pool, PAST_EVENT_ID);

  console.log(`\n=== GUARDS ===`);
  console.log(`  ${late === 0 ? "PASS" : "FAIL"}  tickets on event ${FUTURE_EVENT_ID} sold after the row was created: ${late} (must be 0)`);
  console.log(`  ${isFutureEvent ? "PASS" : "FAIL"}  event ${FUTURE_EVENT_ID} is dated in the future: ${isoDate(src.event_date)}`);
  console.log(`  ${dstClosed ? "PASS" : "FAIL"}  event ${PAST_EVENT_ID} is a finished event: status=${dst.status}`);

  const mismatch = (await pool.query(
    `SELECT count(*)::int n FROM tickets t
      WHERE t.deleted_at IS NULL AND t.event_id = $1
        AND t.purchase_time >= $2`, [FUTURE_EVENT_ID, dst.created_at])).rows[0].n;
  console.log(`  ${mismatch === 0 ? "PASS" : "FAIL"}  nothing on event ${FUTURE_EVENT_ID} that post-dates event ${PAST_EVENT_ID} (a genuine November sale): ${mismatch}`);

  if (late !== 0 || !isFutureEvent || !dstClosed || mismatch !== 0) {
    console.log("\nGuard failed. Refusing to write. Re-run the audit to see current state.");
    await pool.end();
    process.exit(1);
  }

  // ---- plan ---------------------------------------------------------------
  const newClose = `${isoDate(src.event_date)}T12:00:00+03:00`;
  console.log(`\n=== PLANNED ===`);
  console.log(`  move ${before2.tickets} tickets (${before2.paid} paid, Ksh ${before2.revenue}, ${before2.guests} guests, ${before2.scanned} scanned)`);
  console.log(`      from event ${FUTURE_EVENT_ID} "${src.title}"  ->  event ${PAST_EVENT_ID} "${dst.title}"`);
  console.log(`  sales_close_date: ${isoDate(src.sales_close_date)} -> ${newClose.slice(0,10)} (event day)`);
  console.log(`  sales_open_date : ${isoDate(src.sales_open_date)} (unchanged, already in the past = open)`);
  console.log(`  NOT changed: status, is_active, recurrence_day, title, subtitle, event_date`);

  console.log(`\n=== RESULTING LEDGER ===`);
  console.log(`  event ${PAST_EVENT_ID} "${dst.title}"  ${before1.tickets} -> ${before1.tickets + before2.tickets} tickets, Ksh ${before1.revenue} -> ${before1.revenue + before2.revenue}`);
  console.log(`  event ${FUTURE_EVENT_ID} "${src.title}"  ${before2.tickets} -> 0 tickets, Ksh ${before2.revenue} -> 0`);

  if (!APPLY) {
    console.log("\nDry run. Re-run with --apply to write.");
    await pool.end();
    return;
  }

  await pool.query("BEGIN");
  await pool.query(
    `UPDATE tickets SET event_id = $1
      WHERE deleted_at IS NULL AND event_id = $2 AND purchase_time < $3`,
    [PAST_EVENT_ID, FUTURE_EVENT_ID, src.created_at]);
  await pool.query(
    `UPDATE events SET sales_close_date = $1::timestamptz WHERE id = $2`,
    [newClose, FUTURE_EVENT_ID]);
  await pool.query("COMMIT");

  const a = await summarise(pool, PAST_EVENT_ID);
  const b = await summarise(pool, FUTURE_EVENT_ID);
  const ev = (await pool.query(
    `SELECT sales_open_date, sales_close_date FROM events WHERE id = $1`, [FUTURE_EVENT_ID])).rows[0];
  console.log("\n=== AFTER ===");
  console.log(`  event ${PAST_EVENT_ID}: tickets=${a.tickets} paid=${a.paid} rev=${a.revenue} scanned=${a.scanned}`);
  console.log(`  event ${FUTURE_EVENT_ID}: tickets=${b.tickets} paid=${b.paid} rev=${b.revenue}`);
  console.log(`  event ${FUTURE_EVENT_ID} sales window: ${isoDate(ev.sales_open_date)} .. ${isoDate(ev.sales_close_date)}`);

  await pool.end();
})().catch(async (e) => {
  console.error("ERR " + e.message);
  try { await pool.end(); } catch {}
  process.exit(1);
});
