"use client";

import React, { useState, useEffect } from "react";
import { HandCoins, DollarSign, CheckCircle } from "lucide-react";
import Link from "next/link";

export default function AdminSettlementsPage() {
  const [settlements, setSettlements] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSettleModal, setShowSettleModal] = useState<any>(null);
  const [settleAmount, setSettleAmount] = useState("");

  useEffect(() => {
    fetch("/api/admin/settlements")
      .then((res) => res.json())
      .then((data) => {
        setSettlements(data);
        setLoading(false);
      });
  }, []);

  const handleSettle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showSettleModal) return;
    try {
      const res = await fetch("/api/admin/settlements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          vendor_id: showSettleModal.vendor_id, 
          event_id: showSettleModal.event_id, 
          amount: Number(settleAmount) 
        }),
      });
      if (res.ok) {
        setShowSettleModal(null);
        setSettleAmount("");
        const data = await fetch("/api/admin/settlements").then(r => r.json());
        setSettlements(data);
      }
    } catch (err) {}
  };

  return (
    <div className="w-full min-h-screen bg-brand-off-white text-brand-navy p-6 font-mono">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between border-b-4 border-brand-navy pb-4">
          <div className="flex items-center gap-3">
            <Link href="/admin/dashboard" className="text-brand-navy hover:bg-brand-accent p-2 border-2 border-brand-navy transition-colors">
              &larr; Back
            </Link>
            <h1 className="text-3xl font-display uppercase flex items-center gap-2"><HandCoins className="w-8 h-8"/> Settlements</h1>
          </div>
        </div>

        {loading ? (
          <div className="p-12 text-center text-xl font-bold uppercase animate-pulse">Loading Settlements...</div>
        ) : (
          <div className="overflow-x-auto border-4 border-brand-navy bg-white shadow-(--shadow-brut-md)">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-brand-navy text-brand-off-white uppercase text-sm tracking-wider">
                  <th className="p-4 border-b-4 border-brand-navy">Vendor</th>
                  <th className="p-4 border-b-4 border-brand-navy text-right">Gross Sales</th>
                  <th className="p-4 border-b-4 border-brand-navy text-right">Commission</th>
                  <th className="p-4 border-b-4 border-brand-navy text-right">Settled</th>
                  <th className="p-4 border-b-4 border-brand-navy text-right">Owed</th>
                  <th className="p-4 border-b-4 border-brand-navy text-center">Action</th>
                </tr>
              </thead>
              <tbody>
                {settlements.map((s) => {
                  const owed = Number(s.commission_owed) - Number(s.settled_amount);
                  return (
                    <tr key={s.id} className="border-b-2 border-brand-navy border-dashed hover:bg-brand-accent/10 transition-colors">
                      <td className="p-4 font-bold uppercase">{s.vendors?.name || `Vendor #${s.vendor_id}`}</td>
                      <td className="p-4 text-right font-mono">KES {Number(s.total_sales).toLocaleString()}</td>
                      <td className="p-4 text-right font-mono">KES {Number(s.commission_owed).toLocaleString()}</td>
                      <td className="p-4 text-right font-mono text-green-700">KES {Number(s.settled_amount).toLocaleString()}</td>
                      <td className="p-4 text-right font-mono font-bold text-red-600">KES {owed.toLocaleString()}</td>
                      <td className="p-4 text-center">
                        <button
                          onClick={() => { setShowSettleModal(s); setSettleAmount(owed.toString()); }}
                          disabled={owed <= 0}
                          className="bg-brand-navy text-brand-accent px-3 py-1 text-xs uppercase font-bold hover:bg-brand-accent hover:text-brand-navy border-2 border-transparent hover:border-brand-navy disabled:opacity-30 transition-all"
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

        {showSettleModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-navy/80 backdrop-blur-sm p-4">
            <div className="bg-brand-off-white border-4 border-brand-navy w-full max-w-sm p-6 shadow-(--shadow-brut-xl-accent)">
              <h2 className="text-2xl font-display uppercase mb-2 border-b-2 border-brand-navy pb-2">Record Settlement</h2>
              <p className="text-sm mb-4 font-bold">Vendor: {showSettleModal.vendors?.name}</p>
              <form onSubmit={handleSettle} className="space-y-4">
                <div>
                  <label className="block text-sm font-bold uppercase mb-1">Amount to Settle (KES)</label>
                  <input type="number" required value={settleAmount} onChange={e => setSettleAmount(e.target.value)} className="w-full border-2 border-brand-navy p-2 bg-white focus:outline-none focus:ring-4 focus:ring-brand-accent font-mono text-lg" />
                </div>
                <div className="flex gap-4 pt-4">
                  <button type="submit" className="flex-1 bg-brand-navy text-brand-off-white border-2 border-brand-navy font-bold uppercase p-3 hover:bg-brand-accent hover:text-brand-navy transition-colors">Record</button>
                  <button type="button" onClick={() => setShowSettleModal(null)} className="flex-1 bg-transparent border-2 border-brand-navy font-bold uppercase p-3 hover:bg-brand-navy/10 transition-colors">Cancel</button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
