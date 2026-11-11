/**
 * Verification test suite: Automated Radio Drops Cron Pipeline
 *
 * Verifies:
 * 1. Cron rejects requests without Authorization header (401)
 * 2. Cron rejects requests with wrong secret (401)
 * 3. Cron fails closed (500) if CRON_SECRET is unset
 * 4. Skips generation when station broadcast_mode is 'live'
 * 5. Skips generation when hard daily cap is reached
 * 6. Skips generation when active drop pool is sufficient
 * 7. Generates AT MOST ONE drop when below pool target
 * 8. Enforces strictly evergreen rules (replaces 200 bob / Marara Camp / Every Sunday with evergreen fallback)
 * 9. Surfaces generation engine errors without swallowing (500)
 * 10. Records last attempt & result to telemetry
 *
 * Run: .\node_modules\.bin\tsx.cmd tests/cron-radio-drops.check.ts
 */

import { executeCronRadioDrops, timingSafeEqualStr, FORBIDDEN_DROP_REGEXES } from "../lib/radio/cron-engine";
import { LastDropGeneration } from "../lib/radio/telemetry";

let passes = 0;
let fails = 0;

function check(name: string, condition: boolean, detail?: string) {
  if (condition) {
    passes++;
    console.log(`  PASS: ${name}`);
  } else {
    fails++;
    console.error(`  FAIL: ${name}${detail ? ` -> ${detail}` : ""}`);
    process.exitCode = 1;
  }
}

