"use client";

import React, { useState, useEffect } from "react";
import { HandCoins, DollarSign, CheckCircle, RefreshCw, Calendar } from "lucide-react";
import Link from "next/link";

export default function AdminSettlementsPage() {
  const [settlements, setSettlements] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [showSettleModal, setShowSettleModal] = useState<any>(null);
  const [settleAmount, setSettleAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);

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

  const handleSettle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showSettleModal || submitting) return;
    const numAmount = Number(settleAmount);
    if (!numAmount || numAmount <= 0) return;

    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/settlements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          assignmentId: showSettleModal.id,
          vendor_id: showSettleModal.vendor_id, 
          event_id: showSettleModal.event_id, 
          amount: numAmount 
        }),
      });
      if (res.ok) {
        setShowSettleModal(null);
        setSettleAmount("");
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

  const totalGross = settlements.reduce((s, row) => s + (Number(row.total_sales) || 0), 0);
  const totalCommission = settlements.reduce((s, row) => s + (Number(row.commission_owed) || 0), 0);
  const totalSettled = settlements.reduce((s, row) => s + (Number(row.settled_amount) || 0), 0);
  const totalOwed = Math.max(0, totalCommission - totalSettled);

  return (
    <div className="w-full min-h-screen bg-brand-off-white text-brand-navy p-4 md:p-6 font-mono">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header Bar */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b-4 border-brand-navy pb-4 gap-4">
          <div className="flex items-center gap-3">
            <Link 
              href="/admin/dashboard" 
              className="text-brand-navy hover:bg-brand-accent p-2 border-2 border-brand-navy font-bold uppercase transition-colors shadow-(--shadow-brut-xs)"
            >
              &larr; Back
            </Link>
            <h1 className="text-2xl md:text-3xl font-display uppercase flex items-center gap-2">
              <HandCoins className="w-7 h-7 text-brand-navy"/> Vendor Settlements
            </h1>
          </div>

          {/* Event Filter & Refresh */}
          <div className="flex items-center gap-2 w-full sm:w-auto">
            {events.length > 0 && (
              <div className="flex items-center gap-1.5 border-2 border-brand-navy bg-white px-2 py-1">
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
              className="p-2 border-2 border-brand-navy bg-white hover:bg-brand-accent transition-colors shadow-(--shadow-brut-xs)"
              title="Refresh Settlements"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Aggregate KPI Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
          <div className="border-4 border-brand-navy p-3 bg-white shadow-(--shadow-brut-sm)">
            <p className="text-[10px] uppercase font-bold text-brand-navy/60">Total Gross Sales</p>
            <p className="text-lg md:text-xl font-bold font-mono text-brand-navy mt-1">
              KES {totalGross.toLocaleString()}
            </p>
          </div>
          <div className="border-4 border-brand-navy p-3 bg-white shadow-(--shadow-brut-sm)">
            <p className="text-[10px] uppercase font-bold text-brand-navy/60">Commission Owed</p>
            <p className="text-lg md:text-xl font-bold font-mono text-brand-navy mt-1">
              KES {totalCommission.toLocaleString()}
            </p>
          </div>
          <div className="border-4 border-brand-navy p-3 bg-white shadow-(--shadow-brut-sm)">
            <p className="text-[10px] uppercase font-bold text-brand-navy/60">Settled Amount</p>
            <p className="text-lg md:text-xl font-bold font-mono text-green-700 mt-1">
              KES {totalSettled.toLocaleString()}
            </p>
          </div>
          <div className="border-4 border-brand-navy p-3 bg-white shadow-(--shadow-brut-sm)">
            <p className="text-[10px] uppercase font-bold text-brand-navy/60">Outstanding Due</p>
            <p className="text-lg md:text-xl font-bold font-mono text-red-600 mt-1">
              KES {totalOwed.toLocaleString()}
            </p>
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
          <div className="overflow-x-auto border-4 border-brand-navy bg-white shadow-(--shadow-brut-md)">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-brand-navy text-brand-off-white uppercase text-xs md:text-sm tracking-wider">
                  <th className="p-3 md:p-4 border-b-4 border-brand-navy">Vendor</th>
                  <th className="p-3 md:p-4 border-b-4 border-brand-navy text-right">Gross Sales</th>
                  <th className="p-3 md:p-4 border-b-4 border-brand-navy text-right">Commission</th>
                  <th className="p-3 md:p-4 border-b-4 border-brand-navy text-right">Settled</th>
                  <th className="p-3 md:p-4 border-b-4 border-brand-navy text-right">Owed</th>
                  <th className="p-3 md:p-4 border-b-4 border-brand-navy text-center">Action</th>
                </tr>
              </thead>
              <tbody>
                {settlements.map((s) => {
                  const gross = Number(s.total_sales) || 0;
                  const comm = Number(s.commission_owed) || 0;
                  const settled = Number(s.settled_amount) || 0;
                  const owed = Math.max(0, comm - settled);
                  const vendorName = s.vendor_name || s.vendors?.name || `Vendor #${s.vendor_id}`;

                  return (
                    <tr key={s.id || `v-${s.vendor_id}-${s.event_id}`} className="border-b-2 border-brand-navy border-dashed hover:bg-brand-accent/10 transition-colors">
                      <td className="p-3 md:p-4 font-bold uppercase">
                        <div>{vendorName}</div>
                        {s.event_title && (
                          <div className="text-[10px] text-brand-navy/60 font-normal">
                            Event: {s.event_title}
                          </div>
                        )}
                      </td>
                      <td className="p-3 md:p-4 text-right font-mono">KES {gross.toLocaleString()}</td>
                      <td className="p-3 md:p-4 text-right font-mono">KES {comm.toLocaleString()}</td>
                      <td className="p-3 md:p-4 text-right font-mono text-green-700">KES {settled.toLocaleString()}</td>
                      <td className="p-3 md:p-4 text-right font-mono font-bold text-red-600">KES {owed.toLocaleString()}</td>
                      <td className="p-3 md:p-4 text-center">
                        <button
                          onClick={() => { setShowSettleModal(s); setSettleAmount(owed > 0 ? owed.toString() : ""); }}
                          disabled={owed <= 0}
                          className="bg-brand-navy text-brand-accent px-3 py-1 text-xs uppercase font-bold hover:bg-brand-accent hover:text-brand-navy border-2 border-brand-navy disabled:opacity-30 disabled:border-transparent transition-all shadow-(--shadow-brut-xs)"
                        >
                          Settle
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Settle Modal */}
        {showSettleModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-navy/80 backdrop-blur-sm p-4">
            <div className="bg-brand-off-white border-4 border-brand-navy w-full max-w-sm p-6 shadow-(--shadow-brut-xl-accent)">
              <h2 className="text-2xl font-display uppercase mb-2 border-b-2 border-brand-navy pb-2">
                Record Settlement
              </h2>
              <p className="text-xs mb-4 font-bold uppercase text-brand-navy/80">
                Vendor: {showSettleModal.vendor_name || showSettleModal.vendors?.name || `Vendor #${showSettleModal.vendor_id}`}
              </p>
              <form onSubmit={handleSettle} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold uppercase mb-1">
                    Amount to Pay Vendor (KES)
                  </label>
                  <input 
                    type="number" 
                    required 
                    min="1"
                    placeholder="e.g. 5000"
                    value={settleAmount} 
                    onChange={e => setSettleAmount(e.target.value)} 
                    className="w-full border-2 border-brand-navy p-2 bg-white focus:outline-none focus:ring-4 focus:ring-brand-accent font-mono text-lg" 
                  />
                </div>
                <div className="flex gap-4 pt-4">
                  <button 
                    type="submit" 
                    disabled={submitting}
                    className="flex-1 bg-brand-navy text-brand-accent border-2 border-brand-navy font-bold uppercase p-3 hover:bg-brand-accent hover:text-brand-navy transition-colors disabled:opacity-40"
                  >
                    {submitting ? "Saving..." : "Record Payment"}
                  </button>
                  <button 
                    type="button" 
                    disabled={submitting}
                    onClick={() => setShowSettleModal(null)} 
                    className="flex-1 bg-transparent border-2 border-brand-navy font-bold uppercase p-3 hover:bg-brand-navy/10 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
