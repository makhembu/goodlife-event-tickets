import { NextRequest, NextResponse } from "next/server";
import { fetchSaleById, voidSale } from "@/lib/supabase-db";
import { requireAdmin } from "@/lib/admin-auth";

/**
 * Admin-side "delete" for a POS sale.
 *
 * This is deliberately a void, not a row deletion: the sale is removed from
 * every total, stock is restocked, tab balances and commission are reversed,
 * but the audit row survives with who/when/why. A hard DELETE would erase the
 * only record of money that already moved and leave every aggregate wrong.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ saleId: string }> }
) {
  const authError = await requireAdmin();
  if (authError) return authError;

  const { saleId } = await context.params;
  if (!saleId) {
    return NextResponse.json({ error: "Missing sale ID" }, { status: 400 });
  }

  try {
    const sale = await fetchSaleById(saleId);
    if (!sale) {
      return NextResponse.json({ error: "Sale not found" }, { status: 404 });
    }
    if (sale.payment_status === "voided") {
      return NextResponse.json({ error: "Sale is already voided" }, { status: 409 });
    }

    const body = await request.json().catch(() => ({}));
    const reason = String(body?.reason || "").trim().slice(0, 500);
    if (!reason) {
      return NextResponse.json(
        { error: "A reason is required so the audit trail explains the deletion" },
        { status: 400 }
      );
    }

    // `voided_by` references vendor_operators, so an admin action is recorded
    // as NULL rather than inventing an operator id.
    const voided = await voidSale(saleId, null, reason);
    if (!voided) {
      return NextResponse.json({ error: "Could not void the sale" }, { status: 500 });
    }

    return NextResponse.json({ success: true, saleId, reason });
  } catch (err: any) {
    console.error("Admin void sale error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to void sale" },
      { status: 500 }
    );
  }
}
