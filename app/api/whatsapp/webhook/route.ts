import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";

/**
 * Inbound WhatsApp webhook (WAHA / n8n).
 *
 * WHY THIS LOOKS SO SMALL
 * -----------------------
 * This used to be a debug stub that dumped the whole payload to the console and
 * appended it to `process.cwd()/webhook-logs.txt`. Three problems, all real:
 *
 *  1. `fs.appendFileSync(process.cwd(), ...)` throws on Vercel. The Lambda
 *     filesystem is read-only except `/tmp`, so on every deployed environment
 *     this endpoint answered **500** — while the operator's local `next dev` run
 *     answered 200 and looked healthy. A gateway that retries a 500 will deliver
 *     the same message many times over.
 *  2. It printed raw inbound messages: customer phone numbers and the message
 *     bodies they sent. That is personal data landing in platform logs, and it
 *     was also committed (`webhook-logs.txt` had 49 lines of it).
 *  3. It answered 500 on a malformed body, which invites the retry storm above.
 *
 * WHAT IT DOES NOW
 * ----------------
 * It accepts the delivery, records a *shape* summary with the identifiers
 * redacted, and always answers 200. It deliberately does NOT yet forward to the
 * ticket dispatcher: the outbound path is `lib/whatsapp.ts`, and wiring inbound
 * replies into ticket lookup is a product decision, not a logging fix.
 *
 * NOTE this route is currently not reachable by the gateway — see AGENTS.md: the
 * n8n workflow that owns `POST /webhook/waha` is inactive, so nothing posts here
 * yet. It is kept because it is the documented target once that workflow is
 * switched on, and because a 200 here is what makes that switch safe.
 */

/** Keys whose values must never reach a log line. */
const REDACTED_KEYS = new Set([
  "body",
  "text",
  "message",
  "content",
  "caption",
  "pushName",
  "profileName",
  "pushname",
  "profilename",
  "from",
  "to",
  "sender",
  "recipient",
  "phone",
  "number",
  "chatId",
  "session",
  "key",
  "remoteJid",
  "senderJid",
  "_data",
]);

/**
 * A short, stable, non-reversible handle for an identifier so two payloads for
 * the same conversation can be correlated in logs without the log containing the
 * phone number itself.
 */
function pseudonym(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 10);
}

/**
 * Reduce an arbitrary payload to something safe to log: no message bodies, no
 * phone numbers, no session names. Arrays are collapsed to a count, and unknown
 * keys are reported by name only.
 */
function summarize(value: unknown, depth = 0): unknown {
  if (depth > 3) return "[deep]";
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) {
    return { __arrayLength: value.length };
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
      if (REDACTED_KEYS.has(key)) {
        // Keep correlation, drop the value.
        out[key] =
          typeof raw === "string" && raw.length > 0 ? `[redacted:${pseudonym(raw)}]` : "[redacted]";
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

export async function POST(request: NextRequest) {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    // A body we cannot parse is still a delivery we should acknowledge. Answering
    // 400/500 here is what turns one bad gateway payload into a retry loop.
    console.warn("[whatsapp/webhook] received a non-JSON body; acknowledged and ignored");
    return NextResponse.json({ success: true, parsed: false }, { status: 200 });
  }

  try {
    console.log("[whatsapp/webhook] delivery received", summarize(payload));
  } catch {
    // Never let logging be the reason a webhook fails.
    console.warn("[whatsapp/webhook] received a payload (could not be summarised)");
  }

  // Always 200: this endpoint is an unconnected intake stub, and a 5xx would
  // make the gateway redeliver a message we are not acting on anyway.
  return NextResponse.json({ success: true, parsed: true, dispatched: false }, { status: 200 });
}