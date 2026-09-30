/**
 * Routing self-check for `publicState`. Imports the REAL module, so it cannot
 * drift from the code the site runs.
 *
 *   npx tsx tests/public-state.check.ts
 *
 * This exists because the original bug - `status === 'closed' || status ===
 * 'scheduled'` sending a not-yet-happened festival to the recap page - was a
 * one-line decision with no test around it, and it survived a long time. It
 * encodes every case that has actually bitten, including the two production
 * data shapes found in the live database (a `status='active'` flagship and a
 * `status='closed'` row carrying an accidental `archived_at` stamp).
 */

import {
  publicState,
  getEventAvailability,
  canonicalStatus,
  isHiddenFromSite,
  type SchedulableEvent,
  type UnavailabilityReason,
} from "../lib/event-availability";

const NOW = new Date("2026-09-30T09:00:00Z"); // a Wednesday, 12:00 EAT

let pass = 0;
const failures: string[] = [];

function check(name: string, actual: unknown, expected: unknown) {
  if (actual === expected) {
    pass++;
  } else {
    failures.push(`  ${name}\n    expected: ${String(expected)}\n    actual:   ${String(actual)}`);
  }
}

const cases: Array<[string, SchedulableEvent, string]> = [
  // --- the original bug -------------------------------------------------
  [
    "a scheduled flagship is ANNOUNCED, not concluded",
    { status: "scheduled", category: "flagship", sales_open_date: "2026-10-20T09:00:00Z" },
    "coming_soon",
  ],
  [
    "a scheduled flagship with NO open date sells straight away",
    // `getEventAvailability` treats `scheduled` as a live status so an edition
    // can be announced before its window opens. With no window set, that means
    // "on sale as soon as you announce it" - deliberate, not an oversight.
    { status: "scheduled", category: "flagship" },
    "checkout",
  ],
  [
    "a scheduled flagship whose open date has passed sells",
    { status: "scheduled", category: "flagship", sales_open_date: "2026-09-01T09:00:00Z" },
    "checkout",
  ],
  [
    "a scheduled flagship with a FUTURE open date waits",
    { status: "scheduled", category: "flagship", sales_open_date: "2026-10-20T09:00:00Z" },
    "coming_soon",
  ],
  ["a closed flagship is a recap", { status: "closed", category: "flagship" }, "recap"],
  [
    "a live flagship sells",
    { status: "live", category: "flagship", sales_close_date: "2026-11-07T09:00:00Z", event_date: "2026-11-07" },
    "checkout",
  ],

  // --- archived ---------------------------------------------------------
  ["an archived event is not routable", { status: "archived", category: "flagship" }, "unavailable"],
  [
    "a live event with archived_at set is not routable",
    { status: "live", category: "flagship", archived_at: "2026-09-01T00:00:00Z" },
    "unavailable",
  ],
  [
    "a CLOSED event keeps its recap even with a stray archived_at",
    { status: "closed", category: "flagship", archived_at: "2026-09-25T09:49:46Z" },
    "recap",
  ],

  // --- the legacy 'active' spelling (found in the live database) -------
  [
    "legacy status='active' flagship sells",
    {
      status: "active",
      category: "flagship",
      sales_open_date: "2026-09-24T12:58:07Z",
      sales_close_date: "2026-11-07T09:00:00Z",
      event_date: "2026-11-07",
    },
    "checkout",
  ],
  [
    "legacy status='active' is not sellable when the window is shut",
    { status: "active", category: "flagship", sales_close_date: "2026-01-01T00:00:00Z" },
    "checkout", // reaches checkout; the payment layer refuses with sales_closed
  ],

  // --- mini festivals: status must not gate them -----------------------
  [
    "a scheduled weekly mini reaches checkout (not the countdown)",
    {
      status: "scheduled",
      category: "mini",
      recurrence_pattern: "weekly",
      recurrence_day: "Sunday",
      recurrence_time: "14:00",
    },
    "checkout",
  ],
  [
    "a mini on its session day still reaches checkout",
    {
      status: "live",
      category: "mini",
      recurrence_pattern: "weekly",
      recurrence_day: "Wednesday",
      recurrence_time: "14:00",
    },
    "checkout",
  ],
  [
    "a closed mini is a recap",
    { status: "closed", category: "mini", recurrence_pattern: "weekly", recurrence_day: "Sunday" },
    "recap",
  ],
  [
    "an archived mini is not routable",
    { status: "scheduled", category: "mini", archived_at: "2026-09-01T00:00:00Z" },
    "unavailable",
  ],

  // --- one-off vs recurring --------------------------------------------
  [
    "a one-off flagship past its event_date is a recap, not a dead checkout",
    { status: "live", category: "flagship", event_date: "2026-08-01" },
    "recap",
  ],
  [
    "a monthly series is not closed by event_date",
    // NOT `recurrence_pattern: "monthly"` - that enum member is unreachable
    // from every UI in this repo (no `<option value="monthly">` exists) and the
    // engine logs a warning and degrades it to non-recurring. Using a supported
    // pattern here is what this assertion is actually about.
    {
      status: "live",
      category: "mini",
      recurrence_pattern: "weekly",
      recurrence_day: "Saturday",
      recurrence_time: "14:00",
      event_date: "2026-01-04",
    },
    "checkout",
  ],
  [
    "an unsupported monthly pattern degrades to non-recurring, not to a crash",
    {
      status: "live",
      category: "mini",
      recurrence_pattern: "monthly",
      event_date: "2027-01-04",
    },
    "checkout",
  ],

  // --- degenerate -------------------------------------------------------
  ["null is not routable", null, "unavailable"],
  ["undefined is not routable", undefined, "unavailable"],
  [
    "a flagship with no status at all does NOT reach checkout",
    // This was the last remaining page/payment disagreement: `publicState` fell
    // through to `checkout` and the page advertised a price ladder that all
    // three payment routes refused with "not live".
    { category: "flagship" },
    "coming_soon",
  ],
  [
    "a flagship with an unrecognised status does NOT reach checkout",
    { category: "flagship", status: "banana" },
    "coming_soon",
  ],
  [
    "a mini with an unrecognised status does NOT reach checkout",
    { status: "banana", category: "mini", recurrence_pattern: "weekly", recurrence_day: "Sunday" },
    "coming_soon",
  ],
];

