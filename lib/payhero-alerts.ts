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
