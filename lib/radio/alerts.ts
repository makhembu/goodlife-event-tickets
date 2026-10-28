/**
 * GOODLIFE Radio 254: Dynamic Alert Dispatcher via WAHA (WhatsApp HTTP API)
 * Sends real-time operational alerts for dead air, fallback rate, uploader lag, etc.
 */

import { normalizePhone } from "@/lib/phone";

export interface SendAlertOptions {
  message: string;
  recipientPhone?: string;
  severity?: "P0" | "P1" | "P2" | "INFO";
  context?: Record<string, any>;
}

export async function sendRadioAlert(options: SendAlertOptions): Promise<{ success: boolean; error?: string }> {
  const rawNumber =
    options.recipientPhone ||
    process.env.RADIO_ALERT_PHONE ||
    process.env.OPERATOR_WHATSAPP_NUMBERS?.split(",")[0] ||
    "0799560898";

  const localFormat = normalizePhone(rawNumber);
  if (!localFormat) {
    console.warn("[radio-alerts] Invalid phone number provided:", rawNumber);
    return { success: false, error: "Invalid phone number" };
  }

  // Convert 07XXXXXXXX to 2547XXXXXXXX
  const intlFormat = localFormat.startsWith("0") ? `254${localFormat.slice(1)}` : localFormat;
  const chatId = `${intlFormat}@c.us`;
  const severityTag = options.severity ? `[${options.severity}] ` : "";
  const fullText = `📻 *GOODLIFE Radio 254 Alert*\n${severityTag}${options.message}\n\n_Time: ${new Date().toLocaleString("en-KE", { timeZone: "Africa/Nairobi" })} EAT_`;

  const wahaBase = process.env.WAHA_GATEWAY_URL || "http://192.168.100.29:18000";
  const apiKey = process.env.WAHA_API_KEY || "goodlife_waha_secret_2026";

  try {
    const res = await fetch(`${wahaBase.replace(/\/+$/, "")}/api/sendText`, {
      method: "POST",
      headers: {
        "X-Api-Key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chatId,
        text: fullText,
        session: "default",
      }),
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.warn(`[radio-alerts] WAHA error HTTP ${res.status}: ${errText}`);
      return { success: false, error: `WAHA HTTP ${res.status}: ${errText}` };
    }

    const data = await res.json();
    return { success: true };
  } catch (err: any) {
    console.error("[radio-alerts] Failed to deliver alert:", err.message);
    return { success: false, error: err.message };
  }
}
