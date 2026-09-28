import { NextRequest, NextResponse } from "next/server";
import { createPendingPayment, fetchTicketTiers, fetchActiveEvent } from "@/lib/supabase-db";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  isPayheroConfigured,
  initiatePayheroStkPush,
  normalizePayheroPhone,
  payheroCallbackUrl,
  getPayheroServiceWallet,
} from "@/lib/payhero";
import { alertLowPayheroWallet } from "@/lib/payhero-alerts";

export async function POST(request: NextRequest) {
  const rl = checkRateLimit(request, "payhero-init", { maxRequests: 6, windowMs: 60 * 1000 });
  if (!rl.allowed) return rl.response!;

  try {
    const { phone_number, ticket_type, buyer_name, quantity = 1, whatsapp_number = "", event_id } =
      await request.json();

    if (!phone_number || !ticket_type || !buyer_name) {
      return NextResponse.json(
        { error: "Phone number, ticket type, and buyer name are required." },
        { status: 400 }
      );
    }

    if (!isPayheroConfigured()) {
      return NextResponse.json(
        { error: "PayHero not configured — missing PAYHERO credentials." },
        { status: 500 }
      );
    }

    // Fee-float guard: PayHero deducts collection fees from the service wallet.
    // Empty float = payments fail. Block early with a clear message; warn below threshold.
    // If the balance check itself errors, proceed — monitoring must never block sales.
    const minBalance = Number(process.env.PAYHERO_MIN_BALANCE || 50);
    const wallet = await getPayheroServiceWallet();
    if (wallet.ok && wallet.balance !== null) {
      if (wallet.balance <= 0) {
        alertLowPayheroWallet(
          wallet.balance,
          "Fee float is EMPTY — customer payments will fail right now."
        ).catch(() => {});
        return NextResponse.json(
          {
            error:
              "Mobile money payments are temporarily unavailable. Please use the manual till option below or contact support.",
          },
          { status: 503 }
        );
      }
      if (wallet.balance < minBalance) {
        alertLowPayheroWallet(wallet.balance, "Fee float is running low.").catch(() => {});
      }
    }

    let targetEvent: any = null;
    if (event_id) {
      const { getEventById } = await import("@/lib/supabase-db");
      targetEvent = await getEventById(Number(event_id));
    }
    if (!targetEvent) {
      targetEvent = await fetchActiveEvent();
    }

    // A closed event must not be able to take money. The date window alone is
    // not sufficient: GOODLIFE XP is status='closed' with no sales_close_date,
    // so it satisfied every date check and would have issued live STK pushes
    // against a finished event to anyone who knew its id.
    const isSellable = (e: any) =>
      !!e && (e.status === "live" || e.status === "scheduled") && e.is_active === true;

    if (!isSellable(targetEvent)) {
      return NextResponse.json(
        { error: "Ticket sales are not open for this event." },
        { status: 400 }
      );
    }
    // Fail closed: never fall back to a hardcoded event id, which would sell
    // tickets for whatever happens to live at id 1.
    const eventId = targetEvent.id;

    // Check sales open/close dates (Scenario S11)
    const now = new Date();
    if (targetEvent?.sales_open_date && now < new Date(targetEvent.sales_open_date)) {
      return NextResponse.json(
        { error: "Ticket sales have not opened yet for this event." },
        { status: 400 }
      );
    }
    if (targetEvent?.sales_close_date && now > new Date(targetEvent.sales_close_date)) {
      return NextResponse.json(
        { error: "Online ticket sales have closed. Gate tickets available at entrance." },
        { status: 400 }
      );
    }

    const allTiers = await fetchTicketTiers(eventId);
    const matchedTier = allTiers.find((t) => t.id === ticket_type || t.name.toLowerCase() === ticket_type.toLowerCase());
    if (!matchedTier) {
      return NextResponse.json({ error: "Invalid ticket type selected." }, { status: 400 });
    }

    // Time window / capacity guard
    if (matchedTier.available_from && now < new Date(matchedTier.available_from)) {
      return NextResponse.json({ error: "This ticket tier is not yet available for purchase." }, { status: 400 });
    }
    if (matchedTier.available_until && now > new Date(matchedTier.available_until)) {
      return NextResponse.json({ error: "This ticket tier sale window has closed." }, { status: 400 });
    }
    if (matchedTier.max_quantity != null && (matchedTier.sold_count || 0) >= matchedTier.max_quantity) {
      return NextResponse.json({ error: "This ticket tier is sold out." }, { status: 400 });
    }
    const cost = matchedTier.price * Number(quantity);
    // PayHero expects whole KES shillings
    const amount = Math.round(cost);

    // Our reference — echoed back on the webhook as external_reference
    const reference = "GL-" + Math.random().toString(36).substring(2, 12).toUpperCase();

    const mpesaPhone = normalizePayheroPhone(phone_number);

    await createPendingPayment({
      checkout_request_id: reference,
      phone_number,
      ticket_type,
      quantity: Number(quantity),
      buyer_name,
      amount: cost,
      whatsapp_number: whatsapp_number || "",
      event_id: eventId,
    });

    const stkRes = await initiatePayheroStkPush({
      customer_name: buyer_name,
      phone_number: mpesaPhone,
      amount,
      external_reference: reference,
      channel_id: Number(process.env.PAYHERO_CHANNEL_ID),
      provider: "m-pesa",
      network_code: "63902",
      callback_url: payheroCallbackUrl(),
    });

    if (!stkRes.ok) {
      console.error("PayHero STK push failed:", stkRes.error, stkRes.data);
      return NextResponse.json(
        { error: stkRes.error || "M-Pesa STK Push failed." },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      // PayHero reference for status polling
      reference: stkRes.data?.reference || reference,
      // Our own reference, kept for parity with the Paystack flow
      merchant_reference: reference,
      amount: cost,
      status: stkRes.data?.status || "QUEUED",
    });
  } catch (error: any) {
    console.error("PayHero initialize exception:", error);
    return NextResponse.json(
      { error: "PayHero STK Push failed: " + error.message },
      { status: 500 }
    );
  }
}
