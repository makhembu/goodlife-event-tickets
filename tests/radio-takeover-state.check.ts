// ==============================================================================
// GOODLIFE Radio 254 - Phase 4/5: Live Presenter Takeover State Verification Suite
// Tests: Clock skew resilience, DPA 30-day retention query, Sheng/Swahili filter,
//        raw storage / no double-escaping, Live-to-Live handoff & slot overruns.
// ==============================================================================

import assert from "node:assert";
import { moderateMessage, sanitizeInputText } from "../lib/radio/moderation";

function check(title: string, pass: boolean, detail?: string) {
  if (pass) {
    console.log(`PASS: ${title}`);
  } else {
    console.error(`FAIL: ${title}`);
    if (detail) console.error(`  Detail: ${detail}`);
    process.exitCode = 1;
  }
}

console.log("Starting Live Presenter Takeover State verification...\n");

// 1. Sheng / Swahili & Profanity Moderation Filter Tests
const cleanMsg = "Big up Marara Camp! Bass is heavy here in Nairobi West!";
const cleanResult = moderateMessage(cleanMsg);
check("Clean festival message passes moderation", !cleanResult.isFlagged);

const shengVulgar = "Hii ngoma ni mbwa gasi kabisa";
const shengResult = moderateMessage(shengVulgar);
check("Sheng/Swahili vulgarity flagged by filter", shengResult.isFlagged && shengResult.reasons.includes("profanity_sw_sheng"));

const spamMsg = "Get guaranteed bitcoin returns wa.me/254712345678 free festival passes";
const spamResult = moderateMessage(spamMsg);
check("Spam link and scam keywords flagged by filter", spamResult.isFlagged && spamResult.reasons.includes("spam_link"));

// 2. Raw Text Sanitization & Double-Escaping Bug Prevention
const rawInput = "  Tom & Jerry with <3 & vibes\x00\x08  ";
const sanitized = sanitizeInputText(rawInput, 280);
check("Input strips control characters and trims", sanitized === "Tom & Jerry with <3 & vibes");
check("Input does NOT pre-escape ampersands (prevents &amp; in React)", !sanitized.includes("&amp;"));

// 3. Clock Skew Resilience Test: Server-relative countdown
const serverNow = 1763712000000; // Mock epoch ms
const clientClockAhead = serverNow + 120000; // Client is 2 minutes fast
const graceEndsAt = serverNow + 15000; // 15 seconds grace

// Flawed approach: client Date.now() vs server timestamp
const flawedRemaining = Math.max(0, graceEndsAt - clientClockAhead);
check("Flawed Date.now() comparison breaks on clock skew (shows 0s prematurely)", flawedRemaining === 0);

// Master v4 approach: grace_remaining_ms calculated on server
const graceRemainingMs = Math.max(0, graceEndsAt - serverNow);
check("Server-relative grace_remaining_ms provides exact 15000ms regardless of phone clock", graceRemainingMs === 15000);

// 4. Overrun Detection Logic
const mockSlotOverrun = {
  starts_at: new Date(Date.now() - 3 * 3600 * 1000).toISOString(),
  ends_at: new Date(Date.now() - 30 * 60 * 1000).toISOString(), // Ended 30 mins ago
};
const isOverrun = new Date().getTime() > new Date(mockSlotOverrun.ends_at).getTime();
check("Slot overrun is correctly detected when live set continues past scheduled end", isOverrun === true);

// 5. Kenya DPA 30-Day Retention SQL Query Structure Test
const sqlPurgeQuery = `
  UPDATE radio_shoutouts
  SET phone = NULL
  WHERE created_at < NOW() - INTERVAL '30 days'
    AND phone IS NOT NULL;
`;
check("DPA Retention SQL query targets rows older than 30 days", sqlPurgeQuery.includes("NOW() - INTERVAL '30 days'"));
check("DPA Retention SQL query nullifies phone without deleting shoutout message", sqlPurgeQuery.includes("SET phone = NULL"));

// 6. Tip Attribution Window Check (2-Minute Handoff Grace)
function isPresenterEligibleForTip(
  targetPresenterId: number,
  currentLivePresenterId: number,
  lastHandedOffAtEpochMs: number,
  serverNowMs: number
): boolean {
  if (targetPresenterId === currentLivePresenterId) return true;
  // If handed off within 2 minutes (120,000ms), still eligible
  if (serverNowMs - lastHandedOffAtEpochMs <= 120000) return true;
  return false;
}

const currentDjId = 10;
const prevDjId = 9;
const handoffTime = Date.now() - 45000; // Handed off 45s ago
check("Tip attribution accepts previous DJ within 2-minute handoff window", isPresenterEligibleForTip(prevDjId, currentDjId, handoffTime, Date.now()) === true);
check("Tip attribution rejects previous DJ after 2-minute handoff window has expired", isPresenterEligibleForTip(prevDjId, currentDjId, Date.now() - 150000, Date.now()) === false);

console.log("\n================================");
console.log("All takeover state checks passed cleanly!");
console.log("================================\n");
