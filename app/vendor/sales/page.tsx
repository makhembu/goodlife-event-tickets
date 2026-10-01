"use client";

import React, { useState, useEffect, useMemo } from "react";
import { 
  Receipt, 
  Download, 
  Search, 
  RefreshCw, 
  DollarSign, 
  CreditCard, 
  Wallet, 
  Users, 
  ChevronDown, 
  ChevronUp, 
  CheckCircle2, 
  XCircle,
  FileSpreadsheet,
  ArrowUpDown,
  Printer,
  FileText
} from "lucide-react";
import { fmtDate } from "@/lib/utils";

interface SaleItem {
  name: string;
  quantity: number;
  price: number;
  total: number;
}

interface SplitPayment {
  method: string;
  amount: number;
  payer_name?: string;
  payer_phone?: string;
  mpesa_ref?: string;
  tab_id?: number | null;
}

interface PosSaleRecord {
  id: string;
  created_at: string;
  operator_name: string;
  operator_id?: number;
  subtotal: number;
  total: number;
  payment_status: "completed" | "voided" | "partial";
  void_reason?: string;
  notes?: string;
  items: SaleItem[];
  items_summary: string;
  payments: SplitPayment[];
  payment_summary: string;
}

interface SalesSummary {
  total_revenue: number;
  total_orders: number;
  cash_total: number;
  mpesa_total: number;
  tab_total: number;
  tab_cash_collected?: number;
  tab_mpesa_collected?: number;
  tab_payments_total?: number;
  cash_in_drawer?: number;
  voided_count: number;
  items_sold_count: number;
}

