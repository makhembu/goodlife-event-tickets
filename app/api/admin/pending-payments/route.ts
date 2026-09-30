import { NextRequest, NextResponse } from "next/server";
import {
  fetchAllPendingPayments,
  resolvePendingPayment,
  deletePendingPayment,
  clearAllPendingPayments,
} from "@/lib/supabase-db";
import { requireAdmin } from "@/lib/admin-auth";

function readEventId(request: NextRequest): number | null {
  const parsed = Number.parseInt(new URL(request.url).searchParams.get("eventId") ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export async function GET(request: NextRequest) {
  const unauthorized = await requireAdmin();
  if (unauthorized) return unauthorized;

  try {
    const payments = await fetchAllPendingPayments(readEventId(request));
    return NextResponse.json(payments, { headers: { "Cache-Control": "no-store" } });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const unauthorized = await requireAdmin();
  if (unauthorized) return unauthorized;

  try {
    const body = await request.json().catch(() => ({}));
    const { checkout_request_id, mpesa_receipt, amount_paid } = body;

    if (!checkout_request_id || !mpesa_receipt || !amount_paid) {
      return NextResponse.json(
        { error: "Missing required fields: checkout_request_id, mpesa_receipt, amount_paid" },
        { status: 400 }
      );
    }

    // This mints real tickets. The row carries its own event_id, so the
    // fulfilment is event-correct regardless of what the dashboard selector
    // happens to say — but if a scope was supplied, verify it matches rather
    // than silently issuing tickets against a different event than the
    // operator believes.
    const expectedEventId = readEventId(request);
    if (expectedEventId) {
      const all = await fetchAllPendingPayments(expectedEventId, 1);
      const match = all.some((p) => p.checkout_request_id === checkout_request_id);
      if (!match) {
        return NextResponse.json(
          {
            error:
              "That pending payment does not belong to the selected event. Switch events or clear the filter.",
          },
          { status: 400 }
        );
      }
    }

    const result = await resolvePendingPayment(checkout_request_id, mpesa_receipt, amount_paid);
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const unauthorized = await requireAdmin();
  if (unauthorized) return unauthorized;

  try {
    const { searchParams } = new URL(request.url);
    const checkoutRequestId = searchParams.get("checkout_request_id");
    const all = searchParams.get("all");
    const eventId = readEventId(request);

    if (all === "true") {
      // Was `DELETE FROM pending_payments` — every event's unresolved payments,
      // behind one native confirm(). Scope is now mandatory.
      if (!eventId) {
        return NextResponse.json(
          {
            error:
              "Refusing to clear every event's pending payments. Select a single event first.",
          },
          { status: 400 }
        );
      }
      const ok = await clearAllPendingPayments(eventId);
      return NextResponse.json({ success: ok });
    }

    if (!checkoutRequestId) {
      return NextResponse.json(
        { error: "Missing ?checkout_request_id= or ?all=true" },
        { status: 400 }
      );
    }

    const ok = await deletePendingPayment(checkoutRequestId);
    return NextResponse.json({ success: ok });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}