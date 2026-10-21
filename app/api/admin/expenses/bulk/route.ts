import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import {
  bulkUpdateExpensesStatus,
  bulkUpdateExpensesCategory,
  bulkDeleteExpenses,
} from "@/lib/supabase-db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: NextRequest) {
  const authError = await requireAdmin(request);
  if (authError) return authError;

  try {
    const body = await request.json().catch(() => ({}));
    const { action, ids, status, category } = body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json(
        { error: "ids array is required and cannot be empty" },
        { status: 400 }
      );
    }

    const cleanIds = ids.map((id: any) => parseInt(id, 10)).filter((id: number) => !isNaN(id) && id > 0);
    if (cleanIds.length === 0) {
      return NextResponse.json({ error: "No valid expense IDs provided" }, { status: 400 });
    }

    let affectedCount = 0;

    if (action === "update_status") {
      if (!status || typeof status !== "string") {
        return NextResponse.json({ error: "Valid status string is required" }, { status: 400 });
      }
      affectedCount = await bulkUpdateExpensesStatus(cleanIds, status.trim().toLowerCase());
    } else if (action === "update_category") {
      if (!category || typeof category !== "string") {
        return NextResponse.json({ error: "Valid category string is required" }, { status: 400 });
      }
      affectedCount = await bulkUpdateExpensesCategory(cleanIds, category.trim());
    } else if (action === "delete") {
      affectedCount = await bulkDeleteExpenses(cleanIds);
    } else {
      return NextResponse.json(
        { error: `Invalid action '${action}'. Allowed: update_status, update_category, delete` },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { success: true, count: affectedCount },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      }
    );
  } catch (err: any) {
    console.error("Bulk expense action error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to perform bulk operation" },
      { status: 500 }
    );
  }
}
