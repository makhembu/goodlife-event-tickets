import { NextRequest, NextResponse } from "next/server";
import { neonQuery } from "@/lib/supabase-db";

// Global in-memory / cache for last alert timestamps to enforce cooldowns
let lastOfflineAlert = 0;
let lastNoshowAlert = 0;
let lastArchiveAlert = 0;

const COOLDOWN_MS = 30 * 60 * 1000; // 30 minutes between duplicate alerts

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET?.replace(/^["']|["']$/g, "").trim();
  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET not configured on server" }, { status: 500 });
  }

  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (token !== cronSecret && request.nextUrl.searchParams.get("key") !== cronSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results: any = {
    checked_at: new Date().toISOString(),
    stream_healthy: true,
    noshow_alerts: [],
    archive_queue_healthy: true,
  };

  const now = Date.now();

  // 1. Check live stream health
  const streamUrl = process.env.NEXT_PUBLIC_RADIO_STREAM_URL || "https://live.goodlife.co.ke/stream";
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const streamRes = await fetch(streamUrl, {
      method: "HEAD",
      signal: controller.signal,
    }).catch(() => null);
    clearTimeout(timeout);

    if (!streamRes || !streamRes.ok) {
      results.stream_healthy = false;
      if (now - lastOfflineAlert > COOLDOWN_MS) {
        lastOfflineAlert = now;
        results.stream_alert_sent = true;
        sendOperatorAlert(
          `⚠️ *GOODLIFE RADIO ALERT*: Stream is unreachable (${streamUrl}). Playout may be down or disconnected.`
        ).catch(() => {});
      }
    }
  } catch {
    results.stream_healthy = false;
  }

  // 2. Check presenter noshows (slot started > 10m ago, state still scheduled/pending)
  try {
    const { rows: noshows } = await neonQuery(
      `SELECT sl.id, sl.slot_date, sl.start_time, s.title as show_title, p.name as presenter_name, p.phone
       FROM radio_show_slots sl
       JOIN radio_shows s ON sl.show_id = s.id
       JOIN radio_presenters p ON sl.presenter_id = p.id
       WHERE sl.status = 'scheduled'
         AND (sl.slot_date + sl.start_time) < (CURRENT_TIMESTAMP - INTERVAL '10 minutes')
         AND (sl.slot_date + sl.end_time) > CURRENT_TIMESTAMP
       LIMIT 5`
    );

    if (noshows && noshows.length > 0) {
      results.noshow_alerts = noshows;
      if (now - lastNoshowAlert > COOLDOWN_MS) {
        lastNoshowAlert = now;
        const msg = noshows
          .map((n: any) => `• *${n.show_title}* by ${n.presenter_name} was scheduled at ${n.start_time}`)
          .join("\n");
        sendOperatorAlert(`🚨 *GOODLIFE RADIO NOSHOW*:\n${msg}\nAuto-DJ fallback is active.`).catch(() => {});
      }
    }
  } catch (err) {
    console.error("[Radio Health Monitor] Noshow query error:", err);
  }

  // 3. Check archive queue health (items in recording/processing for > 2 hours)
  try {
    const { rows: stuckRecordings } = await neonQuery(
      `SELECT COUNT(*) as count 
       FROM radio_recordings 
       WHERE status = 'processing' 
         AND created_at < (CURRENT_TIMESTAMP - INTERVAL '2 hours')`
    ).catch(() => ({ rows: [{ count: 0 }] }));

    const stuckCount = Number(stuckRecordings[0]?.count || 0);
    if (stuckCount > 0) {
      results.archive_queue_healthy = false;
      results.stuck_recordings = stuckCount;
      if (now - lastArchiveAlert > COOLDOWN_MS) {
        lastArchiveAlert = now;
        sendOperatorAlert(
          `⚠️ *GOODLIFE RADIO ARCHIVE*: ${stuckCount} recording(s) stuck in processing queue.`
        ).catch(() => {});
      }
    }
  } catch {}

  return NextResponse.json(results);
}

async function sendOperatorAlert(message: string): Promise<void> {
  const operatorNumbers = (process.env.OPERATOR_WHATSAPP_NUMBERS || "").split(",").map((s) => s.trim()).filter(Boolean);
  const gatewayUrl = process.env.WHATSAPP_GATEWAY_URL;
  const apiKey = process.env.WHATSAPP_API_KEY;

  if (!gatewayUrl || operatorNumbers.length === 0) {
    console.warn("[Radio Health Alert] WhatsApp gateway or operator numbers not configured:", message);
    return;
  }

  for (const phone of operatorNumbers) {
    try {
      const chatId = phone.includes("@") ? phone : `${phone.replace(/\D/g, "")}@c.us`;
      await fetch(`${gatewayUrl.replace(/\/+$/, "")}/api/sendText`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(apiKey ? { "X-Api-Key": apiKey } : {}),
        },
        body: JSON.stringify({
          chatId,
          text: message,
          session: process.env.WHATSAPP_SESSION_ID || "default",
        }),
      });
    } catch (e) {
      console.error(`[Radio Health Alert] Failed to send alert to ${phone}:`, e);
    }
  }
}