export default function VendorSalesPage() {
  const [sales, setSales] = useState<PosSaleRecord[]>([]);
  const [summary, setSummary] = useState<SalesSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [methodFilter, setMethodFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [expandedSaleId, setExpandedSaleId] = useState<string | null>(null);

  const fetchSales = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/vendor/sales");
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setSales(data.sales || []);
          setSummary(data.summary || null);
        }
      }
    } catch (e) {
      console.error("Failed to load vendor sales:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSales();
  }, []);

  // Filter sales
  const filteredSales = useMemo(() => {
    return sales.filter((s) => {
      // Status filter
      if (statusFilter !== "all" && s.payment_status !== statusFilter) {
        return false;
      }

      // Method filter
      if (methodFilter !== "all") {
        const hasMethod = s.payments.some((p) => p.method.toLowerCase() === methodFilter.toLowerCase());
        if (!hasMethod) return false;
      }

      // Search query
      if (!searchQuery.trim()) return true;
      const query = searchQuery.toLowerCase().trim();

      const idMatch = s.id.toLowerCase().includes(query);
      const opMatch = s.operator_name.toLowerCase().includes(query);
      const itemsMatch = s.items.some((it) => it.name.toLowerCase().includes(query));
      const paymentMatch = s.payments.some(
        (p) =>
          (p.payer_name && p.payer_name.toLowerCase().includes(query)) ||
          (p.payer_phone && p.payer_phone.toLowerCase().includes(query)) ||
          (p.mpesa_ref && p.mpesa_ref.toLowerCase().includes(query))
      );

      return idMatch || opMatch || itemsMatch || paymentMatch;
    });
  }, [sales, statusFilter, methodFilter, searchQuery]);

  // Export to CSV
  const handleExportCSV = () => {
    if (filteredSales.length === 0) return;

    const headers = [
      "Receipt ID",
      "Date & Time",
      "Operator",
      "Status",
      "Items Count",
      "Items Breakdown",
      "Subtotal (KES)",
      "Total Amount (KES)",
      "Cash Paid (KES)",
      "M-Pesa Paid (KES)",
      "Tab Credit Paid (KES)",
      "M-Pesa References",
      "Customer / Payer",
      "Customer Phone",
      "Notes"
    ];

    const rows = filteredSales.map((s) => {
      const dateFormatted = new Date(s.created_at).toLocaleString("en-KE");
      const itemsCount = s.items.reduce((acc, it) => acc + it.quantity, 0);
      const itemsBreakdown = s.items.map((it) => `${it.quantity}x ${it.name} (@KES ${it.price})`).join(" | ");

      const cashAmount = s.payments.filter((p) => p.method === "cash").reduce((acc, p) => acc + p.amount, 0);
      const mpesaAmount = s.payments.filter((p) => p.method === "mpesa").reduce((acc, p) => acc + p.amount, 0);
      const tabAmount = s.payments.filter((p) => p.method === "tab").reduce((acc, p) => acc + p.amount, 0);

      const mpesaRefs = s.payments.filter((p) => p.mpesa_ref).map((p) => p.mpesa_ref).join(", ");
      const customerNames = s.payments.filter((p) => p.payer_name).map((p) => p.payer_name).join(", ");
      const customerPhones = s.payments.filter((p) => p.payer_phone).map((p) => p.payer_phone).join(", ");

      const escapeCSV = (val: string | number) => {
        const str = String(val ?? "").replace(/"/g, '""');
        return `"${str}"`;
      };

      return [
        escapeCSV(s.id),
        escapeCSV(dateFormatted),
        escapeCSV(s.operator_name),
        escapeCSV(s.payment_status.toUpperCase()),
        itemsCount,
        escapeCSV(itemsBreakdown),
        s.subtotal,
        s.total,
        cashAmount,
        mpesaAmount,
        tabAmount,
        escapeCSV(mpesaRefs),
        escapeCSV(customerNames),
        escapeCSV(customerPhones),
        escapeCSV(s.notes || "")
      ].join(",");
    });

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `vendor-sales-${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Download printable docket slip
  const handleDownloadDocket = (sale: PosSaleRecord) => {
    const dateFormatted = new Date(sale.created_at).toLocaleString("en-KE", {
      dateStyle: "medium",
      timeStyle: "short",
    });

    const itemsRows = sale.items
      .map(
        (it) => `
        <tr>
          <td style="padding: 4px 0; border-bottom: 1px dashed #eee;">${it.quantity}x ${it.name}</td>
          <td style="text-align: right; padding: 4px 0; border-bottom: 1px dashed #eee; font-weight: bold;">KES ${it.total.toLocaleString()}</td>
        </tr>
      `
      )
      .join("");

    const paymentRows = sale.payments
      .map(
        (p) => `
        <tr>
          <td style="padding: 2px 0;">${p.method.toUpperCase()}${p.mpesa_ref ? ` (${p.mpesa_ref})` : ""}</td>
          <td style="text-align: right; padding: 2px 0; font-weight: bold;">KES ${p.amount.toLocaleString()}</td>
        </tr>
      `
      )
      .join("");

    const htmlContent = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Docket ${sale.id}</title>
  <style>
    @media print {
      @page { margin: 0; size: 80mm auto; }
      body { margin: 8px; }
    }
    body {
      font-family: 'Courier New', Courier, monospace;
      font-size: 13px;
      color: #000;
      background: #fff;
      max-width: 320px;
      margin: 15px auto;
      padding: 16px;
      border: 1px dashed #bbb;
    }
    .text-center { text-align: center; }
    .text-right { text-align: right; }
    .bold { font-weight: bold; }
    .divider { border-top: 1px dashed #000; margin: 8px 0; }
    .double-divider { border-top: 2px solid #000; margin: 8px 0; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
  </style>
</head>
<body>
  <div class="text-center">
    <h2 style="margin: 0; font-size: 17px; text-transform: uppercase;">GOODLIFE FESTIVAL</h2>
    <p style="margin: 3px 0; font-size: 12px; font-weight: bold;">OFFICIAL POS RECEIPT</p>
    <p style="margin: 2px 0; font-size: 11px;">Docket: <span class="bold">${sale.id}</span></p>
    <p style="margin: 2px 0; font-size: 11px;">${dateFormatted}</p>
    <p style="margin: 2px 0; font-size: 11px;">Operator: ${sale.operator_name}</p>
  </div>
  <div class="divider"></div>
  <table>
    <thead>
      <tr style="border-bottom: 1px solid #000;">
        <th style="text-align: left; padding-bottom: 4px;">ITEM</th>
        <th style="text-align: right; padding-bottom: 4px;">AMOUNT</th>
      </tr>
    </thead>
    <tbody>
      ${itemsRows}
    </tbody>
  </table>
  <div class="divider"></div>
  <table>
    <tr>
      <td class="bold" style="font-size: 14px;">TOTAL</td>
      <td class="text-right bold" style="font-size: 14px;">KES ${sale.total.toLocaleString()}</td>
    </tr>
  </table>
  <div class="divider"></div>
  <div class="bold" style="font-size: 10px; margin-bottom: 4px; text-transform: uppercase;">Payment Breakdown:</div>
  <table>
    ${paymentRows}
  </table>
  ${sale.notes ? `<div class="divider"></div><p style="font-size: 10px; margin: 4px 0;">Notes: ${sale.notes}</p>` : ""}
  ${sale.payment_status === "voided" ? `<div class="divider"></div><p style="color: red; font-size: 11px; margin: 4px 0; font-weight: bold;">VOIDED: ${sale.void_reason || "No reason given"}</p>` : ""}
  <div class="double-divider"></div>
  <div class="text-center" style="font-size: 10px; margin-top: 8px;">
    <p style="margin: 2px 0;">STATUS: <span class="bold">${sale.payment_status.toUpperCase()}</span></p>
    <p style="margin: 6px 0 0 0;">THANK YOU FOR CELEBRATING WITH GOODLIFE</p>
  </div>
  <script>
    window.onload = function() { window.print(); }
  </script>
</body>
</html>`;

    const blob = new Blob([htmlContent], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const win = window.open(url, "_blank");
    if (!win) {
      const a = document.createElement("a");
      a.href = url;
      a.download = `docket-${sale.id}.html`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  };

  return (
    <div className="p-3 md:p-6 max-w-7xl mx-auto space-y-4 md:space-y-6 pb-36 md:pb-12">
      
      {/* HEADER & CONTROLS */}
      <div className="flex items-center justify-between gap-2 bg-brand-off-white border-2 md:border-4 border-brand-navy p-2.5 md:p-4 shadow-(--shadow-brut-sm) md:shadow-(--shadow-brut-md)">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 md:gap-2">
            <Receipt className="w-4 h-4 md:w-6 md:h-6 text-brand-navy shrink-0" />
            <h1 className="font-display text-lg md:text-2xl uppercase tracking-wider truncate">SALES & AUDIT LOG</h1>
          </div>
          <p className="hidden md:block text-xs font-mono font-bold text-brand-navy/60 uppercase">
            Itemized point-of-sale transactions and real-time ledger
          </p>
        </div>

        <div className="flex items-center gap-1.5 md:gap-2 shrink-0">
          <button
            onClick={fetchSales}
            disabled={loading}
            className="flex items-center justify-center gap-1 px-2.5 py-1.5 md:px-3 md:py-2 border-2 border-brand-navy bg-white hover:bg-brand-navy hover:text-white font-mono text-[11px] md:text-xs font-black uppercase transition-colors shadow-(--shadow-brut-xs) active:scale-95 cursor-pointer"
            title="Refresh sales"
          >
            <RefreshCw className={`w-3 h-3 md:w-3.5 md:h-3.5 ${loading ? "animate-spin" : ""}`} />
            <span>SYNC</span>
          </button>

          <button
            onClick={handleExportCSV}
            disabled={filteredSales.length === 0}
            className="flex items-center justify-center gap-1 px-2.5 py-1.5 md:px-4 md:py-2 border-2 border-brand-navy bg-brand-accent text-brand-navy hover:bg-brand-navy hover:text-white font-mono text-[11px] md:text-xs font-black uppercase transition-colors shadow-(--shadow-brut-xs) active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            title="Export CSV"
          >
            <Download className="w-3 h-3 md:w-3.5 md:h-3.5" />
            <span>EXPORT CSV <span className="hidden sm:inline">({filteredSales.length})</span></span>
          </button>
        </div>
      </div>

      {/* SUMMARY KPI CARDS */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="bg-brand-navy text-brand-off-white p-3 md:p-4 border-3 border-brand-navy shadow-(--shadow-brut-sm)">
            <span className="text-[10px] md:text-xs font-black uppercase opacity-70 block mb-1">GROSS SALES</span>
            <div className="text-lg md:text-2xl font-black font-mono text-brand-accent">
              KES {summary.total_revenue.toLocaleString()}
            </div>
            <span className="text-[10px] opacity-60 font-mono block mt-1">
              {summary.total_orders} completed orders
            </span>
          </div>

          <div className="bg-white p-3 md:p-4 border-3 border-brand-navy shadow-(--shadow-brut-sm)">
            <span className="text-[10px] md:text-xs font-black uppercase text-green-700 block mb-1">M-PESA RECEIVED</span>
            <div className="text-lg md:text-2xl font-black font-mono text-green-700">
              KES {(summary.mpesa_total + (summary.tab_mpesa_collected || 0)).toLocaleString()}
            </div>
            <span className="text-[10px] text-brand-navy/70 font-mono block mt-1">
              Direct: KES {summary.mpesa_total.toLocaleString()} {summary.tab_mpesa_collected ? `+ Tab: KES ${summary.tab_mpesa_collected.toLocaleString()}` : ""}
            </span>
          </div>

          <div className="bg-white p-3 md:p-4 border-3 border-brand-navy shadow-(--shadow-brut-sm)">
            <span className="text-[10px] md:text-xs font-black uppercase text-blue-700 block mb-1">CASH IN REGISTER</span>
            <div className="text-lg md:text-2xl font-black font-mono text-blue-700">
              KES {(summary.cash_in_drawer ?? (summary.cash_total + (summary.tab_cash_collected || 0))).toLocaleString()}
            </div>
            <span className="text-[10px] text-brand-navy/70 font-mono block mt-1">
              Direct: KES {summary.cash_total.toLocaleString()} {summary.tab_cash_collected ? `+ Tab: KES ${summary.tab_cash_collected.toLocaleString()}` : ""}
            </span>
          </div>

          <div className="bg-white p-3 md:p-4 border-3 border-brand-navy shadow-(--shadow-brut-sm)">
            <span className="text-[10px] md:text-xs font-black uppercase text-purple-700 block mb-1">TAB / CREDIT</span>
            <div className="text-lg md:text-2xl font-black font-mono text-purple-700">
              KES {summary.tab_total.toLocaleString()}
            </div>
            <span className="text-[10px] text-brand-navy/60 font-mono block mt-1">
              Staff / VIP tabs
            </span>
          </div>

          <div className="bg-white p-3 md:p-4 border-3 border-brand-navy shadow-(--shadow-brut-sm) col-span-2 md:col-span-1">
            <span className="text-[10px] md:text-xs font-black uppercase text-brand-navy/70 block mb-1">ITEMS DISPATCHED</span>
            <div className="text-lg md:text-2xl font-black font-mono text-brand-navy">
              {summary.items_sold_count}
            </div>
            <span className="text-[10px] text-brand-navy/60 font-mono block mt-1">
              Units across all orders
            </span>
          </div>
        </div>
      )}

      {/* FILTER & SEARCH BAR */}
      <div className="bg-brand-off-white border-3 border-brand-navy p-3 md:p-4 shadow-(--shadow-brut-sm) space-y-3">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-navy/50" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by POS-ID, item name, operator, M-Pesa receipt, or customer..."
              className="w-full pl-9 pr-3 py-2 bg-white border-2 border-brand-navy text-xs font-mono font-bold focus:outline-none uppercase placeholder:normal-case"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <select
              value={methodFilter}
              onChange={(e) => setMethodFilter(e.target.value)}
              className="py-2 px-3 bg-white border-2 border-brand-navy font-mono text-xs font-bold uppercase focus:outline-none"
            >
              <option value="all">PAYMENT: ALL</option>
              <option value="mpesa">M-PESA ONLY</option>
              <option value="cash">CASH ONLY</option>
              <option value="tab">TAB / CREDIT ONLY</option>
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="py-2 px-3 bg-white border-2 border-brand-navy font-mono text-xs font-bold uppercase focus:outline-none"
            >
              <option value="all">STATUS: ALL</option>
              <option value="completed">COMPLETED</option>
              <option value="voided">VOIDED</option>
            </select>
          </div>
        </div>
      </div>

      {/* SALES TABLE / ACCORDION */}
      <div className="border-4 border-brand-navy bg-white shadow-(--shadow-brut-md) overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-brand-navy font-mono font-bold uppercase animate-pulse">
            Loading sales data...
          </div>
        ) : filteredSales.length === 0 ? (
          <div className="p-12 text-center font-mono space-y-2">
            <p className="text-base font-black uppercase text-brand-navy">No transactions found</p>
            <p className="text-xs text-brand-navy/60">
              {searchQuery || methodFilter !== "all" || statusFilter !== "all"
                ? "Try clearing your filters or search terms."
                : "No POS transactions have been recorded for this stall yet."}
            </p>
          </div>
        ) : (
          <>
            {/* MOBILE CARDS LIST (VISIBLE ON MOBILE ONLY) */}
            <div className="md:hidden divide-y-2 divide-brand-navy/10">
              {filteredSales.map((sale) => {
                const isExpanded = expandedSaleId === sale.id;
                const isCompleted = sale.payment_status === "completed";

                return (
                  <div key={sale.id} className="p-3 bg-white space-y-2.5">
                    {/* Top: ID, Status, Date */}
                    <div className="flex justify-between items-center gap-2">
                      <div className="flex items-center gap-1.5">
                        <span className="font-black text-brand-navy text-xs uppercase">{sale.id}</span>
                        <span className="text-[10px] text-brand-navy/60 font-medium">· {fmtDate(sale.created_at)}</span>
                      </div>
                      <span
                        className={`inline-flex items-center gap-1 text-[9px] font-black px-1.5 py-0.5 border uppercase ${
                          isCompleted
                            ? "bg-green-100 text-green-800 border-green-400"
                            : "bg-red-100 text-red-800 border-red-400"
                        }`}
                      >
                        {isCompleted ? <CheckCircle2 className="w-2.5 h-2.5" /> : <XCircle className="w-2.5 h-2.5" />}
                        {sale.payment_status}
                      </span>
                    </div>

                    {/* Middle: Items summary & Total Amount */}
                    <div className="flex justify-between items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-brand-navy line-clamp-2">{sale.items_summary || "—"}</p>
                        <p className="text-[10px] font-bold text-brand-navy/50 uppercase mt-0.5">Op: {sale.operator_name}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="font-black text-base text-brand-navy block">KES {sale.total.toLocaleString()}</span>
                      </div>
                    </div>

                    {/* Payment badges */}
                    <div className="flex flex-wrap items-center gap-1 pt-0.5">
                      {sale.payments.map((p, idx) => (
                        <span
                          key={idx}
                          className={`text-[9px] font-black px-1.5 py-0.5 border uppercase ${
                            p.method === "cash"
                              ? "bg-blue-50 text-blue-800 border-blue-300"
                              : p.method === "mpesa"
                              ? "bg-green-50 text-green-800 border-green-300"
                              : "bg-purple-50 text-purple-800 border-purple-300"
                          }`}
                        >
                          {p.method}: KES {p.amount.toLocaleString()}
                        </span>
                      ))}
                    </div>

                    {/* Action Bar: Docket Download + Expand Itemized Breakdown */}
                    <div className="flex items-center justify-between gap-2 pt-2 border-t border-brand-navy/10">
                      <button
                        type="button"
                        onClick={() => handleDownloadDocket(sale)}
                        className="flex items-center gap-1 px-2.5 py-1 bg-brand-accent text-brand-navy border border-brand-navy font-bold text-[10px] uppercase hover:bg-brand-navy hover:text-white transition-colors cursor-pointer active:scale-95"
                      >
                        <Printer className="w-3 h-3" /> Docket
                      </button>

                      <button
                        type="button"
                        onClick={() => setExpandedSaleId(isExpanded ? null : sale.id)}
                        className="flex items-center gap-1 text-[11px] font-bold uppercase text-brand-navy/70 hover:text-brand-navy py-1 px-2 cursor-pointer"
                      >
                        <span>{isExpanded ? "Hide Details" : "View Breakdown"}</span>
                        {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      </button>
                    </div>

                    {/* Expanded Docket Details on Mobile */}
                    {isExpanded && (
                      <div className="bg-brand-off-white border-2 border-brand-navy p-3 space-y-2.5 font-mono text-xs mt-2">
                        <div className="space-y-1">
                          <span className="text-[10px] font-black uppercase text-brand-navy/60 block">ITEMS ORDERED:</span>
                          {sale.items.map((it, idx) => (
                            <div key={idx} className="flex justify-between text-xs py-0.5 border-b border-dashed border-brand-navy/20">
                              <span>
                                <strong>{it.quantity}x</strong> {it.name} <span className="text-gray-500">(@ KES {it.price})</span>
                              </span>
                              <span className="font-bold">KES {it.total.toLocaleString()}</span>
                            </div>
                          ))}
                        </div>

                        <div className="space-y-1 pt-1 border-t border-brand-navy/20">
                          <span className="text-[10px] font-black uppercase text-brand-navy/60 block">PAYMENTS & REFS:</span>
                          {sale.payments.map((p, idx) => (
                            <div key={idx} className="text-[11px] flex justify-between items-center bg-white p-1 border border-brand-navy/20">
                              <div>
                                <span className="font-black uppercase">{p.method}</span>
                                {p.mpesa_ref && <span className="ml-1 text-green-700 font-bold">({p.mpesa_ref})</span>}
                              </div>
                              <span className="font-black">KES {p.amount.toLocaleString()}</span>
                            </div>
                          ))}
                        </div>

                        {sale.notes && (
                          <div className="text-[10px] bg-yellow-50 p-1.5 border border-yellow-200 text-yellow-900">
                            <strong>Notes:</strong> {sale.notes}
                          </div>
                        )}

                        {sale.payment_status === "voided" && sale.void_reason && (
                          <div className="text-[10px] bg-red-50 p-1.5 border border-red-200 text-red-900">
                            <strong>Void Reason:</strong> {sale.void_reason}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* DESKTOP TABLE VIEW (VISIBLE ON MD+ SCREENS) */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left font-mono text-xs min-w-[640px]">
                <thead className="bg-brand-navy text-brand-off-white uppercase border-b-3 border-brand-navy text-[11px] font-black tracking-wider">
                  <tr>
                    <th className="p-3 w-8"></th>
                    <th className="p-3">RECEIPT / DATE</th>
                    <th className="p-3">OPERATOR</th>
                    <th className="p-3">ITEMS</th>
                    <th className="p-3">PAYMENT</th>
                    <th className="p-3 text-right">TOTAL</th>
                    <th className="p-3 text-center">STATUS</th>
                    <th className="p-3 text-center">DOCKET</th>
                  </tr>
                </thead>
                <tbody className="divide-y-2 divide-brand-navy/10">
                  {filteredSales.map((sale) => {
                    const isExpanded = expandedSaleId === sale.id;
                    const isCompleted = sale.payment_status === "completed";

                    return (
                      <React.Fragment key={sale.id}>
                        <tr 
                          onClick={() => setExpandedSaleId(isExpanded ? null : sale.id)}
                          className={`hover:bg-brand-accent/10 transition-colors cursor-pointer ${
                            isExpanded ? "bg-brand-accent/15" : ""
                          }`}
                        >
                          <td className="p-3 text-center">
                            {isExpanded ? (
                              <ChevronUp className="w-4 h-4 text-brand-navy" />
                            ) : (
                              <ChevronDown className="w-4 h-4 text-brand-navy/50" />
                            )}
                          </td>

                          <td className="p-3">
                            <span className="font-black text-brand-navy block uppercase">{sale.id}</span>
                            <span className="text-[10px] text-brand-navy/60 block">
                              {fmtDate(sale.created_at)}
                            </span>
                          </td>

                          <td className="p-3 font-bold uppercase text-brand-navy">
                            {sale.operator_name}
                          </td>

                          <td className="p-3 max-w-xs truncate font-medium">
                            {sale.items_summary || "—"}
                          </td>

                          <td className="p-3">
                            <div className="flex flex-wrap gap-1">
                              {sale.payments.map((p, idx) => (
                                <span
                                  key={idx}
                                  className={`text-[10px] font-black px-1.5 py-0.5 border uppercase ${
                                    p.method === "cash"
                                      ? "bg-blue-50 text-blue-800 border-blue-300"
                                      : p.method === "mpesa"
                                      ? "bg-green-50 text-green-800 border-green-300"
                                      : "bg-purple-50 text-purple-800 border-purple-300"
                                  }`}
                                >
                                  {p.method}: KES {p.amount.toLocaleString()}
                                </span>
                              ))}
                            </div>
                          </td>

                          <td className="p-3 text-right font-black text-sm text-brand-navy">
                            KES {sale.total.toLocaleString()}
                          </td>

                          <td className="p-3 text-center">
                            <span
                              className={`inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 border uppercase ${
                                isCompleted
                                  ? "bg-green-100 text-green-800 border-green-400"
                                  : "bg-red-100 text-red-800 border-red-400"
                              }`}
                            >
                              {isCompleted ? (
                                <CheckCircle2 className="w-3 h-3" />
                              ) : (
                                <XCircle className="w-3 h-3" />
                              )}
                              {sale.payment_status}
                            </span>
                          </td>

                          <td className="p-3 text-center">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDownloadDocket(sale);
                              }}
                              className="p-1.5 bg-brand-accent/30 hover:bg-brand-navy hover:text-white border border-brand-navy text-brand-navy transition-colors shadow-(--shadow-brut-xs) active:scale-95"
                              title="Print or Download Docket"
                            >
                              <Printer className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>

                        {/* EXPANDED ITEM DETAIL DOCKET */}
                        {isExpanded && (
                          <tr className="bg-brand-off-white/80 border-y-2 border-brand-navy/20">
                            <td colSpan={8} className="p-4">
                              <div className="max-w-2xl bg-white border-2 border-brand-navy p-4 shadow-(--shadow-brut-xs) space-y-3 font-mono">
                                <div className="flex justify-between items-center border-b border-brand-navy/20 pb-2">
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs font-black uppercase text-brand-navy">
                                      DOCKET BREAKDOWN — {sale.id}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => handleDownloadDocket(sale)}
                                      className="flex items-center gap-1 px-2 py-0.5 bg-brand-accent text-brand-navy border border-brand-navy font-bold text-[10px] uppercase hover:bg-brand-navy hover:text-white transition-colors cursor-pointer"
                                    >
                                      <Printer className="w-3 h-3" /> Print Docket
                                    </button>
                                  </div>
                                  <span className="text-[10px] opacity-60">
                                    Full Timestamp: {new Date(sale.created_at).toISOString()}
                                  </span>
                                </div>

                                {/* Items list */}
                                <div className="space-y-1">
                                  <span className="text-[10px] font-black uppercase text-brand-navy/60 block">ITEMS:</span>
                                  {sale.items.map((it, idx) => (
                                    <div key={idx} className="flex justify-between text-xs py-0.5 border-b border-dashed border-gray-200">
                                      <span>
                                        <strong>{it.quantity}x</strong> {it.name} <span className="text-gray-500">(@ KES {it.price})</span>
                                      </span>
                                      <span className="font-bold">KES {it.total.toLocaleString()}</span>
                                    </div>
                                  ))}
                                </div>

                                {/* Payments breakdown */}
                                <div className="space-y-1 pt-2 border-t border-brand-navy/20">
                                  <span className="text-[10px] font-black uppercase text-brand-navy/60 block">PAYMENTS & REFERENCES:</span>
                                  {sale.payments.map((p, idx) => (
                                    <div key={idx} className="text-xs flex justify-between items-center bg-gray-50 p-1.5 border border-gray-200">
                                      <div>
                                        <span className="font-black uppercase">{p.method}</span>
                                        {p.mpesa_ref && (
                                          <span className="ml-2 text-green-700 font-bold">M-PESA REF: {p.mpesa_ref}</span>
                                        )}
                                        {p.payer_name && (
                                          <span className="ml-2 text-gray-600">({p.payer_name})</span>
                                        )}
                                        {p.payer_phone && (
                                          <span className="ml-2 text-gray-500">{p.payer_phone}</span>
                                        )}
                                      </div>
                                      <span className="font-black">KES {p.amount.toLocaleString()}</span>
                                    </div>
                                  ))}
                                </div>

                                {sale.notes && (
                                  <div className="text-[11px] bg-yellow-50 p-2 border border-yellow-200 text-yellow-900">
                                    <strong>Notes:</strong> {sale.notes}
                                  </div>
                                )}

                                {sale.payment_status === "voided" && sale.void_reason && (
                                  <div className="text-[11px] bg-red-50 p-2 border border-red-200 text-red-900">
                                    <strong>Void Reason:</strong> {sale.void_reason}
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* Mobile Safe Area & Bottom Nav Clearance Spacer */}
      <div className="h-16 md:hidden" aria-hidden="true" />

    </div>
  );
}
