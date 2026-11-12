import { NextRequest, NextResponse } from "next/server";
import { createHash, createHmac, timingSafeEqual } from "crypto";
import { neonQuery } from "@/lib/supabase-db";
import { sanitizeShoutoutMessage, sanitizeSenderName, hashIdentifier } from "@/lib/radio/shoutout-filter";
import { normalizePhone } from "@/lib/phone";
import { radioMessaging } from "@/lib/radio/messaging-provider";

export const dynamic = "force-dynamic";

/** Keys whose values must never reach a log line. */
const REDACTED_KEYS = new Set([
  "body", "text", "message", "content", "caption",
  "pushName", "profileName", "pushname", "profilename",
  "from", "to", "sender", "recipient", "phone", "number",
  "chatId", "session", "key", "remoteJid", "senderJid", "_data"
]);

function pseudonym(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 10);
}

function summarize(value: unknown, depth = 0): unknown {
  if (depth > 3) return "[deep]";
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return { __arrayLength: value.length };
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
      if (REDACTED_KEYS.has(key)) {
        out[key] = typeof raw === "string" && raw.length > 0 ? `[redacted:${pseudonym(raw)}]` : "[redacted]";
        continue;
      }
      out[key] = summarize(raw, depth + 1);
    }
    return out;
  }
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") return value.length > 120 ? `${value.slice(0, 120)}…` : value;
  return `[${typeof value}]`;
}

/**
 * Parses inbound message body for radio commands:
 * SHOUT <name> <message>
 * REQUEST <song> by <artist>
 * STOP (opt out of reminders)
 */
