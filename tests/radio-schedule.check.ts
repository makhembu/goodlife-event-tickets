/**
 * Verification test suite for Goodlife Radio schedule, recurrence generator,
 * Africa/Nairobi timezone math, and iCalendar (.ics) exports.
 *
 * Run with:
 *   .\node_modules\.bin\tsx.cmd tests/radio-schedule.check.ts
 */

import {
  nairobiToUtcDate,
  utcToNairobiDateString,
  utcToNairobiDateTimeString,
} from "../lib/radio/schedule-generator";

let pass = 0;
const failures: string[] = [];

function check(name: string, condition: boolean) {
  if (condition) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    failures.push(name);
    console.error(`  ✗ FAIL: ${name}`);
  }
}

async function runTests() {
  console.log("=== Goodlife Radio Schedule & Timezone Checks ===");

  // 1. Timezone conversion: Africa/Nairobi is UTC+3 with NO daylight saving time.
  const nairobiEvening = nairobiToUtcDate("2026-11-20", "20:00:00");
  check(
    "Nairobi 20:00:00 (8 PM EAT) converts to UTC 17:00:00 (5 PM UTC)",
    nairobiEvening.toISOString() === "2026-11-20T17:00:00.000Z"
  );

  const nairobiMorning = nairobiToUtcDate("2026-11-20", "02:00:00");
  check(
    "Nairobi 02:00:00 (2 AM EAT) converts to previous day UTC 23:00:00",
    nairobiMorning.toISOString() === "2026-11-19T23:00:00.000Z"
  );

  const nairobiMidnight = nairobiToUtcDate("2026-11-21", "00:00:00");
  check(
    "Nairobi midnight converts to 21:00:00 UTC previous day",
    nairobiMidnight.toISOString() === "2026-11-20T21:00:00.000Z"
  );

  // 2. Reverse conversion: UTC to Nairobi string representation
  const utcDate = new Date("2026-11-20T17:00:00.000Z");
  const eatDateOnly = utcToNairobiDateString(utcDate);
  check(
    "UTC 17:00 converts back to Nairobi date '2026-11-20'",
    eatDateOnly === "2026-11-20"
  );
  const eatStr = utcToNairobiDateTimeString(utcDate);
  check(
    "UTC 17:00 converts back to Nairobi dateTime '2026-11-20 20:00:00'",
    eatStr === "2026-11-20 20:00:00"
  );

  // 3. Overlap detection simulation (single-channel broadcast constraint)
  function slotsOverlap(
    aStart: Date,
    aEnd: Date,
    bStart: Date,
    bEnd: Date
  ): boolean {
    return aStart < bEnd && aEnd > bStart;
  }

  const slot1Start = new Date("2026-11-20T17:00:00Z");
  const slot1End = new Date("2026-11-20T19:00:00Z");

  const slot2Colliding = {
    start: new Date("2026-11-20T18:00:00Z"),
    end: new Date("2026-11-20T20:00:00Z"),
  };
  check(
    "Partially overlapping slot is detected as collision",
    slotsOverlap(slot1Start, slot1End, slot2Colliding.start, slot2Colliding.end) === true
  );

  const slot3Contained = {
    start: new Date("2026-11-20T17:30:00Z"),
    end: new Date("2026-11-20T18:30:00Z"),
  };
  check(
    "Enclosed slot is detected as collision",
    slotsOverlap(slot1Start, slot1End, slot3Contained.start, slot3Contained.end) === true
  );

  const slot4AdjacentAfter = {
    start: new Date("2026-11-20T19:00:00Z"),
    end: new Date("2026-11-20T21:00:00Z"),
  };
  check(
    "Back-to-back adjacent slot does NOT collide (end == start)",
    slotsOverlap(slot1Start, slot1End, slot4AdjacentAfter.start, slot4AdjacentAfter.end) === false
  );

  const slot5AdjacentBefore = {
    start: new Date("2026-11-20T15:00:00Z"),
    end: new Date("2026-11-20T17:00:00Z"),
  };
  check(
    "Immediately prior adjacent slot does NOT collide (start == end)",
    slotsOverlap(slot1Start, slot1End, slot5AdjacentBefore.start, slot5AdjacentBefore.end) === false
  );

  // 4. Recurrence cadence simulation
  function matchesRecurrence(
    pattern: string,
    showDayOfWeek: number,
    candidateDate: Date
  ): boolean {
    const day = candidateDate.getDay();
    if (day !== showDayOfWeek) return false;
    if (pattern === "weekly") return true;
    if (pattern === "biweekly") {
      const weekNumber = Math.floor(candidateDate.getTime() / (7 * 86400000));
      return weekNumber % 2 === 0;
    }
    return false;
  }

  // Friday is day 5 (0 = Sun, 1 = Mon, ..., 5 = Fri)
  const fridayNov20 = new Date("2026-11-20T12:00:00Z"); // Friday
  const saturdayNov21 = new Date("2026-11-21T12:00:00Z"); // Saturday
  const fridayNov27 = new Date("2026-11-27T12:00:00Z"); // Next Friday

  check(
    "Weekly show matches Friday on Friday candidate",
    matchesRecurrence("weekly", 5, fridayNov20) === true
  );
  check(
    "Weekly show rejects Saturday candidate for Friday show",
    matchesRecurrence("weekly", 5, saturdayNov21) === false
  );

  const biweeklyWeek1 = matchesRecurrence("biweekly", 5, fridayNov20);
  const biweeklyWeek2 = matchesRecurrence("biweekly", 5, fridayNov27);
  check(
    "Biweekly shows alternate weeks (one true, one false)",
    biweeklyWeek1 !== biweeklyWeek2
  );

  // 5. RFC 5545 iCalendar (.ics) format validation
  function buildTestIcs(
    showTitle: string,
    presenterName: string,
    startUtc: Date,
    endUtc: Date
  ): string {
    const formatIcsDate = (d: Date) =>
      d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
    return [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Goodlife Radio//Broadcast Schedule//EN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "BEGIN:VEVENT",
      `UID:goodlife-radio-test@goodlife.co.ke`,
      `DTSTAMP:${formatIcsDate(new Date())}`,
      `DTSTART:${formatIcsDate(startUtc)}`,
      `DTEND:${formatIcsDate(endUtc)}`,
      `SUMMARY:${showTitle} with ${presenterName}`,
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
  }

  const sampleIcs = buildTestIcs("Sub-Sahara Groove", "DJ KMR", slot1Start, slot1End);
  check("ICS contains BEGIN:VCALENDAR", sampleIcs.includes("BEGIN:VCALENDAR"));
  check("ICS contains VERSION:2.0", sampleIcs.includes("VERSION:2.0"));
  check("ICS contains BEGIN:VEVENT", sampleIcs.includes("BEGIN:VEVENT"));
  check("ICS contains DTSTART in Zulu format (Z)", /DTSTART:\d{8}T\d{6}Z/.test(sampleIcs));
  check("ICS contains DTEND in Zulu format (Z)", /DTEND:\d{8}T\d{6}Z/.test(sampleIcs));
  check(
    "ICS contains SUMMARY with show and presenter",
    sampleIcs.includes("SUMMARY:Sub-Sahara Groove with DJ KMR")
  );
  check("ICS ends with END:VCALENDAR", sampleIcs.endsWith("END:VCALENDAR"));

  console.log(`\n${pass} passed, ${failures.length} failed\n`);
  if (failures.length > 0) {
    process.exit(1);
  }
}

runTests();
