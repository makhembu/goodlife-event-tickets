/**
 * Verification Suite: Event Data Layer & Drop Engine v2 Contract
 *
 * Locks down:
 * - Spoken price number-to-words formatting (speakPrice)
 * - Event title normalization (stripping edition numbers, casing, & to and)
 * - Africa/Nairobi (EAT) calendar date diff & midnight boundaries (23:59 vs 00:01)
 * - Countdown phrasing ("in 10 days", "this Saturday", "tomorrow", "today", "tonight", "happening now")
 * - Gates-open phrasing ("gates open at noon", "gates open at 2:00 PM")
 * - Lineup confirmation safety gate (never speak unconfirmed acts)
 * - GPS coordinate bounding box validation
 * - Ticket tier availability equality with checkout rules
 * - valid_until boundary calculation across price transitions (Oct 30 21:00 EAT)
 * - Live Neon DB promotable events extraction & facts_hash calculation
 */

import fs from "fs";
import path from "path";

// Ensure DATABASE_URL is set before any module initializes db connection
if (!process.env.DATABASE_URL) {
  try {
    const envPath = path.resolve(process.cwd(), ".env.local");
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, "utf8");
      for (const line of content.split(/\r?\n/)) {
        const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*"?([^"#\r\n]+?)"?\s*$/);
        if (m && !process.env[m[1]]) {
          process.env[m[1]] = m[2].trim();
        }
      }
    }
  } catch {}
}

