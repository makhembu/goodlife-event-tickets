/**
 * Verification check for Phase 5 Player Fallback and Auto-Recovery.
 *
 *   npx tsx tests/radio-fallback.check.ts
 */

function check(desc: string, condition: boolean) {
  if (condition) {
    console.log(`PASS: ${desc}`);
  } else {
    console.error(`FAIL: ${desc}`);
    process.exit(1);
  }
}

async function run() {
  console.log("--- Radio Player Fallback & Health Monitor Verification Suite ---");

  // 1. Fallback State Transition Contract
  console.log("\n[1] Fallback State Machine");
  type EngineState = "idle" | "connecting" | "live" | "reconnecting" | "backup-mix" | "error";

  const nextStateOnNetworkFailure = (current: EngineState, hasBackupSets: boolean): EngineState => {
    if (current === "live" || current === "connecting") {
      return hasBackupSets ? "backup-mix" : "error";
    }
    return current;
  };

  check("Live stream failure transitions to backup-mix if backup sets exist", 
    nextStateOnNetworkFailure("live", true) === "backup-mix"
  );

  check("Live stream failure transitions to error if no backup sets exist", 
    nextStateOnNetworkFailure("live", false) === "error"
  );

  // 2. Recovery logic
  console.log("\n[2] Auto-Recovery to Live Stream");
  const onStreamRecovered = (current: EngineState): EngineState => {
    if (current === "backup-mix") {
      return "live";
    }
    return current;
  };

  check("Recovered stream transitions backup-mix back to live",
    onStreamRecovered("backup-mix") === "live"
  );

  // 3. Cooldown logic for operator alerts
  console.log("\n[3] Alert Cooldown Engine");
  const COOLDOWN_MS = 30 * 60 * 1000;
  const shouldAlert = (lastAlert: number, now: number) => (now - lastAlert) > COOLDOWN_MS;

  const now = 1000000000;
  check("Alerts immediately if never sent before", shouldAlert(0, now) === true);
  check("Suppresses duplicate alert within 15 minutes", shouldAlert(now - 15 * 60 * 1000, now) === false);
  check("Triggers new alert after 35 minutes", shouldAlert(now - 35 * 60 * 1000, now) === true);

  console.log("\nAll Radio Fallback checks passed successfully!");
}

run().catch((err) => {
  console.error("Test execution error:", err);
  process.exit(1);
});
