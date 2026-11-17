/**
 * Verification Suite for Radio Standby Audio Resolver Contract & Architecture.
 * Run: .\node_modules\.bin\tsx.cmd tests/radio-standby.check.ts
 */

import fs from "fs";
import path from "path";

let pass = 0;
const failures: string[] = [];

function check(name: string, condition: boolean, detail?: string) {
  if (condition) {
    pass++;
    console.log(`PASS: ${name}`);
  } else {
    failures.push(name);
    console.error(`FAIL: ${name}${detail ? ` - ${detail}` : ""}`);
  }
}

async function runTests() {
  console.log("Starting Radio Standby Audio Contract Verification...\n");

  const routePath = path.join(process.cwd(), "app/api/radio/standby-audio/route.ts");
  check("[Source-Check] standby-audio route exists", fs.existsSync(routePath));

  const routeCode = fs.readFileSync(routePath, "utf8");
  check("[Source-Check] standby-audio route reads default_standby_audio_url from radio_settings", routeCode.includes("default_standby_audio_url FROM radio_settings"));
  check("[Source-Check] standby-audio route checks show_slots & presenters for active standby_audio_url", routeCode.includes("p.standby_audio_url") && routeCode.includes("show_slots"));
  check("[Source-Check] standby-audio route distinguishes is_custom flag", routeCode.includes("is_custom: true") && routeCode.includes("is_custom: false"));

  const adminRoutePath = path.join(process.cwd(), "app/api/admin/radio/standby-audio/route.ts");
  check("[Source-Check] admin standby-audio route exists", fs.existsSync(adminRoutePath));
  const adminCode = fs.readFileSync(adminRoutePath, "utf8");
  check("[Source-Check] admin standby-audio route allows setting default_standby_audio_url", adminCode.includes("UPDATE radio_settings"));

  const helperScriptPath = path.join(process.cwd(), "home-server/liquidsoap/get-standby-audio.sh");
  check("[Source-Check] Liquidsoap helper script exists", fs.existsSync(helperScriptPath));
  const scriptContent = fs.readFileSync(helperScriptPath, "utf8");
  check("[Source-Check] Helper script targets /api/radio/standby-audio", scriptContent.includes("/api/radio/standby-audio"));

  console.log(`\n================================`);
  console.log(`Total checks: ${pass + failures.length}`);
  console.log(`Passed: ${pass}`);
  console.log(`Failed: ${failures.length}`);
  console.log(`================================\n`);

  if (failures.length > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Test execution threw error:", err);
  process.exit(1);
});