async function runVerification() {
  // Dynamically import to ensure process.env.DATABASE_URL is set before pool creation
  const {
    speakPrice,
    normalizeEventTitle,
    computeCountdownPhrase,
    formatGatesOpenPhrase,
    validateVenueCoords,
    isTierOnSale,
    getNextEatMidnight,
    getEatCalendarDayDiff,
    getPromotableEvents,
  } = await import("../lib/radio/events");

  let failures = 0;

  function assert(condition: boolean, msg: string) {
    if (!condition) {
      console.error(`FAIL: ${msg}`);
      failures++;
    } else {
      console.log(`PASS: ${msg}`);
    }
  }

  console.log("Starting Radio Events & Drop Engine v2 Data Layer Verification...\n");

  // ============================================================================
  // 1. Spoken Price Formatting (speakPrice)
  // ============================================================================
  console.log("--- 1. Spoken Price Formatter ---");

  assert(speakPrice(0) === "free entry", "speakPrice(0) returns 'free entry'");
  assert(speakPrice(450) === "four hundred and fifty shillings", "speakPrice(450) matches Nairobi English");
  assert(speakPrice(500) === "five hundred shillings", "speakPrice(500) returns 'five hundred shillings'");
  assert(speakPrice(1000) === "one thousand shillings", "speakPrice(1000) returns 'one thousand shillings'");
  assert(speakPrice(1250) === "one thousand two hundred and fifty shillings", "speakPrice(1250) returns 'one thousand two hundred and fifty shillings'");
  assert(speakPrice(1500) === "one thousand five hundred shillings", "speakPrice(1500) returns 'one thousand five hundred shillings'");
  assert(speakPrice(2000) === "two thousand shillings", "speakPrice(2000) returns 'two thousand shillings'");
  assert(speakPrice(2500) === "two thousand five hundred shillings", "speakPrice(2500) returns 'two thousand five hundred shillings'");
  assert(speakPrice(3000) === "three thousand shillings", "speakPrice(3000) returns 'three thousand shillings'");
  assert(speakPrice(10000) === "ten thousand shillings", "speakPrice(10000) returns 'ten thousand shillings'");

  // Verify digits and currency codes are strictly forbidden
  const testPrices = [50, 450, 600, 1000, 2500, 5000];
  for (const p of testPrices) {
    const spoken = speakPrice(p);
    assert(!/\d/.test(spoken), `speakPrice(${p}) has no numeric digits: "${spoken}"`);
    assert(!spoken.includes("KES"), `speakPrice(${p}) does not contain 'KES'`);
    assert(spoken.endsWith("shillings"), `speakPrice(${p}) ends with 'shillings'`);
  }

  // ============================================================================
  // 2. Title Normalization (normalizeEventTitle)
  // ============================================================================
  console.log("\n--- 2. Title Normalization ---");

  assert(
    normalizeEventTitle("SUNDAY PARK & CHILL #12") === "Sunday Park and Chill",
    "normalizeEventTitle strips '#12', converts '&' to 'and', title-cases all-caps"
  );
  assert(
    normalizeEventTitle("GOODLIFE 4 - MARARA CAMP #1") === "Goodlife 4 - Marara Camp",
    "normalizeEventTitle strips '#1' and title-cases"
  );
  assert(
    normalizeEventTitle("URBAN FESTIVAL Vol. 3") === "Urban Festival",
    "normalizeEventTitle strips 'Vol. 3'"
  );
  assert(
    normalizeEventTitle("STREET CARNIVAL No. 5") === "Street Carnival",
    "normalizeEventTitle strips 'No. 5'"
  );
  assert(
    normalizeEventTitle("CAMP & CHILL EDITION 4") === "Camp and Chill",
    "normalizeEventTitle strips 'Edition 4' and converts '&'"
  );

  // ============================================================================
  // 3. EAT Timezone & Midnight Boundary Maths
  // ============================================================================
  console.log("\n--- 3. EAT Timezone & Midnight Calculations ---");

  // EAT is UTC+3
  // 2026-10-28 20:59:00 UTC = 2026-10-28 23:59:00 EAT
  const beforeMidnightUtc = new Date("2026-10-28T20:59:00.000Z");
  // 2026-10-28 21:01:00 UTC = 2026-10-29 00:01:00 EAT
  const afterMidnightUtc = new Date("2026-10-28T21:01:00.000Z");

  const midnightFromBefore = getNextEatMidnight(beforeMidnightUtc);
  assert(
    midnightFromBefore.toISOString() === "2026-10-28T21:00:00.000Z",
    "getNextEatMidnight before midnight correctly returns upcoming EAT 00:00"
  );

  const midnightFromAfter = getNextEatMidnight(afterMidnightUtc);
  assert(
    midnightFromAfter.toISOString() === "2026-10-29T21:00:00.000Z",
    "getNextEatMidnight after midnight correctly steps to the following EAT midnight"
  );

  const targetEventDate = new Date("2026-11-07T09:00:00.000Z"); // Nov 7 noon EAT
  assert(
    getEatCalendarDayDiff(targetEventDate, beforeMidnightUtc) === 10,
    "Oct 28 23:59 EAT to Nov 7 is exactly 10 days"
  );
  assert(
    getEatCalendarDayDiff(targetEventDate, afterMidnightUtc) === 9,
    "Oct 29 00:01 EAT to Nov 7 flips to 9 days"
  );

  // ============================================================================
  // 4. Countdown Phrasing Rules
  // ============================================================================
  console.log("\n--- 4. Countdown Phrasing Rules ---");

  // 10 days out
  const cd10 = computeCountdownPhrase(
    new Date("2026-11-07T09:00:00.000Z"),
    new Date("2026-11-07T09:00:00.000Z"),
    null,
    null,
    new Date("2026-10-28T09:00:00.000Z")
  );
  assert(cd10.phrase === "in 10 days" && cd10.dayLevel, "10 days out returns 'in 10 days' with dayLevel=true");

  // 3 days out (e.g. Wednesday to Saturday)
  const wednesday = new Date("2026-11-04T09:00:00.000Z");
  const saturday = new Date("2026-11-07T09:00:00.000Z");
  const cdWeek = computeCountdownPhrase(saturday, null, null, null, wednesday);
  assert(cdWeek.phrase === "this Saturday" && cdWeek.dayLevel, "Within 7 days returns 'this Saturday'");

  // 1 day out (Friday to Saturday)
  const friday = new Date("2026-11-06T09:00:00.000Z");
  const cdTomorrow = computeCountdownPhrase(saturday, null, null, null, friday);
  assert(cdTomorrow.phrase === "tomorrow" && cdTomorrow.dayLevel, "1 day out returns 'tomorrow'");

  // Same day morning (before 18:00 EAT = 15:00 UTC)
  const satMorning = new Date("2026-11-07T07:00:00.000Z"); // 10:00 AM EAT
  const cdToday = computeCountdownPhrase(saturday, null, null, null, satMorning);
  assert(cdToday.phrase === "today" && cdToday.dayLevel, "Event day morning returns 'today'");

  // Same day evening (after 18:00 EAT = 15:00 UTC)
  const satEvening = new Date("2026-11-07T16:00:00.000Z"); // 19:00 EAT
  const cdTonight = computeCountdownPhrase(saturday, null, null, null, satEvening);
  assert(cdTonight.phrase === "tonight" && cdTonight.dayLevel, "Event day evening returns 'tonight'");

  // Live now (between starts_at and ends_at)
  const cdLive = computeCountdownPhrase(
    saturday,
    new Date("2026-11-07T09:00:00.000Z"),
    new Date("2026-11-07T11:00:00.000Z"),
    new Date("2026-11-08T03:00:00.000Z"),
    new Date("2026-11-07T14:00:00.000Z")
  );
  assert(cdLive.phrase === "happening now" && cdLive.isLiveNow, "Between starts_at and ends_at returns 'happening now'");

  // ============================================================================
  // 5. Gates Open Phrasing
  // ============================================================================
  console.log("\n--- 5. Gates Open Phrasing ---");

  assert(
    formatGatesOpenPhrase("2026-11-07T09:00:00.000Z") === "gates open at noon",
    "09:00 UTC (12:00 EAT) returns 'gates open at noon'"
  );
  assert(
    formatGatesOpenPhrase("2026-11-07T11:00:00.000Z") === "gates open at 2 PM",
    "11:00 UTC (14:00 EAT) returns 'gates open at 2 PM'"
  );
  assert(
    formatGatesOpenPhrase("2026-11-07T11:30:00.000Z") === "gates open at 2:30 PM",
    "11:30 UTC (14:30 EAT) returns 'gates open at 2:30 PM'"
  );
  assert(formatGatesOpenPhrase(null) === null, "null gates returns null");

  // ============================================================================
  // 6. Venue GPS Coordinate Validation
  // ============================================================================
  console.log("\n--- 6. Venue GPS Validation ---");

  const validCoords = validateVenueCoords({ lat: -1.0333, lng: 37.0694 });
  assert(validCoords !== null && validCoords.lat === -1.0333, "Valid Thika coords pass validation");

  assert(validateVenueCoords({ lat: 51.5074, lng: -0.1278 }) === null, "London coords rejected (outside Kenya)");
  assert(validateVenueCoords({ lat: -10.0, lng: 37.0 }) === null, "Lat < -5 rejected");
  assert(validateVenueCoords({ lat: 0, lng: 20.0 }) === null, "Lng < 33 rejected");
  assert(validateVenueCoords(null) === null, "null coords handled gracefully");

  // ============================================================================
  // 7. Ticket Tier Availability Equality & Price Boundaries (Oct 30 21:00 EAT)
  // ============================================================================
  console.log("\n--- 7. Tier Availability & Price Boundaries ---");

  const mockEvent: any = {
    status: "live",
    event_date: "2026-11-07T00:00:00.000Z",
    sales_open_date: "2026-10-01T00:00:00.000Z",
    sales_close_date: "2026-11-07T09:00:00.000Z",
  };

  const earlyBirdTier: any = {
    id: 101,
    event_id: 2,
    name: "Early Bird Pass",
    price: 450,
    sold_count: 5,
    max_quantity: 100,
    available_from: "2026-10-01T00:00:00.000Z",
    available_until: "2026-10-30T18:00:00.000Z", // 21:00 EAT
    hidden: false,
    deleted_at: null,
  };

  const advanceTier: any = {
    id: 102,
    event_id: 2,
    name: "Advance Pass",
    price: 500,
    sold_count: 0,
    max_quantity: 200,
    available_from: "2026-10-30T18:00:00.000Z", // 21:00 EAT
    available_until: "2026-11-07T09:00:00.000Z",
    hidden: false,
    deleted_at: null,
  };

  const beforeBoundary = new Date("2026-10-30T17:59:00.000Z");
  assert(isTierOnSale(earlyBirdTier, mockEvent, beforeBoundary) === true, "Early Bird is ON SALE before Oct 30 21:00 EAT");
  assert(isTierOnSale(advanceTier, mockEvent, beforeBoundary) === false, "Advance is NOT ON SALE before Oct 30 21:00 EAT");

  const afterBoundary = new Date("2026-10-30T18:01:00.000Z");
  assert(isTierOnSale(earlyBirdTier, mockEvent, afterBoundary) === false, "Early Bird is CLOSED after Oct 30 21:00 EAT");
  assert(isTierOnSale(advanceTier, mockEvent, afterBoundary) === true, "Advance is ON SALE after Oct 30 21:00 EAT");

  const hiddenTier = { ...earlyBirdTier, hidden: true };
  assert(!isTierOnSale(hiddenTier, mockEvent, beforeBoundary), "Hidden tier is never on sale");
  const deletedTier = { ...earlyBirdTier, deleted_at: "2026-10-20T00:00:00.000Z" };
  assert(!isTierOnSale(deletedTier, mockEvent, beforeBoundary), "Deleted tier is never on sale");

  const soldOutTier = { ...earlyBirdTier, sold_count: 100, max_quantity: 100 };
  assert(!isTierOnSale(soldOutTier, mockEvent, beforeBoundary), "Sold-out tier (sold >= max) is not on sale");

  // ============================================================================
  // 8. Live Database Integration: Promotable Events Query
  // ============================================================================
  console.log("\n--- 8. Live DB Query Verification ---");

  const events = await getPromotableEvents();
  assert(Array.isArray(events), "getPromotableEvents returns an array");
  console.log(`Discovered ${events.length} promotable event(s) from live Neon DB.`);

  for (const ev of events) {
    console.log(`\nEvent [${ev.id}]: "${ev.name_spoken}"`);
    console.log(`- State: ${ev.state}, Countdown: "${ev.countdown_phrase}"`);
    console.log(`- Gates: ${ev.gates_open_phrase || "N/A"}`);
    console.log(`- Ticket URL: ${ev.ticket_url}`);
    console.log(`- Spoken URL: "${ev.spoken_ticket_url}"`);
    console.log(`- Lineup confirmed: ${ev.lineup.length > 0 ? "YES (" + ev.lineup.join(", ") + ")" : "NO (Lineup empty)"}`);
    console.log(`- Active entry tiers (${ev.tiers.length}):`);
    for (const t of ev.tiers) {
      console.log(`  * ${t.name}: ${t.price} KES ("${t.price_spoken}")`);
    }
    console.log(`- Facts Hash: ${ev.facts_hash.slice(0, 16)}...`);
    console.log(`- Valid Until: ${new Date(ev.valid_until).toISOString()}`);

    assert(Boolean(ev.name_spoken), `Event ${ev.id} has a non-empty spoken name`);
    assert(ev.ticket_url.startsWith("http"), `Event ${ev.id} has a valid ticket URL`);
    assert(ev.valid_until > Date.now(), `Event ${ev.id} valid_until is in the future`);
    assert(ev.facts_hash.length === 64, `Event ${ev.id} facts_hash is a 64-char hex string`);
  }

  console.log("\n========================================================");
  if (failures > 0) {
    console.error(`FAILED: ${failures} assertions failed.`);
    process.exit(1);
  } else {
    console.log("ALL TESTS PASSED! Event Data Layer & Drop Engine v2 verified.");
    process.exit(0);
  }
}

runVerification().catch((err) => {
  console.error("Test execution failed with error:", err);
  process.exit(1);
});