export async function POST(request: NextRequest) {
  const webhookSecret = process.env.WHATSAPP_WEBHOOK_SECRET?.replace(/^["']|["']$/g, "").trim();

  if (!webhookSecret) {
    console.error("[whatsapp/webhook] WHATSAPP_WEBHOOK_SECRET not configured on server. Failing closed.");
    return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
  }

  const hmacHeader = request.headers.get("x-webhook-hmac") || request.headers.get("x-webhook-hmac-sha256");
  const secretHeader = request.headers.get("x-webhook-secret");

  if (!hmacHeader && !secretHeader) {
    return NextResponse.json({ error: "Missing authentication" }, { status: 401 });
  }

  const rawBody = await request.text();
  let authorized = false;

  // 1. Verify HMAC
  if (hmacHeader) {
    try {
      const expectedHmac = createHmac("sha256", webhookSecret).update(rawBody).digest("hex");
      const hmacBuf = Buffer.from(hmacHeader.trim(), "hex");
      const expBuf = Buffer.from(expectedHmac, "hex");
      if (hmacBuf.length === expBuf.length && timingSafeEqual(hmacBuf, expBuf)) {
        authorized = true;
      }
    } catch {
      authorized = false;
    }
  }

  // 2. Verify Secret Header
  if (!authorized && secretHeader) {
    const secBuf = Buffer.from(secretHeader.trim());
    const expSecBuf = Buffer.from(webhookSecret);
    if (secBuf.length === expSecBuf.length && timingSafeEqual(secBuf, expSecBuf)) {
      authorized = true;
    }
  }

  if (!authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    console.warn("[whatsapp/webhook] received a non-JSON body; acknowledged and ignored");
    return NextResponse.json({ success: true, parsed: false }, { status: 200 });
  }

  try {
    console.log("[whatsapp/webhook] delivery received", summarize(payload));
  } catch {
    console.warn("[whatsapp/webhook] received a payload (could not be summarised)");
  }

  // Inbound Message Processing
  try {
    // Extract message fields across WAHA shapes (event message or message.upsert)
    const msgData = payload?.data || payload?.payload || payload;
    const fromNumber = msgData?.from || msgData?.sender || msgData?.chatId || "";
    const rawText = msgData?.body || msgData?.text || msgData?.message?.conversation || msgData?.message?.extendedTextMessage?.text || "";
    const pushName = msgData?._data?.notifyName || msgData?.pushName || "WhatsApp Listener";

    const cleanSenderPhone = normalizePhone(fromNumber);
    const trimmedText = String(rawText).trim();

    if (!cleanSenderPhone || !trimmedText) {
      return NextResponse.json({ success: true, processed: false }, { status: 200 });
    }

    const upperText = trimmedText.toUpperCase();

    // 1. Opt-Out Command: "STOP" or "UNSUBSCRIBE"
    if (upperText === "STOP" || upperText === "STOP RADIO" || upperText === "UNSUBSCRIBE") {
      const phoneHash = hashIdentifier(cleanSenderPhone);
      await neonQuery(
        `UPDATE radio_reminders SET is_active = FALSE WHERE phone_hash = $1;`,
        [phoneHash]
      );
      // Optional minimal acknowledgment
      if (process.env.ENABLE_RADIO_WHATSAPP_ACK === "true") {
        await radioMessaging.sendMessage({
          toPhone: cleanSenderPhone,
          message: "GOODLIFE Radio: You have been unsubscribed from show reminders. Reply START to rejoin.",
          recipientRole: "listener",
          messageType: "show_reminder",
        });
      }
      return NextResponse.json({ success: true, action: "unsubscribed" }, { status: 200 });
    }

    // 2. Radio Inbound: "SHOUT ..." or "REQUEST ..."
    const isShout = upperText.startsWith("SHOUT");
    const isRequest = upperText.startsWith("REQUEST");

    if (isShout || isRequest) {
      let messageContent = trimmedText.replace(/^(SHOUT|REQUEST)[:\s]*/i, "").trim();
      let trackRequest: string | null = null;

      if (isRequest) {
        trackRequest = messageContent;
        messageContent = `Requested: ${messageContent}`;
      }

      // Check validation
      const validation = sanitizeShoutoutMessage(messageContent);
      if (!validation.isValid) {
        console.warn(`[whatsapp/webhook] Rejected radio message from ${pseudonym(cleanSenderPhone)}: ${validation.error}`);
        return NextResponse.json({ success: true, rejected: validation.error }, { status: 200 });
      }

      const senderHash = hashIdentifier(cleanSenderPhone);

      // Attach to live slot if active
      let currentSlotId: number | null = null;
      try {
        const slotRes = await neonQuery(
          `SELECT id FROM show_slots 
           WHERE starts_at <= NOW() AND ends_at >= NOW()
           ORDER BY starts_at DESC LIMIT 1;`
        );
        if (slotRes?.rows && slotRes.rows.length > 0) {
          currentSlotId = slotRes.rows[0].id;
        }
      } catch {
        currentSlotId = null;
      }

      // Insert shoutout
      await neonQuery(
        `INSERT INTO radio_shoutouts 
          (slot_id, sender_name, sender_phone, sender_hash, message, request_track, source, status, is_featured)
         VALUES ($1, $2, $3, $4, $5, $6, 'whatsapp', 'pending', FALSE);`,
        [
          currentSlotId,
          sanitizeSenderName(pushName),
          cleanSenderPhone,
          senderHash,
          validation.cleanText,
          trackRequest,
        ]
      );

      // Send minimal short reply (if enabled)
      if (process.env.ENABLE_RADIO_WHATSAPP_ACK === "true") {
        await radioMessaging.sendMessage({
          toPhone: cleanSenderPhone,
          message: "Asante! Your message was received by GOODLIFE Radio 254 and queued for the DJ.",
          recipientRole: "listener",
          messageType: "shoutout_ack",
        });
      }

      return NextResponse.json({ success: true, queued: true }, { status: 200 });
    }
  } catch (err: any) {
    console.error("[whatsapp/webhook] Inbound message parsing error:", err.message);
  }

  // Always return 200 to prevent gateway retries
  return NextResponse.json({ success: true, parsed: true, dispatched: false }, { status: 200 });
}
