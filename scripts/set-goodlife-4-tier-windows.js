/**
 * Re-base GOODLIFE 4's ticket tier windows onto its real event date.
 *
 * THE BUG THIS FIXES
 *
 * The event moved from 2026-09-27 to 2026-11-07. The tier windows did not
 * move with it, so all three entry passes had windows that expired on Sep 26
 * and Sep 27 and have been dead ever since:
 *
 *     Early Bird 450   -> until 2026-09-26T15:00Z   EXPIRED
 *     ADVANCE PASS 800  Sep 26 -> Sep 27T00:00Z     EXPIRED
 *     gate VIP 1000     Sep 27 -> Sep 27T23:59Z     EXPIRED
 *
 * The site was nonetheless selling ADVANCE PASS at 800 with a working
 * Pay with M-Pesa button, because the checkout ladder only checks EARLY
 * BIRD's window to decide whether to promote Advance. It never checks
 * Advance's own window. So a customer could fill in the whole form and
 * only be refused at the final step. No entry pass was purchasable; the
 * five camping tiers were unaffected (no windows).
 *
 * THE NEW SCHEDULE, for event day 2026-11-07 (East Africa Time, UTC+3)
 *
 *   Early Bird 450   open now        -> 2026-10-18 00:00 EAT
 *   ADVANCE PASS 800 2026-10-18      -> 2026-11-06 23:59:59 EAT
 *   gate VIP 1000    2026-11-07 only (also flagged show_only_on_event_day)
 *   camping tiers    unchanged, no windows
 *
 * The checkout is then coherent at every moment: Early Bird now, Advance
 * for the three weeks before, gate VIP on the day itself.
 *
 *   node scripts/set-goodlife-4-tier-windows.js            (dry run)
 *   node scripts/set-goodlife-4-tier-windows.js --apply
 *   node scripts/set-goodlife-4-tier-windows.js --apply --rollback
 */
const { Client } = require("pg");

const EVENT_ID = 2;
const APPLY = process.argv.includes("--apply");
const ROLLBACK = process.argv.includes("--rollback");

// Restored verbatim if --rollback is used.
const PREVIOUS = {
  "early-bird-500": { available_from: null, available_until: "2026-09-26T15:00:00.000Z" },
  "advance-800": { available_from: "2026-09-26T15:00:00.000Z", available_until: "2026-09-27T00:00:00.000Z" },
  "vip-gate-1000": { available_from: "2026-09-27T00:00:00.000Z", available_until: "2026-09-27T23:59:59.000Z" },
};

const NEXT = {
  "early-bird-500": { available_from: null, available_until: "2026-10-18T00:00:00+03:00" },
  "advance-800": { available_from: "2026-10-18T00:00:00+03:00", available_until: "2026-11-06T23:59:59+03:00" },
  "vip-gate-1000": { available_from: "2026-11-07T00:00:00+03:00", available_until: "2026-11-07T23:59:59+03:00" },
};