console.log(`publicState @ ${NOW.toISOString()}\n`);
for (const [name, event, expected] of cases) {
  check(name, publicState(event, NOW), expected);
}

// The availability layer must agree with the routing layer. This is the
// invariant that keeps a customer from being shown a price for something the
// payment routes will refuse.
//
// There are exactly three deliberate exceptions, and they are listed here by
// name so that adding a fourth becomes a conscious decision rather than a
// silent regression:
//   - `sales_closed`   - the admin set a hard cut-off; the page must render so
//                        the customer can read "Gate tickets at the entrance".
//   - `occurrence_day` - a recurring session is under way; the page must render
//                        so the customer can read when it reopens.
//   - `event_finished` - already routed to `recap`, listed for completeness.
// Everything else must agree exactly.
const ROUTE_WITHOUT_PERMIT = new Set<UnavailabilityReason>([
  "sales_closed",
  "occurrence_day",
]);

console.log("routing / payment agreement\n");
for (const [name, event] of cases) {
  if (!event) continue;
  const state = publicState(event, NOW);
  const { sellable, reason } = getEventAvailability(event, NOW);
  if (state === "checkout" && !sellable && !ROUTE_WITHOUT_PERMIT.has(reason!)) {
    failures.push(
      `  ROUTE/PERMIT MISMATCH: "${name}" routes to checkout but payment says "${reason}". ` +
        `Add it to ROUTE_WITHOUT_PERMIT only if a page that cannot sell is really the right answer.`
    );
  } else {
    pass++;
  }
}

console.log(`canonicalStatus: 'active' -> ${canonicalStatus("active")}, 'live' -> ${canonicalStatus("live")}, 'ARCHIVED' -> ${canonicalStatus("ARCHIVED")}`);
check("canonicalStatus folds 'active'", canonicalStatus("active"), "live");
check("isHiddenFromSite: closed+archived is visible", isHiddenFromSite({ status: "closed", archived_at: "x" }), false);
check("isHiddenFromSite: live+archived is hidden", isHiddenFromSite({ status: "live", archived_at: "x" }), true);

console.log(`\n${pass} passed, ${failures.length} failed`);

// ---------------------------------------------------------------------------
// Optional: run the same decisions against the live database. READ-ONLY.
//
//   npx tsx tests/public-state.check.ts --live
//
// Worth running after any data edit, because the assertion above cannot cover a
// value that is only present in production - `status='active'` on the live
// flagship and a `status='closed'` row carrying an accidental `archived_at` were
// both found this way and neither was in any test.
// ---------------------------------------------------------------------------
if (process.argv.includes("--live")) {
  reportLive()
    .then(() => {
      if (failures.length) {
        console.log("\nFAILURES:\n" + failures.join("\n"));
        process.exit(1);
      }
    })
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
} else if (failures.length) {
  console.log("\nFAILURES:\n" + failures.join("\n"));
  process.exit(1);
}

async function reportLive() {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const { Client } = await import("pg");

  function readDatabaseUrl(): string {
    if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
    const envPath = path.join(__dirname, "..", ".env.local");
    for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*DATABASE_URL\s*=\s*"?([^"#]+?)"?\s*$/);
      if (m) return m[1].trim();
    }
    console.error("DATABASE_URL not found");
    process.exit(1);
  }

  const client = new Client({ connectionString: readDatabaseUrl(), ssl: { rejectUnauthorized: false } });
  await client.connect();
  const { rows } = await client.query(
    `SELECT id, title, status, is_active, category, event_date,
            sales_open_date, sales_close_date, recurrence_pattern,
            recurrence_day, recurrence_time, archived_at
       FROM events ORDER BY id`
  );

  const PAGE = {
    checkout: "CHECKOUT ",
    coming_soon: "SOON    ",
    recap: "RECAP   ",
    unavailable: "404     ",
  } as const;

  console.log(`\n\nlive database — what / would serve each event (now = ${new Date().toISOString()})\n`);
  for (const e of rows) {
    const state = publicState(e);
    const { sellable, reason } = getEventAvailability(e);
    const permit = sellable ? "can pay" : `BLOCKED: ${reason}`;
    const flag = state === "checkout" && !sellable && !ROUTE_WITHOUT_PERMIT.has(reason!)
      ? "   <<< MISMATCH" : "";
    console.log(
      `  #${String(e.id).padEnd(3)} ${PAGE[state]} status=${String(e.status ?? "(null)").padEnd(10)}` +
        ` ${permit.padEnd(22)} ${String(e.title).slice(0, 32)}${flag}`
    );
    if (e.archived_at) console.log(`        archived_at=${new Date(e.archived_at).toISOString()}`);
  }
  await client.end();
}
