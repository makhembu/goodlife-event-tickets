"use client";

import React, { useState, useEffect } from "react";
import { 
  HandCoins, 
  DollarSign, 
  CheckCircle2, 
  RefreshCw, 
  Calendar, 
  ExternalLink, 
  HelpCircle, 
  Smartphone, 
  Banknote, 
  Shield, 
  Store, 
  ArrowDownLeft, 
  ArrowUpRight, 
  AlertCircle,
  TrendingUp,
  Receipt
} from "lucide-react";
import Link from "next/link";
import VendorDetailDrawer from "@/components/admin/VendorDetailDrawer";

export default function AdminSettlementsPage() {
  const [settlements, setSettlements] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [showExplainer, setShowExplainer] = useState(true);
  
  // Settle Modal State
  const [showSettleModal, setShowSettleModal] = useState<any>(null);
  const [settleAmount, setSettleAmount] = useState("");
  const [settleMode, setSettleMode] = useState<"add" | "set">("add");
  const [settleNote, setSettleNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Vendor Drawer & POS Takeover
  const [selectedDrawerVendorId, setSelectedDrawerVendorId] = useState<number | null>(null);
  const [takingOverVendorId, setTakingOverVendorId] = useState<number | null>(null);

  // Load events list
  useEffect(() => {
    fetch("/api/events")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setEvents(data);
          const active = data.find((e: any) => e.is_active) || data[0];
          if (active) setSelectedEventId(active.id.toString());
        }
      })
      .catch((e) => console.error("Error loading events:", e));
  }, []);

  const loadSettlements = (eventId?: string) => {
    setLoading(true);
    const targetEvent = eventId !== undefined ? eventId : selectedEventId;
    const url = targetEvent ? `/api/admin/settlements?eventId=${targetEvent}` : "/api/admin/settlements";
    
    fetch(url)
      .then((res) => res.json())
      .then((data) => {
        setSettlements(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Error loading settlements:", err);
        setSettlements([]);
        setLoading(false);
      });
  };

  useEffect(() => {
    loadSettlements(selectedEventId);
  }, [selectedEventId]);

  // Admin POS Takeover
  const handleQuickLoginAsVendor = async (vendorId: number) => {
    setTakingOverVendorId(vendorId);
    try {
      const res = await fetch(`/api/admin/vendors/${vendorId}/login-as`, {
        method: "POST"
      });
      const data = await res.json();
      if (res.ok && data.success) {
        window.location.href = data.redirectUrl || "/vendor/sell";
      } else {
        alert(data.error || "Failed to switch to vendor session");
        setTakingOverVendorId(null);
      }
    } catch (err: any) {
      alert(err.message || "Network error logging into vendor POS");
      setTakingOverVendorId(null);
    }
  };

  const handleSettle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showSettleModal || submitting) return;
    const numAmount = Number(settleAmount);
    if (isNaN(numAmount) || numAmount < 0) {
      alert("Please enter a valid non-negative amount");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/settlements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          assignmentId: showSettleModal.id,
          vendor_id: showSettleModal.vendor_id, 
          event_id: showSettleModal.event_id, 
          amount: numAmount,
          mode: settleMode,
          note: settleNote
        }),
      });
      if (res.ok) {
        setShowSettleModal(null);
        setSettleAmount("");
        setSettleNote("");
        setSettleMode("add");
        loadSettlements();
      } else {
        const errData = await res.json().catch(() => ({}));
        alert(errData.error || "Failed to record settlement");
      }
    } catch (err) {
      alert("Network error recording settlement");
    } finally {
      setSubmitting(false);
    }
  };

  // Helper calculations for each settlement record
  const getSettlementMetrics = (s: any) => {
    const grossSales = Number(s.total_sales) || 0;
    const orderCount = Number(s.order_count) || 0;
    const cashCollected = Number(s.cash_collected) || 0;
    const mpesaCollected = Number(s.mpesa_collected) || 0;
    const tabCollected = Number(s.tab_collected) || 0;
    const digitalHeld = mpesaCollected + tabCollected;
    
    const commRate = Number(s.commission_rate) || 10;
    const commissionCut = Number(s.commission_owed) || Math.round((grossSales * commRate) / 100);
    const vendorNetShare = Number(s.vendor_net_share) || (grossSales - commissionCut);
    const settledAmount = Number(s.settled_amount) || 0;

    // Gross Payout Due (before subtracting past settlements)
    // Goodlife collected digitalHeld. Goodlife retains commissionCut.
    // So Goodlife must pay vendor: digitalHeld - commissionCut
    const grossPayoutDue = digitalHeld - commissionCut;
    
    // Remaining Net Balance:
    let pendingDue = 0;
    let direction: "organizer_pays_vendor" | "vendor_pays_organizer" | "cleared" = "cleared";

    if (grossPayoutDue > 0) {
      // Goodlife holds more digital money than its commission cut -> Goodlife owes vendor
      direction = "organizer_pays_vendor";
      pendingDue = Math.max(0, grossPayoutDue - settledAmount);
    } else if (grossPayoutDue < 0) {
      // Vendor collected physical cash exceeding their net share -> Vendor owes Goodlife commission
      direction = "vendor_pays_organizer";
      const cashCommDue = Math.abs(grossPayoutDue);
      pendingDue = Math.max(0, cashCommDue - settledAmount);
    } else {
      direction = "cleared";
      pendingDue = 0;
    }

    const isFullyCleared = (grossSales > 0 && pendingDue === 0) || (grossSales === 0);

    return {
      grossSales,
      orderCount,
      cashCollected,
      mpesaCollected,
      tabCollected,
      digitalHeld,
      commRate,
      commissionCut,
      vendorNetShare,
      settledAmount,
      grossPayoutDue,
      pendingDue,
      direction,
      isFullyCleared
    };
  };

  // Aggregate Metrics across all vendors
  const totalGross = settlements.reduce((sum, r) => sum + (Number(r.total_sales) || 0), 0);
  const totalDigitalHeld = settlements.reduce((sum, r) => sum + (Number(r.digital_collected) || 0), 0);
  const totalCashHeld = settlements.reduce((sum, r) => sum + (Number(r.cash_collected) || 0), 0);
  const totalCommission = settlements.reduce((sum, r) => sum + (Number(r.commission_owed) || 0), 0);
  const totalSettled = settlements.reduce((sum, r) => sum + (Number(r.settled_amount) || 0), 0);
  
  // Total pending payouts still owed to vendors
  const totalPendingPayouts = settlements.reduce((sum, r) => {
    const m = getSettlementMetrics(r);
    return sum + (m.direction === "organizer_pays_vendor" ? m.pendingDue : 0);
  }, 0);

  return (
    <div className="w-full min-h-screen bg-brand-off-white text-brand-navy p-4 md:p-6 font-mono">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Header Bar */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b-4 border-brand-navy pb-4 gap-4">
          <div className="flex items-center gap-3">
            <Link 
              href="/admin/dashboard" 
              className="text-brand-navy hover:bg-brand-accent p-2 border-2 border-brand-navy font-bold uppercase transition-colors shadow-(--shadow-brut-xs)"
            >
              &larr; Back
            </Link>
            <div>
              <h1 className="text-2xl md:text-3xl font-display uppercase flex items-center gap-2">
                <HandCoins className="w-7 h-7 text-brand-navy"/> Stall Settlements & Payouts
              </h1>
              <p className="text-xs text-brand-navy/60 font-bold uppercase mt-0.5">
                Vendor Gross Sales, Festival Commissions & Cash vs Digital Reconciliation
              </p>
            </div>
          </div>

          {/* Event Filter & Refresh */}
          <div className="flex items-center gap-2 w-full sm:w-auto">
            {events.length > 0 && (
              <div className="flex items-center gap-1.5 border-2 border-brand-navy bg-white px-2 py-1 shadow-(--shadow-brut-xs)">
                <Calendar className="w-4 h-4 text-brand-navy/60" />
                <select
                  value={selectedEventId}
                  onChange={(e) => setSelectedEventId(e.target.value)}
                  className="font-bold text-xs uppercase bg-transparent outline-none cursor-pointer"
                >
                  <option value="">All Events</option>
                  {events.map((evt) => (
                    <option key={evt.id} value={evt.id.toString()}>
                      {evt.title} {evt.is_active ? "(LIVE)" : ""}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <button
              onClick={() => loadSettlements()}
              className="p-2 border-2 border-brand-navy bg-white hover:bg-brand-accent transition-colors shadow-(--shadow-brut-xs) cursor-pointer"
              title="Refresh Settlements"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* SETTLEMENT EXPLAINER / GUIDE ACCORDION */}
        <div className="border-4 border-brand-navy bg-white p-4 md:p-5 shadow-(--shadow-brut-sm)">
          <div 
            className="flex items-center justify-between cursor-pointer select-none"
            onClick={() => setShowExplainer(!showExplainer)}
          >
            <div className="flex items-center gap-2">
              <HelpCircle className="w-5 h-5 text-brand-navy" />
              <h2 className="font-display uppercase text-sm md:text-base font-black tracking-wide">
                HOW STALL SETTLEMENTS WORK AT GOODLIFE (CLICK TO {showExplainer ? "COLLAPSE" : "EXPAND"})
              </h2>
            </div>
            <span className="text-xs font-bold uppercase underline">
              {showExplainer ? "Hide Explainer ▲" : "Show Explainer ▼"}
            </span>
          </div>

          {showExplainer && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4 pt-4 border-t-2 border-brand-navy border-dashed text-xs leading-relaxed">
              <div className="bg-brand-off-white p-3 border-2 border-brand-navy space-y-1">
                <p className="font-bold uppercase text-brand-navy flex items-center gap-1.5">
                  <DollarSign className="w-4 h-4 text-emerald-700 shrink-0" />
                  1. Gross Sales & 10% Cut
                </p>
                <p className="text-brand-navy/80 text-[11px]">
                  <strong>Gross Sales</strong> is the total value of items sold by the stall. Goodlife retains a <strong>10% festival commission</strong>. The remaining <strong>90% is the Vendor Net Share</strong> that belongs to the vendor.
                </p>
              </div>

              <div className="bg-brand-off-white p-3 border-2 border-brand-navy space-y-1">
                <p className="font-bold uppercase text-brand-navy flex items-center gap-1.5">
                  <Smartphone className="w-4 h-4 text-blue-700 shrink-0" />
                  2. Cash vs Digital (Who Holds What)
                </p>
                <p className="text-brand-navy/80 text-[11px]">
                  <strong>Physical Cash</strong> is kept by the vendor in their cash box. <strong>M-Pesa & Tabs</strong> are collected into Goodlife's bank/till. Goodlife acts as the custodian of all digital receipts.
                </p>
              </div>

              <div className="bg-brand-off-white p-3 border-2 border-brand-navy space-y-1">
                <p className="font-bold uppercase text-brand-navy flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-amber-700 shrink-0" />
                  3. What is Owed & Settled?
                </p>
                <p className="text-brand-navy/80 text-[11px]">
                  <strong>What is Owed:</strong> If Goodlife holds digital money, Goodlife owes the vendor <code className="bg-white px-1 py-0.5 border border-brand-navy font-bold">Digital − 10% Comm</code>. If vendor took all cash, vendor owes Goodlife the 10% cut.
                  <br />
                  <strong>Settled:</strong> Cumulative payouts already sent/transferred.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Aggregate KPI Summary Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 md:gap-4">
          <div className="border-4 border-brand-navy p-3 bg-white shadow-(--shadow-brut-sm)">
            <p className="text-[10px] uppercase font-bold text-brand-navy/60">Total Gross Sales</p>
            <p className="text-lg md:text-xl font-bold font-mono text-brand-navy mt-1">
              KES {totalGross.toLocaleString()}
            </p>
            <p className="text-[9px] text-brand-navy/60 uppercase mt-0.5">All stall sales</p>
          </div>

          <div className="border-4 border-brand-navy p-3 bg-white shadow-(--shadow-brut-sm)">
            <p className="text-[10px] uppercase font-bold text-blue-700">Digital Held (Festival)</p>
            <p className="text-lg md:text-xl font-bold font-mono text-blue-800 mt-1">
              KES {totalDigitalHeld.toLocaleString()}
            </p>
            <p className="text-[9px] text-brand-navy/60 uppercase mt-0.5">M-Pesa & Tabs in Goodlife</p>
          </div>

          <div className="border-4 border-brand-navy p-3 bg-white shadow-(--shadow-brut-sm)">
            <p className="text-[10px] uppercase font-bold text-amber-700">Cash Held (Vendors)</p>
            <p className="text-lg md:text-xl font-bold font-mono text-amber-800 mt-1">
              KES {totalCashHeld.toLocaleString()}
            </p>
            <p className="text-[9px] text-brand-navy/60 uppercase mt-0.5">Physical cash at stalls</p>
          </div>

          <div className="border-4 border-brand-navy p-3 bg-white shadow-(--shadow-brut-sm)">
            <p className="text-[10px] uppercase font-bold text-brand-navy/60">Festival Commission</p>
            <p className="text-lg md:text-xl font-bold font-mono text-brand-navy mt-1">
              KES {totalCommission.toLocaleString()}
            </p>
            <p className="text-[9px] text-brand-navy/60 uppercase mt-0.5">Goodlife platform fee</p>
          </div>

          <div className="col-span-2 lg:col-span-1 border-4 border-brand-navy p-3 bg-white shadow-(--shadow-brut-sm)">
            <p className="text-[10px] uppercase font-bold text-emerald-700">Disbursed (Settled)</p>
            <p className="text-lg md:text-xl font-bold font-mono text-emerald-700 mt-1">
              KES {totalSettled.toLocaleString()}
            </p>
            <p className="text-[9px] text-brand-navy/60 uppercase mt-0.5">Cleared payments</p>
          </div>
        </div>

        {/* Table View */}
        {loading ? (
          <div className="p-12 text-center text-xl font-bold uppercase animate-pulse border-4 border-brand-navy bg-white">
            Loading Settlements...
          </div>
        ) : settlements.length === 0 ? (
          <div className="p-12 text-center font-bold uppercase border-4 border-brand-navy bg-white space-y-2">
            <p className="text-base text-brand-navy">No vendor settlements found for this event selection.</p>
            <p className="text-xs text-brand-navy/60">Assign vendors in Staff & POS to start tracking commissions.</p>
          </div>
        ) : (
          <>
            {/* MOBILE CARD LAYOUT (< lg) */}
            <div className="flex flex-col gap-4 lg:hidden">
              {settlements.map((s) => {
                const m = getSettlementMetrics(s);
                const vendorName = s.vendor_name || s.vendors?.name || `Vendor #${s.vendor_id}`;
                return (
                  <div key={s.id || `v-${s.vendor_id}-${s.event_id}`} className="bg-white border-4 border-brand-navy p-4 shadow-(--shadow-brut-md) space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <button type="button" onClick={() => setSelectedDrawerVendorId(s.vendor_id)} className="font-black text-base text-brand-navy underline decoration-2 underline-offset-2 text-left">{vendorName}</button>
                        {s.contact_name && <div className="text-[10px] text-brand-navy/70 mt-0.5">{s.contact_name} {s.contact_phone ? `(${s.contact_phone})` : ""}</div>}
                        {s.event_title && <div className="text-[10px] text-brand-navy/50">{s.event_title}</div>}
                      </div>
                      {m.isFullyCleared ? (<span className="bg-emerald-600 text-white text-[9px] font-black uppercase px-2 py-1 border border-emerald-700 shrink-0">CLEARED</span>) : m.settledAmount > 0 ? (<span className="bg-blue-600 text-white text-[9px] font-black uppercase px-2 py-1 border border-blue-700 shrink-0">PARTIAL</span>) : (<span className="bg-stone-200 text-stone-800 text-[9px] font-black uppercase px-2 py-1 border border-stone-400 shrink-0">UNSETTLED</span>)}
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs border-t-2 border-dashed border-brand-navy pt-3">
                      <div><div className="font-bold text-brand-navy/60 uppercase text-[10px]">Gross Sales</div><div className="font-mono font-black text-brand-navy">KES {m.grossSales.toLocaleString()}</div><div className="text-[10px] text-brand-navy/50">{m.orderCount} orders</div></div>
                      <div><div className="font-bold text-brand-navy/60 uppercase text-[10px]">Commission ({m.commRate}%)</div><div className="font-mono font-black text-brand-navy">KES {m.commissionCut.toLocaleString()}</div><div className="font-mono text-emerald-700 text-[10px]">Net: KES {m.vendorNetShare.toLocaleString()}</div></div>
                      <div><div className="font-bold text-blue-700 uppercase text-[10px] flex items-center gap-1"><Smartphone className="w-3 h-3" /> Digital (Goodlife)</div><div className="font-mono font-black text-blue-900">KES {m.digitalHeld.toLocaleString()}</div><div className="text-[10px] text-blue-700/70">M-Pesa: {m.mpesaCollected.toLocaleString()} � Tab: {m.tabCollected.toLocaleString()}</div></div>
                      <div><div className="font-bold text-amber-700 uppercase text-[10px] flex items-center gap-1"><Banknote className="w-3 h-3" /> Cash (Vendor)</div><div className="font-mono font-black text-amber-900">KES {m.cashCollected.toLocaleString()}</div></div>
                    </div>
                    <div className="border-t-2 border-dashed border-brand-navy pt-3">
                      {m.direction === "organizer_pays_vendor" ? (<div className="flex items-center justify-between gap-2"><span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-900 border border-emerald-500 text-[10px] font-black uppercase px-2 py-0.5"><ArrowDownLeft className="w-3 h-3 text-emerald-700" /> GOODLIFE OWES VENDOR</span><span className="font-mono font-black text-emerald-800 text-base shrink-0">KES {m.pendingDue.toLocaleString()}</span></div>) : m.direction === "vendor_pays_organizer" ? (<div className="flex items-center justify-between gap-2"><span className="inline-flex items-center gap-1 bg-amber-100 text-amber-900 border border-amber-500 text-[10px] font-black uppercase px-2 py-0.5"><ArrowUpRight className="w-3 h-3 text-amber-700" /> VENDOR OWES GOODLIFE</span><span className="font-mono font-black text-amber-800 text-base shrink-0">KES {m.pendingDue.toLocaleString()}</span></div>) : (<div className="flex items-center gap-2 text-gray-600 text-[10px] font-bold uppercase"><CheckCircle2 className="w-4 h-4" /> FULLY BALANCED</div>)}
                      <div className="text-[10px] text-brand-navy/60 mt-1">Settled: <span className="font-mono font-bold text-emerald-700">KES {m.settledAmount.toLocaleString()}</span></div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 border-t-2 border-dashed border-brand-navy pt-3">
                      <button type="button" onClick={() => { setShowSettleModal(s); setSettleAmount(m.pendingDue > 0 ? m.pendingDue.toString() : ""); setSettleMode("add"); setSettleNote(""); }} className={`py-2 text-xs uppercase font-black border-2 border-brand-navy shadow-(--shadow-brut-xs) cursor-pointer ${m.direction === "organizer_pays_vendor" ? "bg-emerald-400 text-brand-navy" : m.direction === "vendor_pays_organizer" ? "bg-amber-400 text-brand-navy" : "bg-white text-brand-navy"}`}>{m.direction === "organizer_pays_vendor" ? "RECORD PAYOUT" : m.direction === "vendor_pays_organizer" ? "COLLECT COMM" : "SETTLE"}</button>
                      <button type="button" onClick={() => setSelectedDrawerVendorId(s.vendor_id)} className="py-2 bg-white text-brand-navy border-2 border-brand-navy text-xs font-bold uppercase hover:bg-yellow-300 shadow-(--shadow-brut-xs) flex items-center justify-center gap-1 cursor-pointer"><TrendingUp className="w-3 h-3" /> AUDIT</button>
                      <button type="button" onClick={() => handleQuickLoginAsVendor(s.vendor_id)} disabled={takingOverVendorId === s.vendor_id} className="col-span-2 py-1.5 bg-brand-navy text-brand-accent text-[10px] font-black uppercase border border-brand-navy flex items-center justify-center gap-1 hover:bg-brand-accent hover:text-brand-navy transition-colors cursor-pointer"><Store className="w-3 h-3" /> {takingOverVendorId === s.vendor_id ? "TAKING OVER..." : "POS TAKEOVER"}</button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* DESKTOP TABLE (lg+) */}
            <div className="hidden lg:block overflow-x-auto border-4 border-brand-navy bg-white shadow-(--shadow-brut-md)">
            <table className="w-full text-left border-collapse min-w-[900px]">
              <thead>
                <tr className="bg-brand-navy text-brand-off-white uppercase text-xs tracking-wider">
                  <th className="p-3 border-b-4 border-brand-navy">Stall / Vendor</th>
                  <th className="p-3 border-b-4 border-brand-navy text-right">Gross Sales</th>
                  <th className="p-3 border-b-4 border-brand-navy">Money Location (Who Holds What)</th>
                  <th className="p-3 border-b-4 border-brand-navy text-right">10% Comm & Net</th>
                  <th className="p-3 border-b-4 border-brand-navy">Settlement Position (Who Owes Who)</th>
                  <th className="p-3 border-b-4 border-brand-navy text-right">Settled to Date</th>
                  <th className="p-3 border-b-4 border-brand-navy text-center">Action</th>
                </tr>
              </thead>
              <tbody>
                {settlements.map((s) => {
                  const m = getSettlementMetrics(s);
                  const vendorName = s.vendor_name || s.vendors?.name || `Vendor #${s.vendor_id}`;

                  return (
                    <tr 
                      key={s.id || `v-${s.vendor_id}-${s.event_id}`} 
                      className="border-b-2 border-brand-navy border-dashed hover:bg-yellow-50/60 transition-colors"
                    >
                      {/* Stall & Vendor Details */}
                      <td className="p-3 align-top">
                        <div 
                          className="cursor-pointer group"
                          onClick={() => setSelectedDrawerVendorId(s.vendor_id)}
                          title="Click to view full vendor stock, velocity & sales audit"
                        >
                          <div className="flex items-center gap-1.5">
                            <span className="text-brand-navy underline decoration-2 underline-offset-2 group-hover:text-blue-700 font-black text-sm">
                              {vendorName}
                            </span>
                            <ExternalLink className="w-3.5 h-3.5 text-brand-navy/50 group-hover:text-blue-700 shrink-0" />
                          </div>
                        </div>

                        {s.contact_name && (
                          <div className="text-[10px] text-brand-navy/70 font-normal mt-0.5">
                            Contact: <strong>{s.contact_name}</strong> {s.contact_phone ? `(${s.contact_phone})` : ""}
                          </div>
                        )}
                        {s.event_title && (
                          <div className="text-[10px] text-brand-navy/50 font-normal">
                            Event: {s.event_title}
                          </div>
                        )}

                        <button
                          type="button"
                          onClick={() => handleQuickLoginAsVendor(s.vendor_id)}
                          disabled={takingOverVendorId === s.vendor_id}
                          className="mt-1.5 inline-flex items-center gap-1 text-[9px] font-black uppercase bg-brand-navy text-brand-accent px-1.5 py-0.5 hover:bg-brand-accent hover:text-brand-navy border border-brand-navy transition-colors cursor-pointer"
                          title="Open POS Terminal & sell as this vendor"
                        >
                          <Store className="w-2.5 h-2.5" />
                          {takingOverVendorId === s.vendor_id ? "TAKING OVER..." : "POS TAKEOVER ↗"}
                        </button>
                      </td>

                      {/* Gross Sales */}
                      <td className="p-3 text-right font-mono font-bold align-top">
                        <div className="text-sm font-black text-brand-navy">
                          KES {m.grossSales.toLocaleString()}
                        </div>
                        <div className="text-[10px] font-normal text-brand-navy/60">
                          {m.orderCount} {m.orderCount === 1 ? "order" : "orders"}
                        </div>
                      </td>

                      {/* Money Location (Who holds the money) */}
                      <td className="p-3 align-top">
                        <div className="space-y-1 text-xs">
                          <div className="flex items-center justify-between gap-2 bg-blue-50 border border-blue-200 px-2 py-0.5">
                            <span className="text-[10px] font-bold text-blue-900 flex items-center gap-1">
                              <Smartphone className="w-3 h-3 text-blue-700" /> Digital (Goodlife):
                            </span>
                            <span className="font-mono font-black text-blue-900">
                              KES {m.digitalHeld.toLocaleString()}
                            </span>
                          </div>
                          <div className="text-[9px] text-blue-700/80 px-1 font-mono">
                            M-Pesa: KES {m.mpesaCollected.toLocaleString()} · Tabs: KES {m.tabCollected.toLocaleString()}
                          </div>

                          <div className="flex items-center justify-between gap-2 bg-amber-50 border border-amber-200 px-2 py-0.5">
                            <span className="text-[10px] font-bold text-amber-900 flex items-center gap-1">
                              <Banknote className="w-3 h-3 text-amber-700" /> Cash (Vendor):
                            </span>
                            <span className="font-mono font-black text-amber-900">
                              KES {m.cashCollected.toLocaleString()}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Commission & Vendor Share */}
                      <td className="p-3 text-right font-mono align-top">
                        <div className="text-xs font-bold text-brand-navy">
                          Fee: KES {m.commissionCut.toLocaleString()}
                        </div>
                        <div className="text-[10px] text-brand-navy/60">
                          ({m.commRate}% commission)
                        </div>
                        <div className="text-xs font-bold text-emerald-800 mt-1 pt-1 border-t border-brand-navy/10">
                          Net: KES {m.vendorNetShare.toLocaleString()}
                        </div>
                        <div className="text-[9px] text-emerald-700">
                          (90% vendor share)
                        </div>
                      </td>

                      {/* Settlement Position (WHO OWES WHO) */}
                      <td className="p-3 align-top">
                        {m.direction === "organizer_pays_vendor" ? (
                          <div className="space-y-1">
                            <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-900 border border-emerald-500 text-[10px] font-black uppercase px-2 py-0.5 tracking-wider">
                              <ArrowDownLeft className="w-3 h-3 text-emerald-700" />
                              ORGANIZER PAYS VENDOR
                            </span>
                            <div className="font-mono text-base font-black text-emerald-800">
                              KES {m.pendingDue.toLocaleString()}
                            </div>
                            <div className="text-[9px] text-brand-navy/70 leading-tight">
                              Goodlife holds KES {m.digitalHeld.toLocaleString()} digital funds. Deducts KES {m.commissionCut.toLocaleString()} commission.
                            </div>
                          </div>
                        ) : m.direction === "vendor_pays_organizer" ? (
                          <div className="space-y-1">
                            <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-900 border border-amber-500 text-[10px] font-black uppercase px-2 py-0.5 tracking-wider">
                              <ArrowUpRight className="w-3 h-3 text-amber-700" />
                              VENDOR PAYS ORGANIZER
                            </span>
                            <div className="font-mono text-base font-black text-amber-800">
                              KES {m.pendingDue.toLocaleString()}
                            </div>
                            <div className="text-[9px] text-brand-navy/70 leading-tight">
                              Vendor pocketed KES {m.cashCollected.toLocaleString()} cash at stall. 10% commission remittance due.
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-1">
                            <span className="inline-flex items-center gap-1 bg-gray-100 text-gray-800 border border-gray-400 text-[10px] font-black uppercase px-2 py-0.5 tracking-wider">
                              <CheckCircle2 className="w-3 h-3 text-gray-600" />
                              FULLY SQUARED / CLEARED
                            </span>
                            <div className="font-mono text-sm font-bold text-gray-600">
                              KES 0 DUE
                            </div>
                            <div className="text-[9px] text-gray-500 leading-tight">
                              All payouts and commissions balanced.
                            </div>
                          </div>
                        )}
                      </td>

                      {/* Settled to date */}
                      <td className="p-3 text-right font-mono align-top">
                        <div className="text-xs font-bold text-emerald-700">
                          KES {m.settledAmount.toLocaleString()}
                        </div>
                        <div className="mt-1">
                          {m.isFullyCleared ? (
                            <span className="bg-emerald-600 text-white text-[9px] font-black uppercase px-1.5 py-0.5 border border-emerald-700">
                              CLEARED
                            </span>
                          ) : m.settledAmount > 0 ? (
                            <span className="bg-blue-600 text-white text-[9px] font-black uppercase px-1.5 py-0.5 border border-blue-700">
                              PARTIALLY PAID
                            </span>
                          ) : (
                            <span className="bg-stone-200 text-stone-800 text-[9px] font-black uppercase px-1.5 py-0.5 border border-stone-400">
                              UNSETTLED
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="p-3 text-center align-top">
                        <div className="flex flex-col items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setShowSettleModal(s);
                              setSettleAmount(m.pendingDue > 0 ? m.pendingDue.toString() : "");
                              setSettleMode("add");
                              setSettleNote("");
                            }}
                            className={`w-full px-2.5 py-1 text-xs uppercase font-black border-2 border-brand-navy transition-all shadow-(--shadow-brut-xs) cursor-pointer ${
                              m.direction === "organizer_pays_vendor"
                                ? "bg-emerald-400 hover:bg-emerald-300 text-brand-navy"
                                : m.direction === "vendor_pays_organizer"
                                ? "bg-amber-400 hover:bg-amber-300 text-brand-navy"
                                : "bg-white hover:bg-brand-accent text-brand-navy"
                            }`}
                            title="Record payout disbursement or commission collection"
                          >
                            {m.direction === "organizer_pays_vendor" ? "RECORD PAYOUT" : m.direction === "vendor_pays_organizer" ? "COLLECT COMM" : "UPDATE SETTLED"}
                          </button>

                          <button
                            type="button"
                            onClick={() => setSelectedDrawerVendorId(s.vendor_id)}
                            className="w-full bg-white text-brand-navy hover:bg-yellow-300 px-2 py-0.5 text-[10px] uppercase font-bold border border-brand-navy transition-all shadow-(--shadow-brut-xs) flex items-center justify-center gap-1 cursor-pointer"
                            title="Open Stock, Bestsellers & Sales Audit"
                          >
                            <TrendingUp className="w-3 h-3" /> AUDIT & DATA ↗
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          </>
        )}

        {/* Enhanced Settle / Record Payout Modal */}
        {showSettleModal && (() => {
          const m = getSettlementMetrics(showSettleModal);
          const vName = showSettleModal.vendor_name || showSettleModal.vendors?.name || `Vendor #${showSettleModal.vendor_id}`;

          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-navy/80 backdrop-blur-sm p-4">
              <div className="bg-brand-off-white border-4 border-brand-navy w-full max-w-md p-6 shadow-(--shadow-brut-xl-accent)">
                <div className="flex justify-between items-start border-b-2 border-brand-navy pb-3 mb-4">
                  <div>
                    <h2 className="text-xl md:text-2xl font-display uppercase">
                      {m.direction === "organizer_pays_vendor" ? "Record Vendor Payout" : m.direction === "vendor_pays_organizer" ? "Collect Cash Commission" : "Record Settlement"}
                    </h2>
                    <p className="text-xs font-bold uppercase text-brand-navy/70 mt-0.5">
                      Stall: <span className="text-brand-navy">{vName}</span>
                    </p>
                  </div>
                  <button 
                    onClick={() => setShowSettleModal(null)}
                    className="p-1 border border-brand-navy hover:bg-red-500 hover:text-white transition-colors cursor-pointer"
                  >
                    ✕
                  </button>
                </div>

                {/* Financial Summary Box */}
                <div className="bg-white border-2 border-brand-navy p-3 text-xs space-y-1.5 mb-4">
                  <div className="flex justify-between">
                    <span className="text-brand-navy/60 font-bold uppercase">Total Gross Sales:</span>
                    <span className="font-mono font-bold">KES {m.grossSales.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-blue-700 font-bold uppercase">Digital Funds (Held by Goodlife):</span>
                    <span className="font-mono font-bold text-blue-700">KES {m.digitalHeld.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-amber-700 font-bold uppercase">Cash Sales (Held by Vendor):</span>
                    <span className="font-mono font-bold text-amber-700">KES {m.cashCollected.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-brand-navy/60 font-bold uppercase">Festival Commission (10%):</span>
                    <span className="font-mono font-bold">KES {m.commissionCut.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between pt-1 border-t border-brand-navy/10">
                    <span className="font-bold uppercase text-emerald-800">Vendor Net 90% Share:</span>
                    <span className="font-mono font-black text-emerald-800">KES {m.vendorNetShare.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between pt-1 border-t-2 border-brand-navy border-dashed">
                    <span className="font-black uppercase text-brand-navy">Current Settled to Date:</span>
                    <span className="font-mono font-black text-brand-navy">KES {m.settledAmount.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between bg-yellow-100 p-1.5 border border-yellow-400 font-black">
                    <span className="uppercase text-brand-navy">
                      {m.direction === "organizer_pays_vendor" ? "Net Payout Due Vendor:" : "Commission Due Goodlife:"}
                    </span>
                    <span className="font-mono text-sm text-brand-navy">KES {m.pendingDue.toLocaleString()}</span>
                  </div>
                </div>

                <form onSubmit={handleSettle} className="space-y-4">
                  {/* Settlement Mode Toggle */}
                  <div className="flex border-2 border-brand-navy">
                    <button
                      type="button"
                      onClick={() => setSettleMode("add")}
                      className={`flex-1 py-1.5 text-xs font-black uppercase transition-colors ${settleMode === "add" ? "bg-brand-navy text-brand-off-white" : "bg-white text-brand-navy hover:bg-brand-accent/30"}`}
                    >
                      + Add Payment
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSettleMode("set");
                        setSettleAmount(m.settledAmount.toString());
                      }}
                      className={`flex-1 py-1.5 text-xs font-black uppercase transition-colors border-l-2 border-brand-navy ${settleMode === "set" ? "bg-brand-navy text-brand-off-white" : "bg-white text-brand-navy hover:bg-brand-accent/30"}`}
                    >
                      = Set Total Settled
                    </button>
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase mb-1">
                      {settleMode === "add" ? "Amount to Disburse / Record (KES)" : "Exact Total Settled to Date (KES)"}
                    </label>
                    <input 
                      type="number" 
                      required 
                      min="0"
                      placeholder="e.g. 2080"
                      value={settleAmount} 
                      onChange={e => setSettleAmount(e.target.value)} 
                      className="w-full border-2 border-brand-navy p-2 bg-white focus:outline-none focus:ring-4 focus:ring-brand-accent font-mono text-lg font-bold" 
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase mb-1">
                      Payment Reference / Note (Optional)
                    </label>
                    <input 
                      type="text" 
                      placeholder="e.g. M-Pesa B2C code, bank transfer ref, cash handover"
                      value={settleNote} 
                      onChange={e => setSettleNote(e.target.value)} 
                      className="w-full border-2 border-brand-navy p-2 bg-white focus:outline-none focus:ring-4 focus:ring-brand-accent text-xs" 
                    />
                  </div>

                  <div className="flex gap-3 pt-2">
                    <button 
                      type="submit" 
                      disabled={submitting}
                      className="flex-1 bg-brand-navy text-brand-accent border-2 border-brand-navy font-bold uppercase p-3 hover:bg-brand-accent hover:text-brand-navy transition-colors disabled:opacity-40 shadow-(--shadow-brut-xs) cursor-pointer"
                    >
                      {submitting ? "Saving..." : settleMode === "add" ? "Record Payout" : "Update Settled"}
                    </button>
                    <button 
                      type="button" 
                      disabled={submitting}
                      onClick={() => setShowSettleModal(null)} 
                      className="bg-transparent border-2 border-brand-navy font-bold uppercase px-4 hover:bg-brand-navy/10 transition-colors cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            </div>
          );
        })()}

        {/* Vendor Intelligence & Audit Drawer */}
        <VendorDetailDrawer
          vendorId={selectedDrawerVendorId}
          eventId={selectedEventId}
          isOpen={selectedDrawerVendorId !== null}
          onClose={() => setSelectedDrawerVendorId(null)}
          onSettlementRecorded={() => loadSettlements()}
        />
      </div>
    </div>
  );
}
