import { NextRequest, NextResponse } from "next/server";
import {
  fetchPaymentLogs,
  deletePaymentLog,
  deleteAllPaymentLogs,
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
    // Scoped to one event when `?eventId=` is supplied. Omitting it still
    // returns every event's rows (capped), because that is a legitimate view —
    // but the dashboard now sends the scope, so the tab is never ambiguous.
    const logs = await fetchPaymentLogs(readEventId(request));
    return NextResponse.json(logs, { headers: { "Cache-Control": "no-store" } });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const unauthorized = await requireAdmin();
  if (unauthorized) return unauthorized;

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    const all = searchParams.get("all");
    const eventId = readEventId(request);

    if (all === "true") {
      // `deleteAllPaymentLogs` used to be `DELETE FROM payment_logs` — every
      // event's audit rows — behind one native confirm() in the UI. An event
      // scope is now mandatory so "clear all" can only ever mean "clear this
      // event's".
      if (!eventId) {
        return NextResponse.json(
          {
            error:
              "Refusing to delete every event's payment logs. Select a single event first.",
          },
          { status: 400 }
        );
      }
      const ok = await deleteAllPaymentLogs(eventId);
      return NextResponse.json({ success: ok });
    }

    if (!id) {
      return NextResponse.json({ error: "Missing ?id= or ?all=true" }, { status: 400 });
    }

    const ok = await deletePaymentLog(Number(id));
    return NextResponse.json({ success: ok });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}