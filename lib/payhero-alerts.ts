/**
 * Low-balance alerting for the PayHero service wallet (fee float).
 * PayHero deducts collection fees from this wallet — when it's empty,
 * new STK/till collections fail. This module warns operators via WhatsApp
 * so they can top up before sales start failing.
 */
import { sendOperatorText } from "@/lib/whatsapp";

// Best-effort cooldown: module state resets on serverless cold starts,
// but it prevents alert storms during warm traffic.
let lastAlertAt = 0;
const ALERT_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour

export async function alertLowPayheroWallet(balance: number, warning: string) {
  const now = Date.now();
  if (now - lastAlertAt < ALERT_COOLDOWN_MS) return;
  lastAlertAt = now;

  const message =
    `⚠️ *PAYHERO FLOAT ALERT*\n\n` +
    `${warning}\n\n` +
    `Current float: KES ${balance.toFixed(2)}\n\n` +
    `Transaction fees are deducted from this float. When it hits zero, ` +
    `customer payments FAIL.\n\n` +
    `Top up now: https://app.payhero.co.ke (Dashboard → Wallet)\n` +
    `or via API: POST /api/v2/topup { amount, phone_number }\n\n` +
    `— GOODLIFE system`;

  await sendOperatorText(message);
}

let lastAbuseAlertAt = 0;
const ABUSE_ALERT_COOLDOWN_MS = 30 * 60 * 1000; // 30 mins

export async function alertPayheroAbuseRisk(failureCount: number, timeWindowHours: number = 6) {
  const now = Date.now();
  if (now - lastAbuseAlertAt < ABUSE_ALERT_COOLDOWN_MS) return;
  lastAbuseAlertAt = now;

  const message =
    `🚨 *PAYHERO API ABUSE RISK ALERT*\n\n` +
    `High cancelled/failed STK pushes detected: *${failureCount} failures* in the last ${timeWindowHours} hours.\n\n` +
    `⚠️ PayHero policy: 50+ failed requests within 6h results in a 4-hour merchant account lockdown!\n\n` +
    `Protective client rate limiting and prompt cooldowns are currently active.\n\n` +
    `— GOODLIFE System`;

  await sendOperatorText(message).catch(() => {});
}

