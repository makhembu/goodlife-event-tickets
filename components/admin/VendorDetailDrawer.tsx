"use client";

import React, { useState, useEffect } from "react";
import {
  X,
  TrendingUp,
  Package,
  Clock,
  CreditCard,
  Download,
  Phone,
  MessageSquare,
  AlertCircle,
  CheckCircle,
  ExternalLink,
  ChevronRight,
  HandCoins,
  RefreshCw,
  Users
} from "lucide-react";
import { fmtDate, fmtTime } from "@/lib/utils";

interface VendorDetailDrawerProps {
  vendorId: number | null;
  eventId?: string | number | null;
  isOpen: boolean;
  onClose: () => void;
  onSettlementRecorded?: () => void;
}

export default function VendorDetailDrawer({
  vendorId,
  eventId,
  isOpen,
  onClose,
  onSettlementRecorded
}: VendorDetailDrawerProps) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"velocity" | "stock" | "sales" | "payments">("velocity");
  const [salesSearch, setSalesSearch] = useState("");
  const [showSettleModal, setShowSettleModal] = useState(false);
  const [settleAmount, setSettleAmount] = useState("");
  const [settling, setSettling] = useState(false);

  useEffect(() => {
    if (!isOpen || !vendorId) {
      setData(null);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    const query = eventId && eventId !== "all" && eventId !== "" ? `?eventId=${eventId}` : "";
    fetch(`/api/admin/vendors/${vendorId}/analytics${query}`)
      .then(async (res) => {
        const resData = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(resData.error || `Failed to load vendor data (${res.status})`);
        }
        return resData;
      })
      .then((resData) => {
        if (resData.success) {
          setData(resData);
        } else {
          setError(resData.error || "Failed to load vendor data");
        }
      })
      .catch((err) => {
        setError(err.message || "Network error loading vendor data");
      })
      .finally(() => {
        setLoading(false);
      });
  }, [isOpen, vendorId, eventId]);

  if (!isOpen || !vendorId) return null;

  const vendor = data?.vendor;
  const summary = data?.summary || {};
  const bestsellers = data?.bestsellers || [];
  const stock = data?.stock || [];
  const sales = data?.sales || [];
  const paymentBreakdown = data?.paymentBreakdown || [];
  const operators = data?.operators || [];

  // Filter sales
  const filteredSales = sales.filter((s: any) => {
    if (!salesSearch.trim()) return true;
    const q = salesSearch.toLowerCase();
    const idMatch = s.id?.toLowerCase().includes(q);
    const opMatch = s.operator_name?.toLowerCase().includes(q);
    const itemMatch = s.items?.some((i: any) => i.item_name?.toLowerCase().includes(q));
    return idMatch || opMatch || itemMatch;
  });

  const handleExportCSV = () => {
    if (!sales || sales.length === 0) {
      alert("No sales recorded to export.");
      return;
    }

    const headers = [
      "Sale ID",
      "Date & Time",
      "Event",
      "Total (KES)",
      "Operator",
      "Payment Methods",
      "Items Purchased",
      "Status"
    ];

    const rows = sales.map((s: any) => {
      const itemsStr = (s.items || [])
        .map((i: any) => `${i.item_name} x${i.quantity} (KES ${i.line_total})`)
        .join("; ");
      const paymentsStr = (s.payments || [])
        .map((p: any) => `${p.method?.toUpperCase()}: KES ${p.amount}${p.mpesa_ref ? ` (${p.mpesa_ref})` : ""}`)
        .join("; ");

      return [
        s.id,
        new Date(s.created_at).toLocaleString(),
        `"${s.event_title || ""}"`,
        Number(s.total),
        `"${s.operator_name || ""}"`,
        `"${paymentsStr}"`,
        `"${itemsStr}"`,
        s.payment_status?.toUpperCase()
      ];
    });

    const csvContent = [headers.join(","), ...rows.map((r: any) => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${(vendor?.name || "VENDOR").replace(/\s+/g, "_")}_SALES_REPORT_${new Date().toISOString().split("T")[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleSettleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const num = Number(settleAmount);
    if (!num || num <= 0) return;

    setSettling(true);
    try {
      const activeAssignment = data?.assignments?.[0];
      const res = await fetch("/api/admin/settlements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assignmentId: activeAssignment?.id || 0,
          vendor_id: vendorId,
          event_id: eventId ? Number(eventId) : (activeAssignment?.event_id || 2),
          amount: num
        })
      });
      if (res.ok) {
        setShowSettleModal(false);
        setSettleAmount("");
        // Reload analytics
        const query = eventId && eventId !== "all" && eventId !== "" ? `?eventId=${eventId}` : "";
        fetch(`/api/admin/vendors/${vendorId}/analytics${query}`)
          .then((r) => r.json())
          .then((d) => { if (d.success) setData(d); });
        if (onSettlementRecorded) onSettlementRecorded();
      } else {
        alert("Failed to record settlement");
      }
    } catch {
      alert("Error recording settlement");
    } finally {
      setSettling(false);
    }
  };

  const cleanPhone = vendor?.contact_phone?.replace(/\D/g, "") || "";
  const intlPhone = cleanPhone.startsWith("0") ? "254" + cleanPhone.slice(1) : cleanPhone;

  return (
    <div
      className="fixed inset-0 z-50 bg-[var(--brand-navy)]/80 backdrop-blur-sm flex justify-end transition-opacity duration-200"
      role="dialog"
      aria-modal="true"
      onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
    >
      <div className="w-full max-w-4xl bg-[var(--brand-off-white)] h-full overflow-y-auto border-l-4 border-[var(--brand-navy)] flex flex-col shadow-(--shadow-brut-xl)">
        {/* TOP APP HEADER */}
        <div className="bg-[var(--brand-navy)] text-[var(--brand-off-white)] p-4 sm:p-5 flex justify-between items-start border-b-4 border-yellow-400 sticky top-0 z-20">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-mono font-black uppercase bg-yellow-300 text-[var(--brand-navy)] px-2 py-0.5">
                VENDOR INTELLIGENCE & AUDIT
              </span>
              <span className="text-[10px] font-mono uppercase bg-white/20 px-2 py-0.5">
                ID: #{vendorId}
              </span>
              {vendor?.status && (
                <span className="text-[10px] font-black uppercase bg-emerald-500 text-white px-2 py-0.5">
                  {vendor.status}
                </span>
              )}
            </div>
            <h2 className="text-2xl sm:text-3xl font-sans font-black uppercase tracking-tight text-white mt-1">
              {loading ? "LOADING VENDOR..." : vendor?.name || "VENDOR DATA"}
            </h2>
            {vendor?.contact_name && (
              <p className="text-xs text-stone-300 font-bold uppercase mt-0.5 flex items-center gap-2 flex-wrap">
                <span>Contact: <strong className="text-white">{vendor.contact_name}</strong></span>
                {vendor.contact_phone && (
                  <span>· Tel: <strong className="text-white font-mono">{vendor.contact_phone}</strong></span>
                )}
              </p>
            )}
          </div>

          <div className="flex items-center gap-2">
            {intlPhone && (
              <a
                href={`https://wa.me/${intlPhone}`}
                target="_blank"
                rel="noreferrer"
                className="p-2 bg-emerald-600 hover:bg-emerald-500 text-white border-2 border-white transition-colors shadow-(--shadow-brut-xs)"
                title="Message on WhatsApp"
              >
                <MessageSquare className="w-4 h-4" />
              </a>
            )}
            {vendor?.contact_phone && (
              <a
                href={`tel:${vendor.contact_phone}`}
                className="p-2 bg-blue-600 hover:bg-blue-500 text-white border-2 border-white transition-colors shadow-(--shadow-brut-xs)"
                title="Call Vendor"
              >
                <Phone className="w-4 h-4" />
              </a>
            )}
            <button
              onClick={onClose}
              className="p-2 border-2 border-white hover:bg-red-600 hover:text-white transition-colors text-white"
              title="Close Drawer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* BODY CONTAINER */}
        <div className="p-4 sm:p-6 flex-1 space-y-6">
          {loading ? (
            <div className="py-20 text-center">
              <RefreshCw className="w-8 h-8 animate-spin mx-auto text-[var(--brand-navy)] mb-2" />
              <p className="text-xs font-black uppercase text-[var(--brand-navy)]">Fetching vendor stock and sales records...</p>
            </div>
          ) : error ? (
            <div className="p-4 bg-red-100 border-2 border-red-600 text-red-900 font-bold uppercase text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <p>Error: {error}</p>
              <button
                onClick={() => {
                  setLoading(true);
                  setError(null);
                  const query = eventId && eventId !== "all" && eventId !== "" ? `?eventId=${eventId}` : "";
                  fetch(`/api/admin/vendors/${vendorId}/analytics${query}`)
                    .then(async (res) => {
                      const resData = await res.json().catch(() => ({}));
                      if (!res.ok) throw new Error(resData.error || `Failed to load vendor data (${res.status})`);
                      return resData;
                    })
                    .then((resData) => {
                      if (resData.success) setData(resData);
                      else setError(resData.error || "Failed to load vendor data");
                    })
                    .catch((err) => setError(err.message || "Network error loading vendor data"))
                    .finally(() => setLoading(false));
                }}
                className="px-3 py-1.5 bg-red-600 text-white font-black hover:bg-black uppercase border border-red-900 transition-colors w-fit cursor-pointer"
              >
                RETRY
              </button>
            </div>
          ) : (
            <>
              {/* TOP FINANCIAL OVERVIEW KPIS */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3">
                <div className="border-3 border-[var(--brand-navy)] bg-white p-3 shadow-(--shadow-brut-xs)">
                  <p className="text-[10px] font-black uppercase text-[var(--brand-navy-light)]">Gross Sales</p>
                  <p className="text-lg sm:text-xl font-mono font-black text-[var(--brand-navy)] mt-1">
                    KES {Number(summary.totalGross || 0).toLocaleString()}
                  </p>
                  <p className="text-[9px] text-[var(--brand-navy-light)] font-bold">{summary.orderCount || 0} orders</p>
                </div>

                <div className="border-3 border-[var(--brand-navy)] bg-white p-3 shadow-(--shadow-brut-xs)">
                  <p className="text-[10px] font-black uppercase text-[var(--brand-navy-light)]">Avg Ticket</p>
                  <p className="text-lg sm:text-xl font-mono font-black text-[var(--brand-navy)] mt-1">
                    KES {Number(summary.avgOrderValue || 0).toLocaleString()}
                  </p>
                  <p className="text-[9px] text-[var(--brand-navy-light)] font-bold">per customer</p>
                </div>

                <div className="border-3 border-[var(--brand-navy)] bg-white p-3 shadow-(--shadow-brut-xs)">
                  <p className="text-[10px] font-black uppercase text-[var(--brand-navy-light)]">Commission ({summary.commissionRate || 10}%)</p>
                  <p className="text-lg sm:text-xl font-mono font-black text-amber-700 mt-1">
                    KES {Number(summary.commissionOwed || 0).toLocaleString()}
                  </p>
                  <p className="text-[9px] text-amber-800 font-bold">festival share</p>
                </div>

                <div className="border-3 border-[var(--brand-navy)] bg-white p-3 shadow-(--shadow-brut-xs)">
                  <p className="text-[10px] font-black uppercase text-[var(--brand-navy-light)]">Settled to Date</p>
                  <p className="text-lg sm:text-xl font-mono font-black text-emerald-700 mt-1">
                    KES {Number(summary.settledAmount || 0).toLocaleString()}
                  </p>
                  <p className="text-[9px] text-emerald-800 font-bold">recorded paid</p>
                </div>

                <div className="border-3 border-[var(--brand-navy)] bg-white p-3 shadow-(--shadow-brut-xs)">
                  <p className="text-[10px] font-black uppercase text-[var(--brand-navy-light)]">Balance Due</p>
                  <p className="text-lg sm:text-xl font-mono font-black text-red-600 mt-1">
                    KES {Number(summary.outstandingDue || 0).toLocaleString()}
                  </p>
                  <p className="text-[9px] text-red-700 font-bold">unsettled</p>
                </div>

                <div className="border-3 border-[var(--brand-navy)] bg-white p-3 shadow-(--shadow-brut-xs)">
                  <p className="text-[10px] font-black uppercase text-[var(--brand-navy-light)]">Net to Vendor</p>
                  <p className="text-lg sm:text-xl font-mono font-black text-blue-700 mt-1">
                    KES {Number(summary.netPayout || 0).toLocaleString()}
                  </p>
                  <p className="text-[9px] text-blue-800 font-bold">after comms</p>
                </div>
              </div>

              {/* ACTION TOOLBAR: EXPORT + SETTLE */}
              <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-white border-2 border-[var(--brand-navy)] shadow-(--shadow-brut-xs)">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-black uppercase text-[var(--brand-navy)]">ASSIGNED OPERATORS:</span>
                  <div className="flex flex-wrap gap-1">
                    {operators.length > 0 ? (
                      operators.map((op: any) => (
                        <span key={op.id} className="text-[10px] font-mono font-bold bg-stone-100 border border-[var(--brand-navy)] px-2 py-0.5">
                          {op.name} ({op.role})
                        </span>
                      ))
                    ) : (
                      <span className="text-[10px] italic text-[var(--brand-navy-light)]">None assigned</span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleExportCSV}
                    className="text-xs font-black uppercase px-3 py-1.5 bg-white border-2 border-[var(--brand-navy)] hover:bg-stone-100 transition-colors flex items-center gap-1.5 shadow-(--shadow-brut-xs)"
                  >
                    <Download className="w-3.5 h-3.5" /> EXPORT CSV
                  </button>
                  <button
                    onClick={() => {
                      setSettleAmount(summary.outstandingDue > 0 ? summary.outstandingDue.toString() : "");
                      setShowSettleModal(true);
                    }}
                    className="text-xs font-black uppercase px-3 py-1.5 bg-yellow-300 text-[var(--brand-navy)] border-2 border-[var(--brand-navy)] hover:bg-[var(--brand-navy)] hover:text-white transition-colors flex items-center gap-1.5 shadow-(--shadow-brut-xs)"
                  >
                    <HandCoins className="w-3.5 h-3.5" /> RECORD SETTLEMENT
                  </button>
                </div>
              </div>

              {/* TABS NAVIGATION */}
              <div className="flex border-b-3 border-[var(--brand-navy)] gap-1 flex-wrap">
                {[
                  { id: "velocity", label: "PRODUCTS MOVING MOST", icon: TrendingUp },
                  { id: "stock", label: `STOCK & INVENTORY (${stock.length})`, icon: Package },
                  { id: "sales", label: `TIME OF SALES (${sales.length})`, icon: Clock },
                  { id: "payments", label: "PAYMENT METHODS", icon: CreditCard }
                ].map((tab) => {
                  const Icon = tab.icon;
                  const isActive = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id as any)}
                      className={`px-4 py-2.5 text-xs font-black uppercase flex items-center gap-1.5 transition-all ${
                        isActive
                          ? "bg-[var(--brand-navy)] text-white border-t-3 border-x-3 border-[var(--brand-navy)] -mb-[3px]"
                          : "bg-white text-[var(--brand-navy)] hover:bg-stone-100 border border-[var(--brand-navy)]/30"
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      {tab.label}
                    </button>
                  );
                })}
              </div>

              {/* TAB 1: PRODUCT VELOCITY (PRODUCTS MOVING MOST) */}
              {activeTab === "velocity" && (
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <p className="text-xs font-black uppercase text-[var(--brand-navy)]">
                      Top Selling Items Ranked by Velocity & Revenue
                    </p>
                    <span className="text-[10px] font-mono uppercase bg-yellow-200 px-2 py-0.5 border border-[var(--brand-navy)]">
                      Total Units Sold: {bestsellers.reduce((s: number, b: any) => s + b.quantity_sold, 0)}
                    </span>
                  </div>

                  {bestsellers.length === 0 ? (
                    <div className="p-10 text-center border-2 border-dashed border-[var(--brand-navy)]/30 bg-white">
                      <p className="text-xs font-bold uppercase text-[var(--brand-navy-light)]">No sales recorded yet for this vendor.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {bestsellers.map((item: any, idx: number) => (
                        <div
                          key={idx}
                          className="border-3 border-[var(--brand-navy)] bg-white p-4 shadow-(--shadow-brut-xs) relative flex flex-col justify-between"
                        >
                          <div className="flex justify-between items-start gap-2">
                            <div className="flex items-start gap-2.5">
                              <span className="w-6 h-6 rounded-full bg-[var(--brand-navy)] text-white flex items-center justify-center font-mono font-black text-xs shrink-0">
                                #{idx + 1}
                              </span>
                              <div>
                                <h4 className="text-sm font-black uppercase text-[var(--brand-navy)] leading-tight">
                                  {item.item_name}
                                </h4>
                                <span className="text-[10px] font-mono text-[var(--brand-navy-light)] font-bold uppercase">
                                  Category: {item.category} · Price: KES {Number(item.unit_price).toLocaleString()}
                                </span>
                              </div>
                            </div>

                            <div className="text-right">
                              <span className="text-xs font-mono font-black text-emerald-700 block">
                                KES {item.total_revenue.toLocaleString()}
                              </span>
                              <span className="text-[10px] font-mono font-bold bg-stone-100 px-1.5 py-0.5 border border-stone-300">
                                {item.quantity_sold} {item.quantity_sold === 1 ? "unit" : "units"} sold
                              </span>
                            </div>
                          </div>

                          {/* Velocity Progress Bar */}
                          <div className="mt-3 pt-2 border-t border-dashed border-stone-200">
                            <div className="flex justify-between text-[10px] font-black uppercase mb-1">
                              <span>Share of Vendor Sales:</span>
                              <span className="font-mono text-blue-700">{item.percentage_of_sales}%</span>
                            </div>
                            <div className="w-full bg-stone-100 h-2.5 border border-[var(--brand-navy)] overflow-hidden">
                              <div
                                className="bg-[var(--brand-navy)] h-full transition-all duration-300"
                                style={{ width: `${Math.min(100, Math.max(5, item.percentage_of_sales))}%` }}
                              />
                            </div>
                            <div className="flex justify-between items-center mt-2 text-[10px] font-mono">
                              <span className="text-[var(--brand-navy-light)] font-bold">
                                Current Stock:{" "}
                                <strong className={item.stock_qty <= 2 ? "text-red-600" : "text-[var(--brand-navy)]"}>
                                  {item.stock_qty !== null ? `${item.stock_qty} left` : "Unlimited"}
                                </strong>
                              </span>
                              {item.stock_qty !== null && item.stock_qty <= 2 && (
                                <span className="text-[9px] font-black uppercase bg-red-100 text-red-700 px-1.5 py-0.5 border border-red-400">
                                  LOW STOCK ALERT
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* TAB 2: STOCK & INVENTORY */}
              {activeTab === "stock" && (
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <p className="text-xs font-black uppercase text-[var(--brand-navy)]">
                      Current Live Inventory Catalog & Stock Levels
                    </p>
                    <span className="text-[10px] font-mono uppercase bg-stone-200 px-2 py-0.5">
                      {stock.length} Products Configured
                    </span>
                  </div>

                  {stock.length === 0 ? (
                    <div className="p-10 text-center border-2 border-dashed border-[var(--brand-navy)]/30 bg-white">
                      <p className="text-xs font-bold uppercase text-[var(--brand-navy-light)]">No menu items configured for this vendor.</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto border-3 border-[var(--brand-navy)] bg-white shadow-(--shadow-brut-xs)">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-[var(--brand-navy)] text-white text-[11px] font-black uppercase">
                            <th className="p-3">Product Name</th>
                            <th className="p-3">Category</th>
                            <th className="p-3 text-right">Price (KES)</th>
                            <th className="p-3 text-center">Remaining Stock</th>
                            <th className="p-3 text-center">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--brand-navy)]/10 text-xs">
                          {stock.map((item: any) => {
                            const isLowStock = item.stock_qty !== null && item.stock_qty <= (item.low_stock_threshold || 5);
                            const isOutOfStock = item.stock_qty !== null && item.stock_qty <= 0;

                            return (
                              <tr key={item.id} className="hover:bg-yellow-50/50">
                                <td className="p-3 font-bold uppercase text-[var(--brand-navy)]">
                                  {item.name}
                                </td>
                                <td className="p-3 font-mono text-[var(--brand-navy-light)] uppercase">
                                  {item.category || "General"}
                                </td>
                                <td className="p-3 text-right font-mono font-black text-[var(--brand-navy)]">
                                  KES {Number(item.price).toLocaleString()}
                                </td>
                                <td className="p-3 text-center font-mono">
                                  {item.stock_qty === null ? (
                                    <span className="text-[10px] font-bold text-stone-500 uppercase">Unlimited</span>
                                  ) : isOutOfStock ? (
                                    <span className="px-2 py-0.5 text-[10px] font-black uppercase bg-red-600 text-white">
                                      0 (SOLD OUT)
                                    </span>
                                  ) : isLowStock ? (
                                    <span className="px-2 py-0.5 text-[10px] font-black uppercase bg-amber-400 text-black">
                                      {item.stock_qty} (LOW STOCK)
                                    </span>
                                  ) : (
                                    <span className="px-2 py-0.5 text-[10px] font-bold uppercase bg-emerald-100 text-emerald-800">
                                      {item.stock_qty} IN STOCK
                                    </span>
                                  )}
                                </td>
                                <td className="p-3 text-center">
                                  <span
                                    className={`text-[10px] font-black uppercase px-2 py-0.5 border ${
                                      item.is_available
                                        ? "bg-emerald-50 text-emerald-700 border-emerald-300"
                                        : "bg-stone-100 text-stone-500 border-stone-300"
                                    }`}
                                  >
                                    {item.is_available ? "ACTIVE" : "HIDDEN"}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 3: TIME OF SALES (TRANSACTION TIMELINE) */}
              {activeTab === "sales" && (
                <div className="space-y-3">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                    <p className="text-xs font-black uppercase text-[var(--brand-navy)]">
                      Chronological Sales Audit Ledger (Time of Sales)
                    </p>
                    <input
                      type="text"
                      placeholder="Search sale ID, item, or cashier..."
                      value={salesSearch}
                      onChange={(e) => setSalesSearch(e.target.value)}
                      className="border-2 border-[var(--brand-navy)] px-2.5 py-1 text-xs font-bold uppercase w-full sm:w-64 bg-white focus:outline-none"
                    />
                  </div>

                  {filteredSales.length === 0 ? (
                    <div className="p-10 text-center border-2 border-dashed border-[var(--brand-navy)]/30 bg-white">
                      <p className="text-xs font-bold uppercase text-[var(--brand-navy-light)]">No matching sales records found.</p>
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {filteredSales.map((sale: any) => {
                        const dateObj = new Date(sale.created_at);
                        const timeStr = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                        const dateStr = dateObj.toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' });

                        return (
                          <div
                            key={sale.id}
                            className="border-2 border-[var(--brand-navy)] bg-white p-3.5 shadow-(--shadow-brut-xs) flex flex-col sm:flex-row justify-between gap-3"
                          >
                            <div className="space-y-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-mono text-xs font-black bg-[var(--brand-navy)] text-white px-2 py-0.5">
                                  {sale.id}
                                </span>
                                <span className="text-[11px] font-mono font-bold text-stone-600">
                                  🕒 {timeStr} · {dateStr}
                                </span>
                                {sale.event_title && (
                                  <span className="text-[10px] font-bold uppercase bg-stone-100 px-1.5 py-0.5 border border-stone-300">
                                    {sale.event_title}
                                  </span>
                                )}
                              </div>

                              {/* Items list */}
                              <div className="text-xs font-bold text-[var(--brand-navy)] pt-1">
                                {(sale.items || []).map((itm: any, idx: number) => (
                                  <span key={idx} className="mr-3 inline-block">
                                    • {itm.item_name} <span className="text-stone-500">x{itm.quantity}</span> (KES {Number(itm.line_total).toLocaleString()})
                                  </span>
                                ))}
                              </div>

                              <div className="text-[10px] font-mono text-[var(--brand-navy-light)]">
                                Cashier: <strong className="text-[var(--brand-navy)]">{sale.operator_name}</strong>
                              </div>
                            </div>

                            <div className="sm:text-right shrink-0 flex sm:flex-col justify-between items-center sm:items-end border-t sm:border-t-0 pt-2 sm:pt-0 border-stone-200">
                              <div className="text-base font-mono font-black text-emerald-800">
                                KES {Number(sale.total).toLocaleString()}
                              </div>
                              <div className="flex gap-1 flex-wrap sm:justify-end mt-1">
                                {(sale.payments || []).map((pm: any, pIdx: number) => (
                                  <span
                                    key={pIdx}
                                    className="text-[9px] font-mono font-black uppercase px-1.5 py-0.5 bg-yellow-100 text-yellow-900 border border-yellow-300"
                                  >
                                    {pm.method}: KES {Number(pm.amount).toLocaleString()}
                                    {pm.mpesa_ref ? ` (${pm.mpesa_ref})` : ""}
                                  </span>
                                ))}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* TAB 4: PAYMENT METHODS */}
              {activeTab === "payments" && (
                <div className="space-y-3">
                  <p className="text-xs font-black uppercase text-[var(--brand-navy)]">
                    Payment Breakdown & Tender Distribution
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {paymentBreakdown.map((pm: any, idx: number) => {
                      const methodColors: Record<string, string> = {
                        cash: "bg-emerald-50 border-emerald-600 text-emerald-950",
                        mpesa: "bg-green-50 border-green-600 text-green-950",
                        tab: "bg-purple-50 border-purple-600 text-purple-950"
                      };

                      return (
                        <div
                          key={idx}
                          className={`border-3 p-4 shadow-(--shadow-brut-xs) ${methodColors[pm.method] || "bg-white border-[var(--brand-navy)]"}`}
                        >
                          <span className="text-[10px] font-black uppercase tracking-wider block">
                            {pm.method?.toUpperCase()} PAYMENT
                          </span>
                          <p className="text-xl font-mono font-black mt-1">
                            KES {pm.amount.toLocaleString()}
                          </p>
                          <p className="text-[10px] font-mono mt-1 opacity-80">
                            {pm.count} {pm.count === 1 ? "transaction" : "transactions"}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* BOTTOM DRAWER FOOTER */}
        <div className="bg-stone-100 p-4 border-t-3 border-[var(--brand-navy)] flex justify-between items-center sticky bottom-0 z-20">
          <span className="text-[11px] font-mono font-bold text-[var(--brand-navy-light)] uppercase">
            {vendor?.name || "VENDOR"} · AUDIT INSPECTOR
          </span>
          <button
            onClick={onClose}
            className="px-5 py-2 bg-[var(--brand-navy)] text-white text-xs font-black uppercase hover:bg-yellow-300 hover:text-[var(--brand-navy)] transition-colors border-2 border-[var(--brand-navy)]"
          >
            CLOSE
          </button>
        </div>
      </div>

      {/* QUICK SETTLEMENT MODAL */}
      {showSettleModal && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-[var(--brand-off-white)] border-4 border-[var(--brand-navy)] w-full max-w-sm p-5 shadow-(--shadow-brut-xl)">
            <h3 className="text-lg font-black uppercase border-b-2 border-[var(--brand-navy)] pb-2 mb-3">
              Record Vendor Settlement
            </h3>
            <p className="text-xs font-bold uppercase text-[var(--brand-navy-light)] mb-3">
              Vendor: <strong>{vendor?.name}</strong>
            </p>
            <form onSubmit={handleSettleSubmit} className="space-y-3">
              <div>
                <label className="text-[10px] font-black uppercase block mb-1">Settlement Amount (KES)</label>
                <input
                  type="number"
                  min="1"
                  required
                  value={settleAmount}
                  onChange={(e) => setSettleAmount(e.target.value)}
                  placeholder="e.g. 320"
                  className="w-full border-2 border-[var(--brand-navy)] px-3 py-2 font-mono text-base font-bold focus:outline-none"
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowSettleModal(false)}
                  className="flex-1 py-2 border-2 border-[var(--brand-navy)] text-xs font-black uppercase hover:bg-stone-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={settling}
                  className="flex-1 py-2 bg-[var(--brand-navy)] text-white text-xs font-black uppercase border-2 border-[var(--brand-navy)] hover:bg-yellow-300 hover:text-[var(--brand-navy)] transition-colors disabled:opacity-40"
                >
                  {settling ? "SAVING..." : "CONFIRM PAYMENT"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
