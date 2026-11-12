import fs from "fs";
import path from "path";
import { sanitizeSessionId } from "../lib/radio/listener-tracker";

function check(label: string, condition: boolean) {
  if (condition) {
    console.log(`PASS: ${label}`);
  } else {
    console.error(`FAIL: ${label}`);
    process.exitCode = 1;
  }
}

async function run() {
  console.log("=== Goodlife Radio 254: Real-time Listener Telemetry Verification ===");

  // 1. Sanitize Session ID
  check("sanitizeSessionId accepts valid alphanumeric ID", sanitizeSessionId("gl_m8abc_123") === "gl_m8abc_123");
  check("sanitizeSessionId strips malicious characters", sanitizeSessionId("gl_123<script>") === "gl_123script");
  check("sanitizeSessionId rejects too short", sanitizeSessionId("abc") === null);
  check("sanitizeSessionId rejects non-string", sanitizeSessionId(12345) === null);

  // 2. Heartbeat Route
  const heartbeatPath = path.join(process.cwd(), "app/api/radio/heartbeat/route.ts");
  check("Heartbeat route exists", fs.existsSync(heartbeatPath));
  const heartbeatCode = fs.readFileSync(heartbeatPath, "utf8");
  check("Heartbeat route imports listener tracker", heartbeatCode.includes("recordListenerHeartbeat"));
  check("Heartbeat route handles leave action", heartbeatCode.includes("removeListenerSession"));

  // 3. /api/radio/live Contract
  const livePath = path.join(process.cwd(), "app/api/radio/live/route.ts");
  const liveCode = fs.readFileSync(livePath, "utf8");
  check("/api/radio/live imports getActiveListenersCount", liveCode.includes("getActiveListenersCount"));
  check("/api/radio/live returns listeners_count in payload", liveCode.includes("listeners_count: activeListeners"));
  check("/api/radio/live attaches listeners to now_playing", liveCode.includes("listeners: {"));

  // 4. /api/radio/state Contract
  const statePath = path.join(process.cwd(), "app/api/radio/state/route.ts");
  const stateCode = fs.readFileSync(statePath, "utf8");
  check("/api/radio/state imports getActiveListenersCount", stateCode.includes("getActiveListenersCount"));
  check("/api/radio/state returns dynamic listeners_count", stateCode.includes("listeners_count: activeListeners"));

  // 5. Client Heartbeat in RadioContext & TransportBar
  const radioContextPath = path.join(process.cwd(), "context/RadioContext.tsx");
  const radioContextCode = fs.readFileSync(radioContextPath, "utf8");
  check("RadioContext pings /api/radio/heartbeat while streaming", radioContextCode.includes("/api/radio/heartbeat"));

  const transportBarPath = path.join(process.cwd(), "components/admin/radio/TransportBar.tsx");
  const transportBarCode = fs.readFileSync(transportBarPath, "utf8");
  check("TransportBar pings /api/radio/heartbeat while monitoring", transportBarCode.includes("/api/radio/heartbeat"));
  check("TransportBar guards 0 listeners when local monitor is playing", transportBarCode.includes("Math.max(isPlaying"));

  console.log("\nListener telemetry verification completed.");
}

run().catch((err) => {
  console.error("Test runner error:", err);
  process.exit(1);
});