async function runTests() {
  console.log("=== Testing Cron Radio Drops Engine & Security Invariants ===\n");

  const TEST_SECRET = "super-secret-cron-token-xyz-123";

  // Test 1: Rejects missing Authorization header
  {
    const res = await executeCronRadioDrops(null, {
      queryDb: async () => ({ rows: [] }),
      generateDrop: async () => ({} as any),
      cronSecret: TEST_SECRET,
    });
    check("Rejects request with missing Authorization header (401)", res.statusCode === 401);
  }

  // Test 2: Rejects wrong Authorization secret
  {
    const res = await executeCronRadioDrops("Bearer wrong-password", {
      queryDb: async () => ({ rows: [] }),
      generateDrop: async () => ({} as any),
      cronSecret: TEST_SECRET,
    });
    check("Rejects request with invalid secret (401)", res.statusCode === 401);
  }

  // Test 3: Constant-time comparison rejects different length without error
  {
    const matchSame = timingSafeEqualStr("token-123", "token-123");
    const matchDiffLen = timingSafeEqualStr("token-123", "token-12345");
    const matchDiffContent = timingSafeEqualStr("token-123", "token-999");
    check("timingSafeEqualStr returns true for exact match", matchSame === true);
    check("timingSafeEqualStr returns false for different length", matchDiffLen === false);
    check("timingSafeEqualStr returns false for different content", matchDiffContent === false);
  }

  // Test 4: Fails closed when CRON_SECRET is unset
  {
    const res = await executeCronRadioDrops(`Bearer ${TEST_SECRET}`, {
      queryDb: async () => ({ rows: [] }),
      generateDrop: async () => ({} as any),
      cronSecret: undefined,
    });
    check("Fails closed (500) when CRON_SECRET is unset", res.statusCode === 500 && res.body.error?.includes("CRON_SECRET not configured"));
  }

  // Test 5: Skips generation when station mode is live
  {
    let recorded: LastDropGeneration | null = null;
    const res = await executeCronRadioDrops(`Bearer ${TEST_SECRET}`, {
      queryDb: async (sql) => {
        if (sql.includes("radio_settings")) {
          return { rows: [{ broadcast_mode: "live" }] };
        }
        return { rows: [] };
      },
      generateDrop: async () => ({} as any),
      recordTelemetry: (r) => { recorded = r; },
      cronSecret: TEST_SECRET,
    });
    check("Skips when station mode is live (200 skipped)", res.statusCode === 200 && res.body.status === "skipped" && res.body.reason === "station_mode_live");
    check("Records skipped telemetry when in live mode", recorded !== null && (recorded as any).status === "skipped");
  }

  // Test 6: Skips when daily generation cap reached
  {
    let recorded: LastDropGeneration | null = null;
    const res = await executeCronRadioDrops(`Bearer ${TEST_SECRET}`, {
      queryDb: async (sql) => {
        if (sql.includes("radio_settings")) {
          return { rows: [{ broadcast_mode: "autodj" }] };
        }
        if (sql.includes("COUNT(*)::int AS count FROM radio_drops WHERE created_at >=")) {
          return { rows: [{ count: 12 }] };
        }
        return { rows: [] };
      },
      generateDrop: async () => ({} as any),
      recordTelemetry: (r) => { recorded = r; },
      cronSecret: TEST_SECRET,
      dailyCap: 12,
    });
    check("Skips when daily cap is reached (count >= 12)", res.statusCode === 200 && res.body.status === "skipped" && res.body.reason === "daily_cap_reached");
    check("Records daily_cap_reached telemetry", recorded !== null && (recorded as any).reason === "daily_cap_reached");
  }

  // Test 7: Skips when valid unplayed pool count is sufficient
  {
    let recorded: LastDropGeneration | null = null;
    const res = await executeCronRadioDrops(`Bearer ${TEST_SECRET}`, {
      queryDb: async (sql) => {
        if (sql.includes("radio_settings")) {
          return { rows: [{ broadcast_mode: "autodj" }] };
        }
        if (sql.includes("COUNT(*)::int AS count FROM radio_drops WHERE created_at >=")) {
          return { rows: [{ count: 3 }] }; // 3 today, cap is 12
        }
        if (sql.includes("WHERE (created_at > NOW() - INTERVAL '7 days'")) {
          return { rows: [{ count: 10 }] }; // 10 in pool, target is 8
        }
        return { rows: [] };
      },
      generateDrop: async () => ({} as any),
      recordTelemetry: (r) => { recorded = r; },
      cronSecret: TEST_SECRET,
      targetPool: 8,
    });
    check("Skips when drop pool is sufficient (pool >= 8)", res.statusCode === 200 && res.body.status === "skipped" && res.body.reason === "pool_sufficient");
    check("Records pool_sufficient telemetry", recorded !== null && (recorded as any).reason === "pool_sufficient");
  }

  // Test 8: Generates AT MOST ONE drop when below pool target
  {
    let generateCalls = 0;
    let insertedRows: any[] = [];
    let recorded: LastDropGeneration | null = null;

    const res = await executeCronRadioDrops(`Bearer ${TEST_SECRET}`, {
      queryDb: async (sql, params) => {
        if (sql.includes("radio_settings")) {
          return { rows: [{ broadcast_mode: "autodj" }] };
        }
        if (sql.includes("COUNT(*)::int AS count FROM radio_drops WHERE created_at >=")) {
          return { rows: [{ count: 2 }] }; // 2 today
        }
        if (sql.includes("WHERE (created_at > NOW() - INTERVAL '7 days'")) {
          return { rows: [{ count: 5 }] }; // 5 in pool, target is 8
        }
        if (sql.includes("INSERT INTO radio_drops")) {
          insertedRows.push(params);
          return { rows: [{ id: 42 }] };
        }
        return { rows: [] };
      },
      generateDrop: async (req) => {
        generateCalls++;
        return {
          id: "drop_mock_001",
          drop_type: "station_id",
          persona_id: req.preferredPersonaId || "amina",
          persona_name: "Amina",
          tag: "[excited]",
          script: "Frequency ya 254, tuko live hapa kwenye GOODLIFE Radio! Pure vibes all day.",
          audio_url: "https://r2.goodlife.space/drops/test.mp3",
          is_generic_fallback: false,
        };
      },
      recordTelemetry: (r) => { recorded = r; },
      cronSecret: TEST_SECRET,
      targetPool: 8,
      dailyCap: 12,
    });

    check("Generates exactly ONE drop per call", generateCalls === 1);
    check("Returns status 200 with generated drop", res.statusCode === 200 && res.body.status === "generated");
    check("Persists drop to radio_drops with station_id timing_type", insertedRows.length === 1 && insertedRows[0][5] === "station_id");
    check("Records generated telemetry", recorded !== null && (recorded as any).status === "generated" && (recorded as any).db_id === 42);
  }

  // Test 9: Evergreen safety replaces hardcoded pricing/dates with evergreen fallback
  {
    const badScripts = [
      "Secure passes for 200 bob only on the site!",
      "Meet us this weekend at Marara Camp for the festival!",
      "Every Sunday we are turning up at the grounds!",
      "Tickets cost 500 bob at the gate!",
    ];

    for (const badScript of badScripts) {
      const forbiddenMatched = FORBIDDEN_DROP_REGEXES.some((rx) => rx.test(badScript));
      check(`Evergreen regex catches forbidden text: "${badScript}"`, forbiddenMatched);
    }

    let fallbackCalled = false;
    const res = await executeCronRadioDrops(`Bearer ${TEST_SECRET}`, {
      queryDb: async (sql, params) => {
        if (sql.includes("radio_settings")) return { rows: [{ broadcast_mode: "autodj" }] };
        if (sql.includes("WHERE created_at >=")) return { rows: [{ count: 0 }] };
        if (sql.includes("WHERE (created_at > NOW()")) return { rows: [{ count: 2 }] };
        if (sql.includes("INSERT INTO radio_drops")) return { rows: [{ id: 99 }] };
        return { rows: [] };
      },
      generateDrop: async () => ({
        id: "drop_bad_text",
        drop_type: "station_id",
        persona_id: "mc-cheche",
        persona_name: "MC Cheche",
        tag: "[excited]",
        script: "Tickets are going for 200 bob at Marara Camp Every Sunday, msee!",
        audio_url: "https://r2.goodlife.space/drops/test.mp3",
        is_generic_fallback: false,
      }),
      selectFallbackDrop: () => {
        fallbackCalled = true;
        return {
          script: "GOODLIFE Radio 254 — the urban sound of Nairobi.",
          tag: "[excited]",
          persona_name: "MC Cheche",
        };
      },
      cronSecret: TEST_SECRET,
    });

    check("Triggers fallback when bad strings appear in script", fallbackCalled === true);
    check("Script is replaced with evergreen reviewed drop", res.body.drop?.script === "GOODLIFE Radio 254 — the urban sound of Nairobi.");
    check("Drop is marked as fallback", res.body.drop?.is_fallback === true);
  }

  // Test 10: Surfaces engine errors cleanly without swallowing
  {
    let recorded: LastDropGeneration | null = null;
    const res = await executeCronRadioDrops(`Bearer ${TEST_SECRET}`, {
      queryDb: async (sql) => {
        if (sql.includes("radio_settings")) return { rows: [{ broadcast_mode: "autodj" }] };
        if (sql.includes("WHERE created_at >=")) return { rows: [{ count: 0 }] };
        if (sql.includes("WHERE (created_at > NOW()")) return { rows: [{ count: 0 }] };
        return { rows: [] };
      },
      generateDrop: async () => {
        throw new Error("Gemini quota exceeded (429 ResourceExhausted)");
      },
      recordTelemetry: (r) => { recorded = r; },
      cronSecret: TEST_SECRET,
    });

    check("Returns status 500 when engine throws", res.statusCode === 500);
    check("Surfaces engine error message in JSON", res.body.status === "failed" && res.body.error?.includes("Gemini quota exceeded"));
    check("Records error in telemetry", recorded !== null && (recorded as any).status === "failed" && (recorded as any).error?.includes("Gemini quota exceeded"));
  }

  console.log(`\nResults: ${passes} passed, ${fails} failed.`);
  if (fails > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Test runner crashed:", err);
  process.exit(1);
});