const DATABASE_URL = (process.env.DATABASE_URL || "").trim().replace(/^["']|["']$/g, "");
if (!DATABASE_URL) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}
const pool = new Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

const iso = (v) => (v instanceof Date ? v.toISOString() : v == null ? null : String(v));

/** Evaluates a window the way CheckoutClientPage and the payment route do. */
function windowState(t, now) {
  if (t.hidden) return "HIDDEN";
  if (t.available_from && now < new Date(t.available_from)) return "not yet on sale";
  if (t.available_until && now > new Date(t.available_until)) return "WINDOW CLOSED";
  return "on sale";
}

(async () => {
  await pool.connect();
  const ev = (await pool.query(
    `SELECT id, title, event_date FROM events WHERE id = $1`, [EVENT_ID])).rows[0];
  if (!ev) {
    console.error(`Event ${EVENT_ID} not found. Refusing.`);
    await pool.end();
    process.exit(1);
  }
  console.log(`=== ${ev.title} (event ${ev.id}) event_date = ${iso(ev.event_date)} ===`);

  const tiers = (await pool.query(
    `SELECT id, name, price, hidden, available_from, available_until, show_only_on_event_day,
            tier_category, is_camping_bundle
       FROM ticket_tiers
      WHERE event_id = $1 AND deleted_at IS NULL
      ORDER BY COALESCE(is_camping_bundle, false), price`, [EVENT_ID])).rows;

  const target = tiers.filter((t) => NEXT[t.id]);
  if (target.length !== Object.keys(NEXT).length) {
    console.error("Expected the 3 entry passes; found " + target.length + ". Refusing.");
    await pool.end();
    process.exit(1);
  }

  if (ROLLBACK) {
    console.log("\n=== ROLLBACK: restoring the original (expired) windows ===");
    for (const t of target) {
      const p = PREVIOUS[t.id];
      console.log(`  ${t.name}: until ${iso(t.available_until)} -> ${iso(p.available_until)}`);
    }
    if (!APPLY) { console.log("Dry run."); await pool.end(); return; }
    await pool.query("BEGIN");
    for (const t of target) {
      const p = PREVIOUS[t.id];
      await pool.query(
        `UPDATE ticket_tiers SET available_from = $1::timestamptz, available_until = $2::timestamptz
          WHERE id = $3 AND event_id = $4`,
        [p.available_from, p.available_until, t.id, EVENT_ID]);
    }
    await pool.query("COMMIT");
    console.log("Rolled back.");
    await pool.end();
    return;
  }

  const now = Date.now();
  console.log("\n=== BEFORE (now = " + new Date(now).toISOString() + ") ===");
  for (const t of tiers) {
    console.log(`  ${String(t.name).padEnd(30)} KES ${String(t.price).padEnd(6)} ${windowState(t, now).padEnd(16)} ${iso(t.available_from) || "-"} .. ${iso(t.available_until) || "-"}`);
  }

  console.log("\n=== AFTER ===");
  for (const t of tiers) {
    const n = NEXT[t.id];
    const from = n ? n.available_from : t.available_from;
    const until = n ? n.available_until : t.available_until;
    const synthetic = { ...t, available_from: from, available_until: until };
    console.log(`  ${String(t.name).padEnd(30)} KES ${String(t.price).padEnd(6)} ${windowState(synthetic, now).padEnd(16)} ${iso(from) || "-"} .. ${iso(until) || "-"}`);
  }

  // Sanity: at each point in the schedule, exactly the intended pass is on sale.
  const probes = [
    ["now", now],
    ["2026-10-17T12:00:00+03:00", new Date("2026-10-17T12:00:00+03:00").getTime()],
    ["2026-10-19T12:00:00+03:00", new Date("2026-10-19T12:00:00+03:00").getTime()],
    ["2026-11-06T12:00:00+03:00", new Date("2026-11-06T12:00:00+03:00").getTime()],
    ["event day 12:00", new Date("2026-11-07T12:00:00+03:00").getTime()],
  ];
  console.log("\n=== what sells, when ===");
  for (const [label, at] of probes) {
    const live = target
      .map((t) => ({ t, n: NEXT[t.id] }))
      .filter(({ t, n }) => windowState({ ...t, available_from: n.available_from, available_until: n.available_until }, at) === "on sale")
      .map(({ t }) => `${t.name} ${t.price}`);
    console.log(`  ${label.padEnd(26)} -> ${live.length ? live.join(", ") : "(none - gate only)"}`);
  }

  if (!APPLY) {
    console.log("\nDry run. Re-run with --apply to write.");
    await pool.end();
    return;
  }

  await pool.query("BEGIN");
  for (const t of target) {
    const n = NEXT[t.id];
    await pool.query(
      `UPDATE ticket_tiers
          SET available_from = $1::timestamptz,
              available_until = $2::timestamptz,
              show_only_on_event_day = $3
        WHERE id = $4 AND event_id = $5`,
      [n.available_from, n.available_until, t.id === "vip-gate-1000", t.id, EVENT_ID]);
  }
  await pool.query("COMMIT");

  const after = (await pool.query(
    `SELECT id, name, price, hidden, available_from, available_until, show_only_on_event_day
       FROM ticket_tiers WHERE event_id = $1 AND deleted_at IS NULL ORDER BY price`, [EVENT_ID])).rows;
  console.log("\n=== WRITTEN ===");
  for (const t of after) {
    console.log(`  ${String(t.name).padEnd(30)} KES ${String(t.price).padEnd(6)} ${windowState(t, now).padEnd(16)} ${iso(t.available_from) || "-"} .. ${iso(t.available_until) || "-"}`);
  }
  await pool.end();
})().catch(async (e) => {
  console.error("ERR " + e.message);
  try { await pool.end(); } catch {}
  process.exit(1);
});
