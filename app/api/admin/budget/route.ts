import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { fetchEventBudgetSummary, updateEventBudget, fetchAllEvents } from "@/lib/supabase-db";

export async function GET(request: NextRequest) {
  const authError = await requireAdmin(request);
  if (authError) return authError;

  try {
    const { searchParams } = new URL(request.url);
    const eventIdParam = searchParams.get("eventId");

    if (eventIdParam && eventIdParam !== "all") {
      const eventId = parseInt(eventIdParam, 10);
      if (isNaN(eventId)) {
        return NextResponse.json({ error: "Invalid event ID" }, { status: 400 });
      }
      const summary = await fetchEventBudgetSummary(eventId);
      return NextResponse.json(summary || { error: "Event not found" }, { status: summary ? 200 : 404 });
    }

    // Return summaries for all active/recent events
    const allEvents = await fetchAllEvents();
    const summaries = await Promise.all(
      allEvents.map((evt) => fetchEventBudgetSummary(evt.id))
    );
    return NextResponse.json(summaries.filter(Boolean));
  } catch (err: any) {
    console.error("Budget summary fetch error:", err);
    return NextResponse.json({ error: err.message || "Failed to fetch budget" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const authError = await requireAdmin(request);
  if (authError) return authError;

  try {
    const body = await request.json().catch(() => ({}));
    const { eventId, budgetAllocated } = body;

    if (!eventId || budgetAllocated === undefined) {
      return NextResponse.json({ error: "Missing eventId or budgetAllocated" }, { status: 400 });
    }

    const numBudget = Number(budgetAllocated);
    if (isNaN(numBudget) || numBudget < 0) {
      return NextResponse.json({ error: "Budget must be a non-negative number" }, { status: 400 });
    }

    const ok = await updateEventBudget(Number(eventId), numBudget);
    if (!ok) {
      return NextResponse.json({ error: "Failed to update budget" }, { status: 500 });
    }

    const summary = await fetchEventBudgetSummary(Number(eventId));
    return NextResponse.json({ success: true, summary });
  } catch (err: any) {
    console.error("Budget update error:", err);
    return NextResponse.json({ error: err.message || "Failed to update budget" }, { status: 500 });
  }
}
