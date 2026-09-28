import { NextRequest, NextResponse } from "next/server";
import { fetchTabWithTransactions, getVendorById, getEventById, fetchActiveEvent } from "@/lib/supabase-db";
import {
  isPayheroConfigured,
  initiatePayheroStkPush,
  normalizePayheroPhone,
  payheroCallbackUrl,
} from "@/lib/payhero";
import { neonQuery } from "@/lib/supabase-db";
import { checkRateLimit } from "@/lib/rate-limit";
import { verifySelfPayToken } from "@/lib/self-pay-token";

function maskPhoneNumber(phone?: string): string {
  if (!phone) return "";
  const cleaned = phone.replace(/[^0-9]/g, "");
  if (cleaned.length < 8) return phone;
  const start = cleaned.slice(0, 2);
  const end = cleaned.slice(-4);
  return `${start}***${end}`;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params;
    const tabId = parseInt(resolvedParams.id, 10);
    if (isNaN(tabId)) {
      return NextResponse.json({ success: false, message: "Invalid tab ID" }, { status: 400 });
    }

    // Signed-link guard: only links dispatched by the vendor (with a valid HMAC
    // token) may read tab details — sequential IDs can't be probed.
    const token = new URL(request.url).searchParams.get("t");
    if (!verifySelfPayToken(tabId, token)) {
      return NextResponse.json(
        { success: false, message: "Invalid or missing self-pay link token." },
        { status: 403 }
      );
    }

    const tab = await fetchTabWithTransactions(tabId);
    if (!tab) {
      return NextResponse.json({ success: false, message: "Tab not found" }, { status: 404 });
    }

    // Lookup vendor name & details
    let vendorName = "Festival Vendor";
    let vendorLogo = "";
    if (tab.vendor_id) {
      const vendor = await getVendorById(tab.vendor_id);
      if (vendor) {
        vendorName = vendor.name;
        vendorLogo = vendor.logo_url || "";
      }
    }

    // Lookup event title
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

    // Lookup itemized order items for each transaction charge that has sale_id
    const saleIds = (tab.transactions || [])
      .map((t: any) => t.sale_id)
      .filter(Boolean);

    let saleItemsMap: Record<string, any[]> = {};
    if (saleIds.length > 0) {
      try {
        const { rows: itemRows } = await neonQuery(
          `SELECT sale_id, item_name, quantity, unit_price, modifiers, line_total
           FROM pos_sale_items
           WHERE sale_id = ANY($1::text[])`,
          [saleIds]
        );
        for (const row of itemRows) {
          if (!saleItemsMap[row.sale_id]) {
            saleItemsMap[row.sale_id] = [];
          }
          saleItemsMap[row.sale_id].push(row);
        }
      } catch (err) {
        console.warn("Could not load sale line items for tab:", err);
      }
    }

    // Sanitize transactions: hide operator IDs / internal metadata
    const sanitizedTransactions = (tab.transactions || []).map((t: any) => {
      return {
        id: t.id,
        type: t.type,
        amount: Number(t.amount),
        method: t.method || "",
        mpesa_ref: t.mpesa_ref || "",
        ordered_by: t.ordered_by || "",
        created_at: t.created_at,
        items: t.sale_id ? (saleItemsMap[t.sale_id] || []) : [],
      };
    });

    const balance = Number(tab.balance);
    const isSettled = balance <= 0 || tab.status === "settled";

    const publicTab = {
      id: tab.id,
      customer_name: tab.customer_name,
      customer_phone: maskPhoneNumber(tab.customer_phone),
      balance,
      credit_limit: Number(tab.credit_limit),
      status: tab.status,
      is_settled: isSettled,
      vendor_name: vendorName,
      vendor_logo: vendorLogo,
      event_title: eventTitle,
      created_at: tab.created_at,
      settled_at: tab.settled_at,
      transactions: sanitizedTransactions,
    };

    return NextResponse.json({
      success: true,
      tab: publicTab,
    });
  } catch (error: any) {
    console.error("Public Tab GET error:", error);
    return NextResponse.json(
      { success: false, message: error?.message || "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Rate-limit: this endpoint triggers a PAID STK push (costs the operator
    // fee-float), so anonymous callers must not be able to spam it.
    const rl = checkRateLimit(request, "tab-selfpay", { maxRequests: 3, windowMs: 60 * 1000 });
    if (!rl.allowed) return rl.response!;

    const resolvedParams = await params;
    const tabId = parseInt(resolvedParams.id, 10);
    if (isNaN(tabId)) {
      return NextResponse.json({ success: false, message: "Invalid tab ID" }, { status: 400 });
    }

    // Signed-link guard (same as GET): STK pushes can only be initiated for
    // tabs whose signed link the customer actually holds.
    const token = new URL(request.url).searchParams.get("t");
    if (!verifySelfPayToken(tabId, token)) {
      return NextResponse.json(
        { success: false, message: "Invalid or missing self-pay link token." },
        { status: 403 }
      );
    }

    const tab = await fetchTabWithTransactions(tabId);
    if (!tab) {
      return NextResponse.json({ success: false, message: "Tab not found" }, { status: 404 });
    }

    const currentBalance = Number(tab.balance);
    if (currentBalance <= 0 || tab.status === "settled") {
      return NextResponse.json(
        { success: false, message: "Tab is already clear." },
        { status: 400 }
      );
    }

    let body: any = {};
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ success: false, message: "Invalid JSON payload" }, { status: 400 });
    }

    const { phone, amount } = body || {};
    // Amount defaults to full balance if omitted
    const numAmount = amount !== undefined && amount !== null && amount !== "" 
      ? Number(amount) 
      : currentBalance;

    if (!phone) {
      return NextResponse.json(
        { success: false, message: "Phone number is required." },
        { status: 400 }
      );
    }

    if (isNaN(numAmount) || numAmount < 1 || numAmount > currentBalance) {
      return NextResponse.json(
        {
          success: false,
          message: `Payment amount must be between KES 1 and outstanding balance (KES ${currentBalance}).`,
        },
        { status: 400 }
      );
    }

    const normalizedPhone = normalizePayheroPhone(phone);
    if (!normalizedPhone || normalizedPhone.length !== 12 || !normalizedPhone.startsWith("254")) {
      return NextResponse.json(
        { success: false, message: "Invalid Kenyan phone number format. Provide a valid Safaricom number (e.g. 0712345678)." },
        { status: 400 }
      );
    }

    if (!isPayheroConfigured()) {
      return NextResponse.json(
        { success: false, message: "PayHero gateway not configured on server." },
        { status: 500 }
      );
    }

    const channelId = Number(process.env.PAYHERO_CHANNEL_ID);
    if (!channelId) {
      return NextResponse.json(
        { success: false, message: "PayHero channel ID not configured." },
        { status: 500 }
      );
    }

    const wholeAmount = Math.round(numAmount);
    const externalReference = `TABPAY_${tab.id}_${Date.now()}`;

    const stkRes = await initiatePayheroStkPush({
      customer_name: tab.customer_name || "Tab Self-Pay",
      phone_number: normalizedPhone,
      amount: wholeAmount,
      external_reference: externalReference,
      channel_id: channelId,
      provider: "m-pesa",
      network_code: "63902",
      callback_url: payheroCallbackUrl(),
    });

    if (!stkRes.ok) {
      return NextResponse.json(
        {
          success: false,
          checkout_request_id: externalReference,
          external_reference: externalReference,
          message: stkRes.error || "M-Pesa STK Push request was rejected.",
        },
        { status: 400 }
      );
    }

    const checkoutRequestId = stkRes.data?.reference || externalReference;

    return NextResponse.json({
      success: true,
      checkout_request_id: checkoutRequestId,
      external_reference: externalReference,
      message: "STK push initiated successfully.",
    });
  } catch (error: any) {
    console.error("Public Tab Self-Pay POST error:", error);
    return NextResponse.json(
      { success: false, message: error?.message || "Internal server error" },
      { status: 500 }
    );
  }
}
