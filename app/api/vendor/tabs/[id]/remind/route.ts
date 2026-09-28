import { NextRequest, NextResponse } from "next/server";
import { fetchTabWithTransactions, getVendorById, getEventById, fetchActiveEvent } from "@/lib/supabase-db";
import { sendTabReminderWhatsApp } from "@/lib/whatsapp";
import { buildSelfPayUrl } from "@/lib/self-pay-token";

function getSession(request: NextRequest) {
  const sessionCookie = request.cookies.get("goodlife_vendor_session");
  if (!sessionCookie || !sessionCookie.value) return null;
  try {
    return JSON.parse(atob(sessionCookie.value));
  } catch {
    return null;
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    const resolvedParams = await params;
    const tabId = parseInt(resolvedParams.id, 10);
    if (isNaN(tabId)) {
      return NextResponse.json({ success: false, message: "Invalid tab ID" }, { status: 400 });
    }

    const tab = await fetchTabWithTransactions(tabId);
    if (!tab) {
      return NextResponse.json({ success: false, message: "Tab not found" }, { status: 404 });
    }

    // Ensure vendor matches
    if (tab.vendor_id && tab.vendor_id !== session.vendorId) {
      return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
    }

    const balance = Number(tab.balance);
    if (balance <= 0) {
      return NextResponse.json({
        success: false,
        message: "Tab has no outstanding balance",
      }, { status: 400 });
    }

    if (!tab.customer_phone) {
      return NextResponse.json({
        success: false,
        message: "Tab does not have a customer phone number configured.",
      }, { status: 400 });
    }

    let vendorName = session.vendorName || "Festival Vendor";
    if (tab.vendor_id) {
      const vendor = await getVendorById(tab.vendor_id);
      if (vendor?.name) {
        vendorName = vendor.name;
      }
    }

    let eventTitle = "GOODLIFE FESTIVAL";
    if (tab.event_id) {
      const evt = await getEventById(tab.event_id);
      if (evt?.title) {
        eventTitle = evt.title;
      }
    } else {
      const activeEvt = await fetchActiveEvent();
      if (activeEvt?.title) {
        eventTitle = activeEvt.title;
      }
    }

    const appUrl = (process.env.APP_URL || "").replace(/\/+$/, "");
    const payUrl = buildSelfPayUrl(appUrl, tab.id);

    const sent = await sendTabReminderWhatsApp(
      {
        customer_name: tab.customer_name || "Festival Attendee",
        customer_phone: tab.customer_phone,
        balance,
        credit_limit: Number(tab.credit_limit) || 0,
      },
      vendorName,
      eventTitle,
      payUrl
    );

    if (!sent) {
      return NextResponse.json({
        success: false,
        message: "Failed to dispatch WhatsApp reminder via gateway. Please check gateway status.",
      }, { status: 502 });
    }

    return NextResponse.json({
      success: true,
      message: "Reminder sent",
    });
  } catch (error: any) {
    console.error("Tab remind POST error:", error);
    return NextResponse.json(
      { success: false, message: error?.message || "Internal server error" },
      { status: 500 }
    );
  }
}
