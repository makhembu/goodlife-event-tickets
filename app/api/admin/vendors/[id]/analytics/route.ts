import { NextRequest, NextResponse } from "next/server";
import { neonQuery, fetchActiveEvent } from "@/lib/supabase-db";
import { phoneMatchKey, normalizePhone } from "@/lib/phone";

/**
 * A tab counts as "money owed" only when it is neither settled nor written
 * off AND still carries a positive balance.
 *
 * Deliberately identical to the filter in `app/vendor/tabs/page.tsx`. That
 * page and this audit both answer "who owes the festival money", and when the
 * two disagreed the audit reported KES 0 while the tabs page reported a real
 * outstanding figure — a discrepancy that looked like missing money.
 */
function isOutstandingTab(tab: any): boolean {
  return (
    tab.status !== "settled" &&
    tab.status !== "written_off" &&
    Number(tab.balance || 0) > 0
  );
}

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

    // 8. Customer Tabs for this vendor.
    //
    // Previously the audit knew a customer had *paid something on a tab*
    // (because `pos_split_payments` carried `tab_id`) but never loaded the tab
    // row itself, so it had no balance, no credit limit and no status. That is
    // the entire reason BALANCE DUE read KES 0 for a customer with an open tab:
    // there was no field to read. `LEFT JOIN customer_tabs` in query 6 only
    // supplied the *name and phone* for display, never the money.
    //
    // `$2::int IS NULL` mirrors the event filter used everywhere else in this
    // route: when the drawer is on "All Events" (no eventId) the vendor's
    // whole tab book is returned.
    const { rows: tabRows } = await neonQuery(
      `SELECT id, customer_name, customer_phone, credit_limit, balance, status,
              settlement_reason, created_at, settled_at, event_id
       FROM customer_tabs
       WHERE vendor_id = $1
         AND ($2::int IS NULL OR event_id = $2)
       ORDER BY created_at DESC`,
      [vendorId, eventId]
    );

    // 8.5 Tab Transactions (Payments & Settlements)
    const { rows: tabTxnRows } = await neonQuery(
      `SELECT tt.id, tt.tab_id, tt.sale_id, tt.type, tt.amount, tt.method, tt.mpesa_ref, tt.operator_id, tt.created_at,
              op.name as operator_name,
              ct.customer_phone, ct.customer_name
       FROM tab_transactions tt
       JOIN customer_tabs ct ON ct.id = tt.tab_id
       LEFT JOIN vendor_operators op ON op.id = tt.operator_id
       WHERE ct.vendor_id = $1
         AND ($2::int IS NULL OR ct.event_id = $2)
       ORDER BY tt.created_at DESC`,
      [vendorId, eventId]
    );

    // 9. Ticket purchases are fetched LATER (see `fetchTicketsForCustomers`), once
    // the vendor's customer book is known. Querying every ticket in the event up
    // front would pull thousands of rows the panel cannot use — see the comment
    // on that function for why scope is per-customer.

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
        commissionRate = match.commission_rate !== null && match.commission_rate !== undefined && !isNaN(parseFloat(String(match.commission_rate)))
          ? parseFloat(String(match.commission_rate))
          : 10.0;
        settledAmount = Number(match.settled_amount) || 0;
      }
    } else if (assignmentRows.length > 0) {
      commissionRate = assignmentRows[0].commission_rate !== null && assignmentRows[0].commission_rate !== undefined && !isNaN(parseFloat(String(assignmentRows[0].commission_rate)))
        ? parseFloat(String(assignmentRows[0].commission_rate))
        : 10.0;
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

    // ========================================================================
    // UNIFIED CUSTOMER DIRECTORY
    // ========================================================================
    //
    // Three systems record a purchase and none of them share an identifier:
    //
    //   POS sale  -> pos_split_payments (payer_name / payer_phone, maybe tab_id)
    //   Tab       -> customer_tabs      (customer_name / customer_phone)
    //   Ticket    -> tickets            (buyer_name / phone_number)
    //
    // The only thing they share is a human-typed phone number, which is why
    // this directory is keyed on `phoneMatchKey()` — the canonical `07XXXXXXXX`
    // form from lib/phone.ts — rather than the raw string. Previously the key
    // was the literal `payer_phone`, so one customer who paid once as
    // "0712345678" and once as "+254 712 345 678" was rendered as two separate
    // cards, each missing half the picture.
    //
    // Tabs are folded in here rather than only where they were charged, so a
    // tab that has a balance but (as of this instant) no payment row still
    // surfaces as somebody the festival is owed money by.
    const customerMap = new Map<string, any>();

    /**
     * Resolve a customer record for a phone, creating it on first sight.
     * `name`/`phone` are best-effort: the first system to claim the key wins,
     * but a later, better-quality name is allowed to replace a generic one.
     */
    const upsertCustomer = (
      phoneRaw: string | null | undefined,
      nameRaw: string | null | undefined
    ): any => {
      const phoneKey = phoneMatchKey(phoneRaw);
      // No usable phone: fall back to the name so two *named* customers with
      // unparseable numbers don't merge. A blank name still gets its own
      // anonymous bucket, because "two anonymous customers are the same
      // person" is not a conclusion this function is entitled to draw.
      const fallback = (nameRaw || "").trim().toLowerCase();
      const key = phoneKey
        ? `p:${phoneKey}`
        : `n:${fallback || `anon:${customerMap.size}`}`;

      if (!customerMap.has(key)) {
        customerMap.set(key, {
          name: (nameRaw || "").trim() || "Walk-in Customers",
          phone: phoneKey,
          phoneRaw: (phoneRaw || "").trim(),
          isWalkIn: !phoneKey,
          totalSpent: 0,
          orderCount: 0,
          salesIds: new Set<string>(),
          itemsBought: new Map<string, { name: string; quantity: number; revenue: number }>(),
          paymentMethods: new Set<string>(),
          lastOrderAt: null as string | null,
          transactions: [] as any[],
          orders: new Map<string, any>(),
          tabs: new Map<number, any>(),
          tickets: [] as any[],
          payments: [] as any[],
          total_paid: 0
        });
      }

      const c = customerMap.get(key);
      const incoming = (nameRaw || "").trim();
      // Upgrade a placeholder name once a real one is seen ("Walk-in Customers"
      // -> "Victor"), but never downgrade a real name to a placeholder.
      if (
        incoming &&
        incoming !== "Walk-in Customer" &&
        (!c.name || c.name === "Walk-in Customers")
      ) {
        c.name = incoming;
      }
      if (!c.phoneRaw && phoneRaw) {
        c.phoneRaw = String(phoneRaw).trim();
      }
      return c;
    };

    /** Fold one tab row onto whichever customer owns that phone. */
    const attachTab = (tab: any) => {
      const c = upsertCustomer(tab.customer_phone, tab.customer_name);
      const existing = c.tabs.get(Number(tab.id));
      const outstanding = isOutstandingTab(tab);
      const tabPaid = (tabTxnRows || [])
        .filter((tx: any) => Number(tx.tab_id) === Number(tab.id) && tx.type === "payment")
        .reduce((sum: number, tx: any) => sum + Number(tx.amount || 0), 0);
      const tabTotalCharged = Number(tab.balance || 0) + tabPaid;

      const enriched = {
        id: Number(tab.id),
        customer_name: tab.customer_name,
        customer_phone: tab.customer_phone,
        credit_limit: Number(tab.credit_limit || 0),
        balance: Number(tab.balance || 0),
        status: tab.status || "open",
        settlement_reason: tab.settlement_reason || null,
        created_at: tab.created_at,
        settled_at: tab.settled_at || null,
        event_id: tab.event_id,
        outstanding,
        // The amount actually collectable. `balance` alone is the wrong number
        // to act on: a settled tab retains its last balance value, so summing
        // raw balances is how an audit ends up billing someone who already paid.
        amount_due: outstanding ? Number(tab.balance || 0) : 0,
        total_paid: tabPaid,
        total_charged: tabTotalCharged
      };
      c.tabs.set(enriched.id, { ...(existing || {}), ...enriched });
      return c.tabs.get(enriched.id);
    };

    for (const tab of tabRows) {
      // Skip tabs that were opened and never used. `payTab` flips a tab to
      // 'settled' the moment its balance reaches zero, so an 'open' tab sitting
      // at zero means nothing was ever charged to it — attaching it would
      // invent a customer who never bought anything.
      const unused = tab.status === "open" && Number(tab.balance || 0) <= 0;
      if (unused) continue;
      attachTab(tab);
    }

    // Process Tab Transactions (Payments & Settlements)
    for (const tx of tabTxnRows || []) {
      if (tx.type === "payment") {
        const c = upsertCustomer(tx.customer_phone, tx.customer_name);
        const paidAmt = Number(tx.amount || 0);
        c.total_paid = (c.total_paid || 0) + paidAmt;
        c.payments.push({
          id: Number(tx.id),
          tab_id: Number(tx.tab_id),
          sale_id: tx.sale_id ? Number(tx.sale_id) : null,
          type: tx.type,
          amount: paidAmt,
          method: tx.method || "cash",
          mpesa_ref: tx.mpesa_ref || "",
          operator_id: tx.operator_id ? Number(tx.operator_id) : null,
          operator_name: tx.operator_name || "Stall Staff",
          created_at: tx.created_at,
        });
      }
    }

    for (const pt of paymentTransactions) {
      // A tab payment carries no payer_name/payer_phone of its own; the query
      // COALESCEs them from `customer_tabs`, so the tab holder and the POS payer
      // land on the same canonical phone key and therefore the same customer.
      const c = upsertCustomer(pt.customer_phone, pt.customer_name);

      c.totalSpent += Number(pt.amount || 0);
      c.paymentMethods.add(pt.method);

      const saleKey = String(pt.sale_id || `pay-${pt.id}`);
      if (pt.sale_id && !c.salesIds.has(pt.sale_id)) {
        c.salesIds.add(pt.sale_id);
        c.orderCount++;
      }
      if (!c.lastOrderAt || new Date(pt.created_at) > new Date(c.lastOrderAt)) {
        c.lastOrderAt = pt.created_at;
      }
      for (const it of (pt.items || [])) {
        const itemKey = (it.item_name || "").toLowerCase();
        if (!c.itemsBought.has(itemKey)) {
          c.itemsBought.set(itemKey, { name: it.item_name, quantity: 0, revenue: 0 });
        }
        const itemObj = c.itemsBought.get(itemKey)!;
        itemObj.quantity += Number(it.quantity || 0);
        itemObj.revenue += Number(it.line_total || 0);
      }

      const txn = {
        id: pt.id,
        sale_id: pt.sale_id,
        method: pt.method,
        amount: Number(pt.amount),
        mpesa_ref: pt.mpesa_ref,
        tab_id: pt.tab_id,
        created_at: pt.created_at,
        items: pt.items
      };
      c.transactions.push(txn);

      // Group tender rows into the ORDER they belong to.
      //
      // One sale can carry several `pos_split_payments` rows (cash + M-Pesa +
      // tab), so `transactions` is a list of *tenders*, not of purchases. The
      // docket showed `transactions[0]` — a single tender line — which is why
      // "View Docket" displayed one fraction of the most recent order instead
      // of the customer's history.
      if (!c.orders.has(saleKey)) {
        c.orders.set(saleKey, {
          sale_id: pt.sale_id,
          created_at: pt.created_at,
          sale_total: Number(pt.sale_total || 0),
          operator_name: pt.operator_name,
          items: (pt.items || []).map((it: any) => ({
            item_name: it.item_name,
            quantity: Number(it.quantity || 0),
            unit_price: Number(it.unit_price || 0),
            line_total: Number(it.line_total || 0)
          })),
          payments: [] as any[],
          total_paid: 0
        });
      }
      const order = c.orders.get(saleKey)!;
      order.total_paid += Number(pt.amount || 0);
      order.payments.push(txn);
      if (!order.created_at || new Date(pt.created_at) < new Date(order.created_at)) {
        order.created_at = pt.created_at;
      }
    }

    // Attach ticket purchases to customers already in the book.
    //
    // Scoped deliberately: a ticket purchase alone does NOT create a row in this
    // vendor's customer list. Otherwise every attendee at the festival would
    // appear in every single vendor's audit, which is noise, not intelligence.
    // Tickets ENRICH customers the vendor has actually served.
    //
    // That scoping is also a performance requirement. The obvious query —
    // "all tickets for this event" — returns the entire festival's ticket run on
    // every drawer open, of which a stall's customer book typically accounts for
    // well under 1%. So the customer's own numbers are pushed down into the
    // WHERE clause and normalized in SQL.
    const customersWithBook = Array.from(customerMap.values());
    const byName = new Map<string, any[]>();
    for (const c of customersWithBook) {
      const n = c.name.toLowerCase();
      if (!byName.has(n)) byName.set(n, []);
      byName.get(n)!.push(c);
    }

    // Canonical `07XXXXXXXX` forms of every number this vendor's customers are
    // known by. These are the only needles pushed into SQL.
    const phoneNeedles = new Set<string>();
    for (const c of customersWithBook) {
      const k = phoneMatchKey(c.phone || c.phoneRaw);
      if (k) phoneNeedles.add(k);
    }

    if (phoneNeedles.size > 0) {
      // Normalize the stored column the same way lib/phone.ts does — strip
      // formatting, drop an international access prefix (`00`), drop the
      // country code (`254`), then restore the national trunk `0` — and match
      // on the result. Doing this in SQL keeps the result set to the tickets
      // that actually belong to this vendor's customers, instead of shipping
      // the whole festival's ticket run to the browser to discard.
      const { rows: ticketRows } = await neonQuery(
        `WITH cleaned AS (
           SELECT t.id, t.buyer_name, t.phone_number, t.whatsapp_number,
                  t.ticket_type, t.amount_paid, t.purchase_time, t.is_scanned,
                  t.event_id,
                  COALESCE(e.title, 'Event #' || t.event_id) AS event_title,
                  regexp_replace(COALESCE(t.phone_number, ''), '\\D', '', 'g') AS d0
           FROM tickets t
           LEFT JOIN events e ON t.event_id = e.id
           WHERE t.deleted_at IS NULL
             AND ($2::int IS NULL OR t.event_id = $2)
         ),
         keyed AS (
           SELECT cleaned.*,
             regexp_replace(regexp_replace(d0, '^00', '', 'g'), '^254', '', 'g') AS d1
           FROM cleaned
         )
         SELECT id, buyer_name, phone_number, whatsapp_number, ticket_type,
                amount_paid, purchase_time, is_scanned, event_id, event_title,
                CASE WHEN left(d1, 1) = '0' THEN d1 ELSE '0' || d1 END AS phone_key
         FROM keyed
         WHERE (CASE WHEN left(d1, 1) = '0' THEN d1 ELSE '0' || d1 END) = ANY($1::text[])
         ORDER BY purchase_time DESC
         LIMIT 500`,
        [Array.from(phoneNeedles), eventId]
      );

      for (const t of ticketRows) {
        const ticketPhoneKey = phoneMatchKey(t.phone_number) || phoneMatchKey(t.whatsapp_number);
        let target: any = null;

        if (ticketPhoneKey) {
          target = customerMap.get(`p:${ticketPhoneKey}`) || null;
        } else {
          const nameHits = byName.get(String(t.buyer_name || "").trim().toLowerCase());
          // Only an unambiguous name hit counts: two different customers sharing
          // a name is common, and guessing between them would misattribute a
          // ticket to the wrong person's docket.
          if (nameHits && nameHits.length === 1) target = nameHits[0];
        }
        if (!target) continue;

        target.tickets.push({
          id: t.id,
          buyer_name: t.buyer_name,
          ticket_type: t.ticket_type,
          amount_paid: Number(t.amount_paid || 0),
          purchase_time: t.purchase_time,
          is_scanned: !!t.is_scanned,
          event_id: t.event_id,
          event_title: t.event_title
        });
      }
    }

    const customers = Array.from(customerMap.values())
      .map(c => {
        const tabs = Array.from(c.tabs.values()).sort(
          (a: any, b: any) => Number(b.amount_due || 0) - Number(a.amount_due || 0)
        );
        const orders = Array.from(c.orders.values()).sort(
          (a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
        const tickets = [...c.tickets].sort(
          (a: any, b: any) => new Date(b.purchase_time).getTime() - new Date(a.purchase_time).getTime()
        );
        // Only outstanding tabs contribute. Summing `balance` across every tab
        // — including settled ones, which retain their last balance — is the
        // bug that reported KES 0 while a tab page showed money outstanding.
        const tabBalanceDue = tabs.reduce((sum: number, t: any) => sum + Number(t.amount_due || 0), 0);
        const ticketSpend = tickets.reduce((sum: number, t: any) => sum + Number(t.amount_paid || 0), 0);

        return {
          name: c.name,
          // `phone` stays the canonical `07XXXXXXXX`; `phoneRaw` preserves what
          // was actually typed so the UI can show it and offer wa.me / tel.
          phone: c.phone || c.phoneRaw,
          phoneRaw: c.phoneRaw,
          isWalkIn: c.isWalkIn,
          totalSpent: c.totalSpent,
          orderCount: c.orderCount,
          paymentMethods: Array.from(c.paymentMethods),
          lastOrderAt: c.lastOrderAt,
          itemsBought: (Array.from(c.itemsBought.values()) as any[]).sort((a: any, b: any) => b.quantity - a.quantity),
          transactions: c.transactions,

          // --- Tab state (issues 5 & 6) -----------------------------------
          tabIds: tabs.map((t: any) => t.id),
          tabs,
          tab_count: tabs.length,
          // The single number the audit was previously unable to show.
          tab_balance_due: tabBalanceDue,
          has_open_tab: tabs.some((t: any) => t.outstanding),
          tab_credit_limit: tabs.reduce(
            (max: number, t: any) => Math.max(max, Number(t.credit_limit || 0)),
            0
          ),

          // --- Tab payments (debits & credits audit trail) ----------------
          payments: c.payments || [],
          total_paid: c.total_paid || 0,

          // --- Combined purchase history (issues 1 & 2) --------------------
          // One entry per POS order (tenders already grouped), plus the
          // customer's event tickets. The docket renders this list.
          orders,
          tickets,
          ticket_count: tickets.length,
          ticket_spend: ticketSpend,
          // Total they are on the hook for: what they spent, plus what they
          // still owe on an open tab. Deliberately NOT netted — a customer who
          // spent KES 3,000 and owes KES 500 has an outstanding 500, and
          // subtracting one from the other would hide a real debt behind spend.
          combined_spend: c.totalSpent + ticketSpend,
          total_due: tabBalanceDue
        };
      })
      // Owed money first, then by spend. A customer who must be chased is the
      // one an operator opened this panel to find.
      .sort((a, b) => (b.tab_balance_due - a.tab_balance_due) || (b.combined_spend - a.combined_spend));

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
      // Raw tab book for this vendor, so the panel can offer settlement /
      // reminder actions on a tab the customer directory did not surface.
      tabs: tabRows.map((t: any) => ({
        id: Number(t.id),
        customer_name: t.customer_name,
        customer_phone: t.customer_phone,
        credit_limit: Number(t.credit_limit || 0),
        balance: Number(t.balance || 0),
        status: t.status || "open",
        settlement_reason: t.settlement_reason || null,
        created_at: t.created_at,
        settled_at: t.settled_at || null,
        event_id: t.event_id,
        outstanding: isOutstandingTab(t),
        amount_due: isOutstandingTab(t) ? Number(t.balance || 0) : 0
      })),
      // Festival-wide receivable for this vendor, using the same outstanding
      // test as app/vendor/tabs/page.tsx.
      tabsOutstanding: {
        open_count: tabRows.filter(isOutstandingTab).length,
        total_due: tabRows
          .filter(isOutstandingTab)
          .reduce((sum: number, t: any) => sum + Number(t.balance || 0), 0)
      },
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

    if (commission_rate !== undefined) {
      const parsedRate = parseFloat(String(commission_rate));
      const rateToSet = isNaN(parsedRate) ? 10.0 : parsedRate;

      let targetEventId = event_id ? Number(event_id) : null;
      if (!targetEventId) {
        const { rows: existingAssignments } = await neonQuery(
          `SELECT event_id FROM vendor_event_assignments WHERE vendor_id = $1 ORDER BY created_at DESC LIMIT 1`,
          [vendorId]
        );
        if (existingAssignments.length > 0) {
          targetEventId = existingAssignments[0].event_id;
        } else {
          const activeEvent = await fetchActiveEvent();
          if (activeEvent) targetEventId = activeEvent.id;
        }
      }

      if (targetEventId) {
        await neonQuery(
          `INSERT INTO vendor_event_assignments (vendor_id, event_id, commission_rate)
           VALUES ($1, $2, $3)
           ON CONFLICT (vendor_id, event_id) DO UPDATE SET
             commission_rate = EXCLUDED.commission_rate`,
          [vendorId, targetEventId, rateToSet]
        );
      }
    }

    return NextResponse.json({ success: true, message: "Vendor profile updated successfully" });
  } catch (err: any) {
    console.error("Vendor analytics update error:", err);
    return NextResponse.json({ error: err.message || "Failed to update vendor" }, { status: 500 });
  }
}

export const PUT = PATCH;
