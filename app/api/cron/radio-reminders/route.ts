import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { neonQuery } from "@/lib/supabase-db";
import { radioMessaging } from "@/lib/radio/messaging-provider";

export const dynamic = "force-dynamic";

function verifyCronAuth(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET?.replace(/^["']|["']$/g, "").trim();
  if (!cronSecret) return false;

  const authHeader = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  const token = authHeader || new URL(req.url).searchParams.get("token") || "";
  const incBuf = Buffer.from(token);
  const expBuf = Buffer.from(cronSecret);
  if (incBuf.length !== expBuf.length || !timingSafeEqual(incBuf, expBuf)) {
    return false;
  }
  return true;
}

/**
 * Cron Job: Radio Show Reminders & Presenter Standby Pings
 * 
 * Frequency: Every 5 or 10 minutes.
 * Guard: Bearer CRON_SECRET header or query param.
 * 
 * Action 1: Show Reminders
 * Identifies show slots starting within 15 minutes (between now + 5 min and now + 15 min).
 * Dispatches reminders to opted-in listeners via radioMessaging provider (DRY-RUN by default!).
 * 
 * Action 2: Presenter Standby Pings
 * Identifies show slots starting in ~30 minutes where the presenter has not yet connected to harbor.
 * Dispatches an internal WAHA reminder ping to the resident presenter's registered phone.
 */
export async function GET(req: NextRequest) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: "CRON_SECRET not configured on server" }, { status: 500 });
  }
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results = {
    listener_reminders_processed: 0,
    presenter_pings_processed: 0,
    errors: [] as string[],
  };

  try {
    // -------------------------------------------------------------------------
    // ACTION 1: LISTENER SHOW REMINDERS (~15 minutes before show starts)
    // -------------------------------------------------------------------------
    const upcomingSlotsRes = await neonQuery(
      `SELECT 
        ss.id as slot_id,
        ss.starts_at,
        s.id as show_id,
        s.title as show_title,
        p.dj_name
       FROM show_slots ss
       JOIN shows s ON ss.show_id = s.id
       JOIN presenters p ON COALESCE(ss.substitute_presenter_id, ss.primary_presenter_id) = p.id
       WHERE ss.starts_at >= NOW() AND ss.starts_at <= NOW() + INTERVAL '16 minutes';`
    );

    const upcomingSlots = upcomingSlotsRes?.rows || [];

    for (const slot of upcomingSlots) {
      const subscribersRes = await neonQuery(
        `SELECT r.phone, r.unsubscribe_token
         FROM radio_reminders r
         WHERE r.show_id = $1 AND r.is_active = TRUE;`,
        [slot.show_id]
      );

      const subscribers = subscribersRes?.rows || [];

      for (const sub of subscribers) {
        const timeStr = new Date(slot.starts_at).toLocaleTimeString("en-KE", {
          hour: "2-digit",
          minute: "2-digit",
          timeZone: "Africa/Nairobi",
        });

        const reminderMsg = `⚡ GOODLIFE Radio 254: "${slot.show_title}" hosted by ${slot.dj_name} is going live at ${timeStr} EAT! Tune in: https://tickets.goodlife.co.ke/radio (Reply STOP to opt out)`;

        await radioMessaging.sendMessage({
          toPhone: sub.phone,
          message: reminderMsg,
          recipientRole: "listener",
          messageType: "show_reminder",
        });

        results.listener_reminders_processed++;
      }
    }

    // -------------------------------------------------------------------------
    // ACTION 2: PRESENTER STANDBY PINGS (~30 minutes before slot, if not connected)
    // -------------------------------------------------------------------------
    const standbySlotsRes = await neonQuery(
      `SELECT 
        ss.id as slot_id,
        ss.starts_at,
        s.title as show_title,
        p.id as presenter_id,
        p.dj_name,
        p.phone as presenter_phone
       FROM show_slots ss
       JOIN shows s ON ss.show_id = s.id
       JOIN presenters p ON COALESCE(ss.substitute_presenter_id, ss.primary_presenter_id) = p.id
       WHERE ss.starts_at >= NOW() + INTERVAL '20 minutes'
         AND ss.starts_at <= NOW() + INTERVAL '35 minutes'
         AND p.phone IS NOT NULL;`
    );

    const standbySlots = standbySlotsRes?.rows || [];

    for (const slot of standbySlots) {
      // Check if presenter connected recently
      const recentConnCheck = await neonQuery(
        `SELECT id FROM radio_connection_log 
         WHERE presenter_id = $1 AND authorized = TRUE AND connected_at > NOW() - INTERVAL '30 minutes'
         LIMIT 1;`,
        [slot.presenter_id]
      );

      const hasConnected = Boolean(recentConnCheck?.rows && recentConnCheck.rows.length > 0);

      if (!hasConnected && slot.presenter_phone) {
        const timeStr = new Date(slot.starts_at).toLocaleTimeString("en-KE", {
          hour: "2-digit",
          minute: "2-digit",
          timeZone: "Africa/Nairobi",
        });

        const pingMsg = `🚨 GOODLIFE Studio Alert: Habari ${slot.dj_name}! Your live slot for "${slot.show_title}" starts in 30 minutes (${timeStr} EAT). Please launch your DJ encoder and connect to harbor: https://tickets.goodlife.co.ke/presenter/dashboard`;

        await radioMessaging.sendMessage({
          toPhone: slot.presenter_phone,
          message: pingMsg,
          recipientRole: "presenter",
          messageType: "presenter_standby_ping",
        });

        results.presenter_pings_processed++;
      }
    }

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      results,
    });
  } catch (err: any) {
    console.error("[api/cron/radio-reminders] Error:", err);
    return NextResponse.json({ error: err.message || "Cron execution failed" }, { status: 500 });
  }
}
