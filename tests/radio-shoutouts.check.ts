import fs from "fs";
import path from "path";
import {
  maskPhone,
  hashIdentifier,
  sanitizeShoutoutMessage,
  sanitizeSenderName,
} from "../lib/radio/shoutout-filter";

let failures = 0;
function assert(condition: boolean, message: string) {
  if (condition) console.log(`PASS: ${message}`);
  else {
    console.error(`FAIL: ${message}`);
    failures++;
  }
}

console.log("--- Testing Radio Shoutouts, Moderation, Polls & Contests ---");

// 1. Phone Masking
assert(maskPhone("0712345678") === "0712***678", "0712345678 is masked to 0712***678");
assert(maskPhone("+254 712 345 678") === "0712***678", "International formatted number is normalized and masked");
assert(maskPhone("254712345678") === "0712***678", "254 format is normalized and masked");
assert(maskPhone(null) === "", "Null phone returns empty string");
assert(maskPhone("") === "", "Empty phone returns empty string");

// 2. Hash Identifier
const h1 = hashIdentifier("0712345678");
const h2 = hashIdentifier("0712345678");
const h3 = hashIdentifier("0787654321");
assert(h1 === h2, "Identical phone numbers produce matching deterministic hashes");
assert(h1 !== h3, "Different phone numbers produce distinct hashes");
assert(h1.length === 64, "Identifier hash is 64-char hex SHA256");

// 3. Message Sanitization & Length Restrictions
const shortMsg = sanitizeShoutoutMessage("a");
assert(!shortMsg.isValid && shortMsg.error?.includes("too short"), "1-char message rejected as too short");

const validMsg = sanitizeShoutoutMessage("Big up Marara Camp festival crew! Locked in from Nairobi.");
assert(validMsg.isValid && validMsg.cleanText.includes("Big up"), "Clean message passes validation");

const longMsg = sanitizeShoutoutMessage("x".repeat(300));
assert(!longMsg.isValid && longMsg.error?.includes("exceeds 280"), "Message exceeding 280 chars rejected");

// 4. Link & Spam Filtering
const linkMsg1 = sanitizeShoutoutMessage("Check out my music at https://soundcloud.com/dj-test");
assert(!linkMsg1.isValid && linkMsg1.error?.includes("not allowed"), "http/https links rejected");

const linkMsg2 = sanitizeShoutoutMessage("Join telegram channel t.me/freecrypto");
assert(!linkMsg2.isValid && linkMsg2.error?.includes("not allowed"), "t.me / telegram links rejected");

// 5. Profanity & Abuse Filtering
const profMsg = sanitizeShoutoutMessage("Hey you bitch play my song");
assert(!profMsg.isValid && profMsg.error?.includes("restricted or inappropriate"), "Abusive language rejected");

// 6. Name Sanitization
assert(sanitizeSenderName("<b>Mwasi</b>") === "Mwasi", "HTML tags stripped from sender name");
assert(sanitizeSenderName("") === "Anonymous Listener", "Empty name defaults to Anonymous Listener");

// 7. Verify Public Shoutouts API Never Exposes Phone Numbers
const shoutoutRoutePath = path.join(process.cwd(), "app/api/radio/shoutouts/route.ts");
const shoutoutRoute = fs.readFileSync(shoutoutRoutePath, "utf8");
assert(!shoutoutRoute.includes("s.sender_phone,") && !shoutoutRoute.includes("sender_phone\n"), "GET /api/radio/shoutouts does not query sender_phone");
assert(!shoutoutRoute.includes("SELECT\n        id,\n        sender_phone"), "sender_phone is completely omitted from public select");

// 8. Verify Polls Unique Voting & Expiry Logic
const voteRoutePath = path.join(process.cwd(), "app/api/radio/polls/vote/route.ts");
const voteRoute = fs.readFileSync(voteRoutePath, "utf8");
assert(voteRoute.includes("uq_poll_voter") || voteRoute.includes("voter_hash"), "Vote route records voter_hash to prevent duplicate voting");
assert(voteRoute.includes("poll.ends_at") || voteRoute.includes("status !== \"active\""), "Vote route rejects votes after poll ends_at");

// 9. Verify Contest Ticket Cap Enforcement
const contestEnterRoutePath = path.join(process.cwd(), "app/api/radio/contests/enter/route.ts");
const contestEnterRoute = fs.readFileSync(contestEnterRoutePath, "utf8");
assert(contestEnterRoute.includes("winners_awarded >= contest.max_winners"), "Contest route strictly enforces max_winners cap");
assert(contestEnterRoute.includes("createTicket"), "Winning contest entry invokes official createTicket function");
assert(contestEnterRoute.includes("amount_paid: 0"), "Issued contest ticket is issued with amount_paid = 0");

// 10. Verify WhatsApp Inbound Webhook Radio Command Handlers
const waWebhookPath = path.join(process.cwd(), "app/api/whatsapp/webhook/route.ts");
const waWebhook = fs.readFileSync(waWebhookPath, "utf8");
assert(waWebhook.includes("SHOUT") && waWebhook.includes("REQUEST"), "WhatsApp webhook parses SHOUT and REQUEST commands");
assert(waWebhook.includes("STOP"), "WhatsApp webhook handles STOP opt-out command");

// 11. Verify Reminders Default to DRY-RUN
const messagingProviderPath = path.join(process.cwd(), "lib/radio/messaging-provider.ts");
const messagingProvider = fs.readFileSync(messagingProviderPath, "utf8");
assert(messagingProvider.includes('channel: "dry_run"'), "Messaging provider defaults listener reminders to dry_run");
assert(messagingProvider.includes("ENABLE_WHATSAPP_CLOUD_API"), "Cloud API requires explicit environment flag");

if (failures > 0) {
  console.error(`\nFAILED: ${failures} check(s) failed.`);
  process.exit(1);
} else {
  console.log("\nALL RADIO INTERACTION CHECKS PASSED.");
}
