import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { updateEventExpense, deleteEventExpense } from "@/lib/supabase-db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const authError = await requireAdmin(request);
  if (authError) return authError;

  try {
    const { id } = await context.params;
    const numId = parseInt(id, 10);
    if (isNaN(numId)) {
      return NextResponse.json({ error: "Invalid expense ID" }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    if (body.amount !== undefined) {
      body.amount = Number(body.amount);
      if (isNaN(body.amount) || body.amount < 0) {
        return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
      }
    }

    if (body.status && typeof body.status === "string") {
      body.status = body.status.trim().toLowerCase();
    }

    const updated = await updateEventExpense(numId, body);
    if (!updated) {
      return NextResponse.json({ error: "Expense not found or update failed" }, { status: 404 });
    }

    return NextResponse.json(
      { success: true, expense: updated },
      { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } }
    );
  } catch (err: any) {
    console.error("Expense update error:", err);
    return NextResponse.json({ error: err.message || "Failed to update expense" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const authError = await requireAdmin(request);
  if (authError) return authError;

  try {
    const { id } = await context.params;
    const numId = parseInt(id, 10);
    if (isNaN(numId)) {
      return NextResponse.json({ error: "Invalid expense ID" }, { status: 400 });
    }

    const success = await deleteEventExpense(numId);
    if (!success) {
      return NextResponse.json({ error: "Failed to delete expense" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("Expense deletion error:", err);
    return NextResponse.json({ error: err.message || "Failed to delete expense" }, { status: 500 });
  }
}
