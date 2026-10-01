import { NextRequest, NextResponse } from "next/server";
import { neonQuery, fetchActiveEvent } from "@/lib/supabase-db";

function getVendorSession(request: NextRequest) {
  const sessionCookie = request.cookies.get("goodlife_vendor_session");
  if (!sessionCookie || !sessionCookie.value) return null;
  try {
    const raw = sessionCookie.value.includes(".") ? sessionCookie.value.split(".")[0] : sessionCookie.value;
    try {
      return JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    } catch {
      return JSON.parse(atob(raw));
    }
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  try {
    const vendorSession = getVendorSession(request);
    const isAdmin = request.cookies.get("goodlife_admin_session")?.value === "true";

    if (!vendorSession && !isAdmin) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    let vendorId = vendorSession ? vendorSession.vendorId : Number(searchParams.get("vendorId"));
    let eventId = searchParams.get("eventId") ? Number(searchParams.get("eventId")) : null;

    if (!eventId) {
      const active = await fetchActiveEvent();
      eventId = active?.id || null;
    }

    if (!vendorId) {
      return NextResponse.json({ success: false, message: "Missing vendor identifier" }, { status: 400 });
    }

    // Query sales with operator information
    let salesQuery = `
      SELECT 
        s.id,
        s.vendor_id,
        s.event_id,
        s.operator_id,
        s.subtotal,
        s.total,
        s.payment_status,
        s.void_reason,
        s.notes,
        s.created_at,
        op.name AS operator_name
      FROM pos_sales s
      LEFT JOIN vendor_operators op ON s.operator_id = op.id
      WHERE s.vendor_id = $1
    `;
    const params: any[] = [vendorId];

    if (eventId) {
      params.push(eventId);
      salesQuery += ` AND s.event_id = $${params.length}`;
    }

    salesQuery += ` ORDER BY s.created_at DESC LIMIT 500`;

    const { rows: salesRows } = await neonQuery(salesQuery, params);

    if (salesRows.length === 0) {
      return NextResponse.json({
        success: true,
        sales: [],
        summary: {
          total_revenue: 0,
          total_orders: 0,
          cash_total: 0,
          mpesa_total: 0,
          tab_total: 0,
          tab_cash_collected: 0,
          tab_mpesa_collected: 0,
          tab_payments_total: 0,
          cash_in_drawer: 0,
          voided_count: 0,
          items_sold_count: 0
        }
      });
    }

    const saleIds = salesRows.map((s: any) => s.id);

    // Query items for all fetched sales
    const { rows: itemRows } = await neonQuery(
      `SELECT sale_id, item_id, item_name, quantity, unit_price, line_total 
       FROM pos_sale_items 
       WHERE sale_id = ANY($1::text[])`,
      [saleIds]
    );

    // Query payments for all fetched sales
    const { rows: paymentRows } = await neonQuery(
      `SELECT sale_id, method, amount, payer_name, payer_phone, mpesa_ref, tab_id 
       FROM pos_split_payments 
       WHERE sale_id = ANY($1::text[])`,
      [saleIds]
    );

    // Map items and payments to sales
    const itemsBySale = new Map<string, any[]>();
    itemRows.forEach((item: any) => {
      if (!itemsBySale.has(item.sale_id)) itemsBySale.set(item.sale_id, []);
      itemsBySale.get(item.sale_id)!.push({
        name: item.item_name,
        quantity: Number(item.quantity),
        price: Number(item.unit_price),
        total: Number(item.line_total)
      });
    });

    const paymentsBySale = new Map<string, any[]>();
    paymentRows.forEach((p: any) => {
      if (!paymentsBySale.has(p.sale_id)) paymentsBySale.set(p.sale_id, []);
      paymentsBySale.get(p.sale_id)!.push({
        method: p.method,
        amount: Number(p.amount),
        payer_name: p.payer_name || "",
        payer_phone: p.payer_phone || "",
        mpesa_ref: p.mpesa_ref || "",
        tab_id: p.tab_id
      });
    });

    let totalRevenue = 0;
    let completedOrders = 0;
    let cashTotal = 0;
    let mpesaTotal = 0;
    let tabTotal = 0;
    let voidedCount = 0;
    let totalItemsSold = 0;

    const enrichedSales = salesRows.map((s: any) => {
      const items = itemsBySale.get(s.id) || [];
      const payments = paymentsBySale.get(s.id) || [];
      const isCompleted = s.payment_status === "completed";
      const totalNum = Number(s.total);

      if (isCompleted) {
        totalRevenue += totalNum;
        completedOrders += 1;
        items.forEach((it: any) => {
          totalItemsSold += it.quantity;
        });
        payments.forEach((p: any) => {
          if (p.method === "cash") cashTotal += p.amount;
          else if (p.method === "mpesa") mpesaTotal += p.amount;
          else if (p.method === "tab") tabTotal += p.amount;
        });
      } else if (s.payment_status === "voided") {
        voidedCount += 1;
      }

      const itemsSummary = items.map((it: any) => `${it.quantity}x ${it.name}`).join(", ");
      const paymentSummary = payments.map((p: any) => `${p.method.toUpperCase()} (KES ${p.amount.toLocaleString()})`).join(", ");

      return {
        id: s.id,
        created_at: s.created_at,
        operator_name: s.operator_name || "Stall Operator",
        operator_id: s.operator_id,
        subtotal: Number(s.subtotal),
        total: totalNum,
        payment_status: s.payment_status || "completed",
        void_reason: s.void_reason,
        notes: s.notes,
        items,
        items_summary: itemsSummary,
        payments,
        payment_summary: paymentSummary
      };
    });

    // Query tab settlements/payments for this vendor & event
    const { rows: tabPaymentRows } = await neonQuery(
      `SELECT 
         COALESCE(SUM(CASE WHEN tt.method = 'cash' THEN tt.amount ELSE 0 END), 0) as tab_cash_collected,
         COALESCE(SUM(CASE WHEN tt.method = 'mpesa' THEN tt.amount ELSE 0 END), 0) as tab_mpesa_collected,
         COALESCE(SUM(tt.amount), 0) as tab_payments_total
       FROM tab_transactions tt
       JOIN customer_tabs ct ON ct.id = tt.tab_id
       WHERE ct.vendor_id = $1
         AND ($2::int IS NULL OR ct.event_id = $2)
         AND tt.type = 'payment'`,
      [vendorId, eventId]
    );

    const tabCashCollected = Number(tabPaymentRows[0]?.tab_cash_collected || 0);
    const tabMpesaCollected = Number(tabPaymentRows[0]?.tab_mpesa_collected || 0);
    const tabPaymentsTotal = Number(tabPaymentRows[0]?.tab_payments_total || 0);
    const cashInDrawer = cashTotal + tabCashCollected;

    return NextResponse.json({
      success: true,
      sales: enrichedSales,
      summary: {
        total_revenue: totalRevenue,
        total_orders: completedOrders,
        cash_total: cashTotal,
        mpesa_total: mpesaTotal,
        tab_total: tabTotal,
        tab_cash_collected: tabCashCollected,
        tab_mpesa_collected: tabMpesaCollected,
        tab_payments_total: tabPaymentsTotal,
        cash_in_drawer: cashInDrawer,
        voided_count: voidedCount,
        items_sold_count: totalItemsSold
      }
    });

  } catch (error: any) {
    console.error("Vendor sales API error:", error);
    return NextResponse.json({ success: false, message: error.message || "Failed to fetch sales" }, { status: 500 });
  }
}
