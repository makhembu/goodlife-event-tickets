import { NextRequest, NextResponse } from "next/server";
import { neonQuery } from "@/lib/supabase-db";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const adminSession = request.cookies.get("goodlife_admin_session")?.value;
  if (adminSession !== "true") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const vendorId = parseInt(id, 10);
  if (isNaN(vendorId)) {
    return NextResponse.json({ error: "Invalid vendor ID" }, { status: 400 });
  }

  const { searchParams } = new URL(request.url);
  const eventParam = searchParams.get("eventId");
  const eventId = eventParam && eventParam !== "all" && eventParam !== "" ? parseInt(eventParam, 10) : null;

  try {
    // 1. Vendor Details
    const { rows: vendorRows } = await neonQuery(
      `SELECT id, name, contact_name, contact_phone, logo_url, created_at
       FROM vendors
       WHERE id = $1 AND deleted_at IS NULL
       LIMIT 1`,
      [vendorId]
    );

    if (vendorRows.length === 0) {
      return NextResponse.json({ error: "Vendor not found" }, { status: 404 });
    }
    const vendor = vendorRows[0];

    // 2. Event Assignments & Settlements
    const { rows: assignmentRows } = await neonQuery(
      `SELECT vea.*, COALESCE(e.title, 'Event #' || vea.event_id) as event_title
       FROM vendor_event_assignments vea
       LEFT JOIN events e ON vea.event_id = e.id
       WHERE vea.vendor_id = $1
       ORDER BY vea.created_at DESC`,
      [vendorId]
    );

    // 3. Stock & Inventory Items
    const { rows: stockRows } = await neonQuery(
      `SELECT id, event_id, name, category, price, stock_qty, low_stock_threshold, is_available, sort_order
       FROM vendor_items
       WHERE vendor_id = $1 AND deleted_at IS NULL
         AND ($2::int IS NULL OR event_id = $2)
       ORDER BY is_available DESC, category ASC, name ASC`,
      [vendorId, eventId]
    );

    // 4. Product Velocity / Moving Most
    const { rows: velocityRows } = await neonQuery(
      `SELECT 
        psi.item_name,
        COALESCE(vi.category, 'General') as category,
        COALESCE(vi.price, psi.unit_price) as unit_price,
        vi.stock_qty,
        SUM(psi.quantity)::int as quantity_sold,
        SUM(psi.line_total)::numeric as total_revenue
       FROM pos_sale_items psi
       JOIN pos_sales ps ON psi.sale_id = ps.id
       LEFT JOIN vendor_items vi ON psi.item_id = vi.id
       WHERE ps.vendor_id = $1 AND ps.payment_status != 'voided'
         AND ($2::int IS NULL OR ps.event_id = $2)
       GROUP BY psi.item_name, vi.category, vi.price, psi.unit_price, vi.stock_qty
       ORDER BY quantity_sold DESC, total_revenue DESC`,
      [vendorId, eventId]
    );

    // 5. Time of Sales (Chronological Sales Ledger)
    const { rows: salesRows } = await neonQuery(
      `SELECT 
        ps.id,
        ps.created_at,
        ps.event_id,
        COALESCE(e.title, 'Event #' || ps.event_id) as event_title,
        ps.subtotal,
        ps.total,
        ps.payment_status,
        ps.notes,
        COALESCE(vo.name, 'Till Operator') as operator_name,
        (
          SELECT COALESCE(json_agg(json_build_object(
            'item_name', psi.item_name,
            'quantity', psi.quantity,
            'unit_price', psi.unit_price,
            'line_total', psi.line_total
          )), '[]'::json)
          FROM pos_sale_items psi
          WHERE psi.sale_id = ps.id
        ) as items,
        (
          SELECT COALESCE(json_agg(json_build_object(
            'method', psp.method,
            'amount', psp.amount,
            'payer_name', COALESCE(NULLIF(psp.payer_name, ''), ct.customer_name, ''),
            'payer_phone', COALESCE(NULLIF(psp.payer_phone, ''), ct.customer_phone, ''),
            'mpesa_ref', psp.mpesa_ref,
            'tab_id', psp.tab_id,
            'tab_customer_name', ct.customer_name,
            'tab_customer_phone', ct.customer_phone
          )), '[]'::json)
          FROM pos_split_payments psp
          LEFT JOIN customer_tabs ct ON psp.tab_id = ct.id
          WHERE psp.sale_id = ps.id
        ) as payments
       FROM pos_sales ps
       LEFT JOIN events e ON ps.event_id = e.id
       LEFT JOIN vendor_operators vo ON ps.operator_id = vo.id
       WHERE ps.vendor_id = $1
         AND ($2::int IS NULL OR ps.event_id = $2)
       ORDER BY ps.created_at DESC
       LIMIT 300`,
      [vendorId, eventId]
    );

    // 6. Detailed Payment Transactions with Customer & Item info
    const { rows: paymentTransactions } = await neonQuery(
      `SELECT 
        psp.id,
        psp.sale_id,
        psp.method,
        psp.amount::numeric as amount,
        COALESCE(NULLIF(psp.payer_name, ''), ct.customer_name, 'Walk-in Customer') as customer_name,
        COALESCE(NULLIF(psp.payer_phone, ''), ct.customer_phone, '') as customer_phone,
        psp.mpesa_ref,
        psp.tab_id,
        ct.customer_name as tab_customer_name,
        ct.customer_phone as tab_customer_phone,
        psp.created_at,
        ps.created_at as sale_created_at,
        ps.total as sale_total,
        ps.payment_status,
        COALESCE(vo.name, 'Till Operator') as operator_name,
        (
          SELECT COALESCE(json_agg(json_build_object(
            'item_name', psi.item_name,
            'quantity', psi.quantity,
            'unit_price', psi.unit_price,
            'line_total', psi.line_total
          )), '[]'::json)
          FROM pos_sale_items psi
          WHERE psi.sale_id = ps.id
        ) as items
       FROM pos_split_payments psp
       JOIN pos_sales ps ON psp.sale_id = ps.id
       LEFT JOIN customer_tabs ct ON psp.tab_id = ct.id
       LEFT JOIN vendor_operators vo ON ps.operator_id = vo.id
       WHERE ps.vendor_id = $1 AND ps.payment_status != 'voided'
         AND ($2::int IS NULL OR ps.event_id = $2)
       ORDER BY psp.created_at DESC`,
      [vendorId, eventId]
    );

    // 7. Operators
    const { rows: operatorRows } = await neonQuery(
      `SELECT id, name, pin, role, is_active FROM vendor_operators WHERE vendor_id = $1 ORDER BY name ASC`,
      [vendorId]
    );

    // Compute Summary KPIs
    const totalGross = salesRows
      .filter((s: any) => s.payment_status !== "voided")
      .reduce((sum: number, s: any) => sum + Number(s.total || 0), 0);

    const orderCount = salesRows.filter((s: any) => s.payment_status !== "voided").length;
    const avgOrderValue = orderCount > 0 ? Math.round(totalGross / orderCount) : 0;

    // Commission rate resolution
    let commissionRate = 10.0;
    let settledAmount = 0;
    if (eventId) {
      const match = assignmentRows.find((a: any) => a.event_id === eventId);
      if (match) {
        commissionRate = Number(match.commission_rate) || 10.0;
        settledAmount = Number(match.settled_amount) || 0;
      }
    } else if (assignmentRows.length > 0) {
      commissionRate = Number(assignmentRows[0].commission_rate) || 10.0;
      settledAmount = assignmentRows.reduce((sum: number, a: any) => sum + Number(a.settled_amount || 0), 0);
    }

    const resolvedVendor = {
      ...vendor,
      status: assignmentRows[0]?.status || "active",
      default_commission_rate: commissionRate
    };

    const commissionOwed = Math.round((totalGross * commissionRate) / 100);
    const outstandingDue = Math.max(0, commissionOwed - settledAmount);
    const netPayout = Math.max(0, totalGross - commissionOwed);

    // Add percentage of sales to velocity rows
    const bestsellers = velocityRows.map((item: any) => ({
      ...item,
      quantity_sold: Number(item.quantity_sold),
      total_revenue: Number(item.total_revenue),
      unit_price: Number(item.unit_price),
      percentage_of_sales: totalGross > 0 ? Math.round((Number(item.total_revenue) / totalGross) * 100) : 0
    }));

    // Build Customer Intelligence Directory
    const customerMap = new Map<string, any>();

    for (const pt of paymentTransactions) {
      const isWalkIn = pt.customer_name === "Walk-in Customer" && !pt.customer_phone;
      const key = isWalkIn ? "walk-in" : (pt.customer_phone || pt.customer_name).toLowerCase().trim();

      if (!customerMap.has(key)) {
        customerMap.set(key, {
          name: isWalkIn ? "Walk-in Customers" : pt.customer_name,
          phone: pt.customer_phone || "",
          isWalkIn,
          totalSpent: 0,
          orderCount: 0,
          salesIds: new Set<string>(),
          itemsBought: new Map<string, { name: string; quantity: number; revenue: number }>(),
          paymentMethods: new Set<string>(),
          lastOrderAt: pt.created_at,
          transactions: []
        });
      }

      const c = customerMap.get(key);
      c.totalSpent += Number(pt.amount || 0);
      c.paymentMethods.add(pt.method);
      if (pt.sale_id && !c.salesIds.has(pt.sale_id)) {
        c.salesIds.add(pt.sale_id);
        c.orderCount++;
      }
      if (new Date(pt.created_at) > new Date(c.lastOrderAt)) {
        c.lastOrderAt = pt.created_at;
      }
      for (const it of (pt.items || [])) {
        const itemKey = (it.item_name || "").toLowerCase();
        if (!c.itemsBought.has(itemKey)) {
          c.itemsBought.set(itemKey, { name: it.item_name, quantity: 0, revenue: 0 });
        }
        const itemObj = c.itemsBought.get(itemKey);
        itemObj.quantity += Number(it.quantity || 0);
        itemObj.revenue += Number(it.line_total || 0);
      }
      c.transactions.push({
        id: pt.id,
        sale_id: pt.sale_id,
        method: pt.method,
        amount: Number(pt.amount),
        mpesa_ref: pt.mpesa_ref,
        tab_id: pt.tab_id,
        created_at: pt.created_at,
        items: pt.items
      });
    }

    const customers = Array.from(customerMap.values())
      .map(c => ({
        name: c.name,
        phone: c.phone,
        isWalkIn: c.isWalkIn,
        totalSpent: c.totalSpent,
        orderCount: c.orderCount,
        paymentMethods: Array.from(c.paymentMethods),
        lastOrderAt: c.lastOrderAt,
        itemsBought: (Array.from(c.itemsBought.values()) as any[]).sort((a: any, b: any) => b.quantity - a.quantity),
        transactions: c.transactions
      }))
      .sort((a, b) => b.totalSpent - a.totalSpent);

    // Group payment methods with their respective transactions
    const methodsGrouped = new Map<string, { total_amount: number; count: number; transactions: any[] }>();
    for (const pt of paymentTransactions) {
      const m = pt.method || "other";
      if (!methodsGrouped.has(m)) {
        methodsGrouped.set(m, { total_amount: 0, count: 0, transactions: [] });
      }
      const grp = methodsGrouped.get(m)!;
      grp.total_amount += Number(pt.amount || 0);
      grp.count++;
      grp.transactions.push({
        id: pt.id,
        sale_id: pt.sale_id,
        amount: Number(pt.amount),
        customer_name: pt.customer_name,
        customer_phone: pt.customer_phone,
        mpesa_ref: pt.mpesa_ref,
        tab_id: pt.tab_id,
        operator_name: pt.operator_name,
        created_at: pt.created_at,
        items: pt.items
      });
    }

    const paymentBreakdown = Array.from(methodsGrouped.entries()).map(([method, data]) => ({
      method,
      amount: data.total_amount,
      count: data.count,
      transactions: data.transactions
    }));

    return NextResponse.json({
      success: true,
      vendor: resolvedVendor,
      assignments: assignmentRows,
      operators: operatorRows,
      summary: {
        totalGross,
        orderCount,
        avgOrderValue,
        commissionRate,
        commissionOwed,
        settledAmount,
        outstandingDue,
        netPayout
      },
      paymentBreakdown,
      paymentTransactions,
      customers,
      bestsellers,
      stock: stockRows.map((s: any) => ({
        ...s,
        price: Number(s.price),
        stock_qty: s.stock_qty !== null ? Number(s.stock_qty) : null,
        low_stock_threshold: Number(s.low_stock_threshold || 5)
      })),
      sales: salesRows
    });
  } catch (err: any) {
    console.error("Vendor analytics API error:", err);
    return NextResponse.json({ error: err.message || "Failed to load vendor analytics" }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const adminSession = request.cookies.get("goodlife_admin_session")?.value;
  if (adminSession !== "true") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const vendorId = parseInt(id, 10);
  if (isNaN(vendorId)) {
    return NextResponse.json({ error: "Invalid vendor ID" }, { status: 400 });
  }

  try {
    const body = await request.json();
    const { contact_name, contact_phone, commission_rate, event_id } = body;

    if (contact_name !== undefined || contact_phone !== undefined) {
      await neonQuery(
        `UPDATE vendors 
         SET contact_name = COALESCE($1, contact_name),
             contact_phone = COALESCE($2, contact_phone)
         WHERE id = $3`,
        [contact_name, contact_phone, vendorId]
      );
    }

    if (commission_rate !== undefined && event_id) {
      await neonQuery(
        `UPDATE vendor_event_assignments
         SET commission_rate = $1
         WHERE vendor_id = $2 AND event_id = $3`,
        [parseFloat(commission_rate), vendorId, Number(event_id)]
      );
    }

    return NextResponse.json({ success: true, message: "Vendor profile updated successfully" });
  } catch (err: any) {
    console.error("Vendor analytics PATCH error:", err);
    return NextResponse.json({ error: err.message || "Failed to update vendor" }, { status: 500 });
  }
}
