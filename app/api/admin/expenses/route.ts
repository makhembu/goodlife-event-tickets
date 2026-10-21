import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { fetchEventExpenses, createEventExpense } from "@/lib/supabase-db";

export async function GET(request: NextRequest) {
  const authError = await requireAdmin(request);
  if (authError) return authError;

  try {
    const { searchParams } = new URL(request.url);
    const eventIdParam = searchParams.get("eventId");
    let eventId: number | null = null;
    if (eventIdParam && eventIdParam !== "all") {
      const parsed = parseInt(eventIdParam, 10);
      if (!isNaN(parsed)) eventId = parsed;
    }

    const expenses = await fetchEventExpenses(eventId);
    return NextResponse.json(expenses);
  } catch (err: any) {
    console.error("Expenses fetch error:", err);
    return NextResponse.json({ error: err.message || "Failed to fetch expenses" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const authError = await requireAdmin(request);
  if (authError) return authError;

  try {
    const body = await request.json().catch(() => ({}));
    const { event_id, title, category, amount, status, payment_method, recipient, receipt_url, notes, paid_at } = body;

    if (!event_id || !title || !category || amount === undefined) {
      return NextResponse.json(
        { error: "Missing required fields: event_id, title, category, and amount are required" },
        { status: 400 }
      );
    }

    const numAmount = Number(amount);
    if (isNaN(numAmount) || numAmount < 0) {
      return NextResponse.json({ error: "Amount must be a non-negative number" }, { status: 400 });
    }

    const expense = await createEventExpense({
      event_id: Number(event_id),
      title: String(title).trim(),
      category: String(category).trim(),
      amount: numAmount,
      status: status || "paid",
      payment_method: payment_method || "mpesa",
      recipient: recipient ? String(recipient).trim() : null,
      receipt_url: receipt_url ? String(receipt_url).trim() : null,
      notes: notes ? String(notes).trim() : null,
      paid_at: paid_at || null,
    });

    if (!expense) {
      return NextResponse.json({ error: "Failed to create expense" }, { status: 500 });
    }

    return NextResponse.json({ success: true, expense });
  } catch (err: any) {
    console.error("Expense creation error:", err);
    return NextResponse.json({ error: err.message || "Failed to create expense" }, { status: 500 });
  }
}
