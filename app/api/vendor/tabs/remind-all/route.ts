import { NextRequest, NextResponse } from "next/server";
import { fetchTabsForVendor, fetchActiveEvent, getVendorById, getEventById } from "@/lib/supabase-db";
import { sendTabReminderWhatsApp } from "@/lib/whatsapp";
import { buildSelfPayUrl } from "@/lib/self-pay-token";

function getSession(request: NextRequest) {
  const sessionCookie = request.cookies.get("goodlife_vendor_session");
  if (!sessionCookie || !sessionCookie.value) return null;
  try {
    const raw = sessionCookie.value.includes(".") ? sessionCookie.value.split(".")[0] : sessionCookie.value;
    try {
      return JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    } catch {
      return JSON.parse(atob(raw));
    }
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    let eventId = searchParams.get("eventId") ? parseInt(searchParams.get("eventId")!, 10) : null;

    let activeEvent = null;
    if (!eventId) {
      activeEvent = await fetchActiveEvent();
      if (!activeEvent) {
        return NextResponse.json({ success: false, message: "No active event found" }, { status: 404 });
      }
      eventId = activeEvent.id;
    } else {
      activeEvent = await getEventById(eventId);
    }

    const eventTitle = activeEvent?.title || "GOODLIFE FESTIVAL";

    const tabs = await fetchTabsForVendor(session.vendorId, eventId);
    
    // Filter active tabs for this vendor with balance > 0
    const eligibleTabs = (tabs || []).filter((tab: any) => {
      const bal = Number(tab.balance);
      const isClosed = tab.status === "settled" || tab.status === "written_off";
      return !isClosed && bal > 0;
    });

    if (eligibleTabs.length === 0) {
      return NextResponse.json({
        success: true,
        count: 0,
        total: 0,
        message: "No active tabs with outstanding balances found.",
      });
    }

    let vendorName = session.vendorName || "Festival Vendor";
    const vendor = await getVendorById(session.vendorId);
    if (vendor?.name) {
      vendorName = vendor.name;
    }

    const appUrl = (process.env.APP_URL || "").replace(/\/+$/, "");

    let dispatchedCount = 0;
    const errors: string[] = [];

    // Batch dispatch reminders sequentially or with delay so failures don't halt others
    for (const tab of eligibleTabs) {
      try {
        if (!tab.customer_phone || tab.customer_phone.trim().length < 9) {
          errors.push(`Tab #${tab.id} has no valid customer phone`);
          continue;
        }

        const bal = Number(tab.balance);
        const payUrl = buildSelfPayUrl(appUrl, tab.id);

        const sent = await sendTabReminderWhatsApp(
          {
            customer_name: tab.customer_name || "Festival Attendee",
            customer_phone: tab.customer_phone,
            balance: bal,
            credit_limit: Number(tab.credit_limit) || 0,
          },
          vendorName,
          eventTitle,
          payUrl
        );

        if (sent) {
          dispatchedCount++;
        } else {
          errors.push(`Tab #${tab.id} (${tab.customer_name}) gateway dispatch failed`);
        }
      } catch (err: any) {
        errors.push(`Tab #${tab.id}: ${err?.message || "Send error"}`);
      }
    }

    return NextResponse.json({
      success: true,
      count: dispatchedCount,
      total: eligibleTabs.length,
      message: `Dispatched WhatsApp reminders to ${dispatchedCount} of ${eligibleTabs.length} tabs.`,
      failedTabs: errors.length > 0 ? errors : undefined,
    });
  } catch (error: any) {
    console.error("Vendor tabs remind-all POST error:", error);
    return NextResponse.json(
      { success: false, message: error?.message || "Internal server error" },
      { status: 500 }
    );
  }
}
