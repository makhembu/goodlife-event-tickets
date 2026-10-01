import { NextRequest, NextResponse } from "next/server";
import { fetchEventWaitlist, markWaitlistNotified, getEventById, fetchActiveEvent } from "@/lib/supabase-db";
import { sendTextMessage } from "@/lib/whatsapp";
import { requireAdmin } from "@/lib/admin-auth";

export async function POST(request: NextRequest) {
  const authError = await requireAdmin();
  if (authError) return authError;
  try {
    const { eventId, customMessage } = await request.json();

    let targetEvent = eventId ? await getEventById(Number(eventId)) : await fetchActiveEvent();
    if (!targetEvent) {
      return NextResponse.json({ error: "Target event not found" }, { status: 404 });
    }

    const waitlist = await fetchEventWaitlist(targetEvent.id);
    const unnotified = waitlist.filter((w: any) => !w.notified);

    if (unnotified.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No unnotified attendees found on the waitlist.",
        dispatched: 0
      });
    }

    const appUrl = process.env.APP_URL || "https://goodlife.smwhr.space";
    const defaultMsg = `🚨 *GOODLIFE EARLY-BIRD DROP IS LIVE!*\\n\\nTickets for *${targetEvent.title}* (${targetEvent.subtitle || ""}) have officially dropped!\\n\\nSecure your Early Bird & All-Inclusive Camping passes before they sell out:\\n👉 ${appUrl}\\n\\nSee you at ${targetEvent.venue || "the arena"}!`;
    const message = customMessage?.trim() || defaultMsg;

    // Rate-controlled batch dispatch (10 messages per batch with 2.5s delay, Scenario S7)
    const BATCH_SIZE = 10;
    const notifiedPhones: string[] = [];

    for (let i = 0; i < unnotified.length; i += BATCH_SIZE) {
      const batch = unnotified.slice(i, i + BATCH_SIZE);
      await Promise.all(
        batch.map(async (entry: any) => {
          try {
            const sent = await sendTextMessage(entry.phone_number, message);
            if (sent) {
              notifiedPhones.push(entry.phone_number);
            }
          } catch (e) {
            console.error(`Failed to dispatch waitlist notification to ${entry.phone_number}:`, e);
          }
        })
      );

      // Delay between batches to prevent socket collision
      if (i + BATCH_SIZE < unnotified.length) {
        await new Promise((r) => setTimeout(r, 2500));
      }
    }

    if (notifiedPhones.length > 0) {
      await markWaitlistNotified(targetEvent.id, notifiedPhones);
    }

    return NextResponse.json({
      success: true,
      message: `Broadcast complete! Successfully sent to ${notifiedPhones.length} attendee(s).`,
      dispatched: notifiedPhones.length,
      totalWaitlist: waitlist.length
    });
  } catch (error: any) {
    console.error("Waitlist broadcast error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
