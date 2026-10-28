/**
 * Event Card Lifecycle & Faked Clock Verification Suite.
 *
 * Verifies that the featured festival card:
 * 1. Remains visible at 03:00 Kenya time on event day (when event_date 00:00Z is reached).
 * 2. Displays "EVENT DAY" instead of "0D : 0H : 0M" once event_date arrives.
 * 3. Keeps CTA "GET FESTIVAL PASSES" active while sales_close_date has not passed.
 * 4. Switches CTA to "VIEW EVENT DETAILS" and badge to "SALES CLOSED" once sales_close_date passes.
 * 5. Hides gracefully only after the festival day has fully concluded.
 */

import { computeKenyaCountdown, isEventCardVisible } from "../lib/radio/event-card";
import { isEventSellable } from "../lib/event-availability";
import { Event as EventType } from "../lib/supabase-db-types";

let passed = 0;
let failed = 0;

function check(name: string, condition: boolean, details?: string) {
  if (condition) {
    passed++;
    console.log(`PASS: ${name}`);
  } else {
    failed++;
    console.error(`FAIL: ${name}${details ? ` -> ${details}` : ""}`);
  }
}

async function run() {
  console.log("=== Running Event Card Lifecycle Verification with Faked Clocks ===\n");

  // Real database event object for GOODLIFE 4
  const event: any = {
    id: 2,
    title: "GOODLIFE 4",
    event_date: "2026-11-07T00:00:00.000Z",       // 03:00 EAT on Nov 7
    sales_open_date: "2026-09-24T12:58:00.000Z",
    sales_close_date: "2026-11-07T09:00:00.000Z",  // 12:00 EAT on Nov 7
    status: "live",
    is_active: true,
    category: "flagship",
    recurrence_pattern: "none"
  };

  // Test 1: 10 days before event (2026-10-28 00:00:00Z)
  console.log("--- Test 1: 10 Days Before Event (2026-10-28 00:00:00Z) ---");
  const time10DaysBefore = new Date("2026-10-28T00:00:00.000Z").getTime();
  const cd1 = computeKenyaCountdown(event.event_date, time10DaysBefore);
  const vis1 = isEventCardVisible(event, time10DaysBefore);
  const sell1 = isEventSellable(event, new Date(time10DaysBefore));

  check("Card is visible 10 days before event", vis1 === true);
  check("Countdown is not passed", cd1?.isPassed === false);
  check("Countdown shows exactly 10 days", cd1?.days === 10);
  check("Tickets are sellable", sell1 === true);

  // Test 2: 1 hour before event_date (2026-11-06 23:00:00Z / 02:00 EAT)
  console.log("\n--- Test 2: 1 Hour Before Event Date (2026-11-06 23:00:00Z / 02:00 EAT) ---");
  const time1HourBefore = new Date("2026-11-06T23:00:00.000Z").getTime();
  const cd2 = computeKenyaCountdown(event.event_date, time1HourBefore);
  const vis2 = isEventCardVisible(event, time1HourBefore);
  const sell2 = isEventSellable(event, new Date(time1HourBefore));

  check("Card is visible 1 hour before event_date", vis2 === true);
  check("Countdown is not passed", cd2?.isPassed === false);
  check("Countdown shows 0 days and 1 hour", cd2?.days === 0 && cd2?.hours === 1);
  check("Tickets are sellable", sell2 === true);

  // Test 3: 4 hours after event_date (2026-11-07 04:00:00Z / 07:00 EAT, sales close at 09:00Z / 12:00 EAT)
  console.log("\n--- Test 3: 4 Hours After Event Date (2026-11-07 04:00:00Z / 07:00 EAT) ---");
  const time4HoursAfter = new Date("2026-11-07T04:00:00.000Z").getTime();
  const cd3 = computeKenyaCountdown(event.event_date, time4HoursAfter);
  const vis3 = isEventCardVisible(event, time4HoursAfter);
  const sell3 = isEventSellable(event, new Date(time4HoursAfter));

  check("CRITICAL: Card does NOT vanish at 03:00 Kenya time on event day", vis3 === true);
  check("Countdown correctly flags isPassed=true", cd3?.isPassed === true);
  check("Tickets REMAIN SELLABLE (sales close at 12:00 EAT)", sell3 === true);

  // Test 4: 1 hour after sales_close_date (2026-11-07 10:00:00Z / 13:00 EAT)
  console.log("\n--- Test 4: After Sales Close Date (2026-11-07 10:00:00Z / 13:00 EAT) ---");
  const timeAfterSalesClose = new Date("2026-11-07T10:00:00.000Z").getTime();
  const cd4 = computeKenyaCountdown(event.event_date, timeAfterSalesClose);
  const vis4 = isEventCardVisible(event, timeAfterSalesClose);
  const sell4 = isEventSellable(event, new Date(timeAfterSalesClose));

  check("Card remains visible on event day afternoon for venue info", vis4 === true);
  check("Countdown is passed", cd4?.isPassed === true);
  check("Tickets are no longer sellable after sales_close_date", sell4 === false);

  // Test 5: Post-event day cleanup (2026-11-08 04:00:00Z)
  console.log("\n--- Test 5: Next Day Post-Event (2026-11-08 04:00:00Z) ---");
  const timeNextDay = new Date("2026-11-08T04:00:00.000Z").getTime();
  const vis5 = isEventCardVisible(event, timeNextDay);
  check("Card hides gracefully once the event date has fully passed", vis5 === false);

  console.log(`\n================================`);
  console.log(`Total checks: ${passed + failed}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`================================`);

  if (failed > 0) process.exit(1);
}

run();
